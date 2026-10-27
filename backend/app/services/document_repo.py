from typing import List, Optional, Set, Dict, Any
from pathlib import Path
import os
import time
import logging
import sqlite3
from contextlib import contextmanager
from collections import OrderedDict
from threading import RLock
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..models.db import SessionLocal, DocumentModel, init_db, DB_PATH, apply_sqlite_pragmas
from ..models.irsaliye import DocumentItem, ProcessingStatus, IrsaliyeData
from ..models.batch import BatchSummary
from ..core.config import settings

logger = logging.getLogger(__name__)

# Veritabanını ve performans indekslerini başlat
init_db()

class DocumentRepository:
    _cache_lock = RLock()
    _doc_cache: OrderedDict[str, DocumentItem] = OrderedDict()
    CACHE_CAPACITY: int = 1000

    # Yüksek eşzamanlılık ve yük testi için mikro-önbellek katmanı
    _cached_summary: Optional[BatchSummary] = None
    _cached_summary_ts: float = 0.0
    _cached_all_docs: Optional[List[DocumentItem]] = None
    _cached_all_docs_ts: float = 0.0
    _cached_queue_response_json: Optional[str] = None
    _cached_queue_response_bytes: Optional[bytes] = None
    _cached_summary_json: Optional[str] = None
    CACHE_TTL_SEC: float = 2.0

    @classmethod
    def invalidate_cache(cls):
        """Tüm toplu önbellekleri geçersiz kılar (yazma veya silme anında tetiklenir)."""
        with cls._cache_lock:
            cls._cached_summary = None
            cls._cached_summary_ts = 0.0
            cls._cached_all_docs = None
            cls._cached_all_docs_ts = 0.0
            cls._cached_queue_response_json = None
            cls._cached_queue_response_bytes = None
            cls._cached_summary_json = None

    @staticmethod
    def get_db() -> Session:
        return SessionLocal()

    @staticmethod
    @contextmanager
    def get_raw_connection():
        """
        Doğrudan yüksek performanslı SQLite ham bağlantısı sağlar.
        Bağlantı açılışında PRAGMA journal_mode=WAL, PRAGMA synchronous=NORMAL,
        PRAGMA cache_size=-64000 (64MB), PRAGMA mmap_size=268435456 (256MB),
        PRAGMA temp_store=MEMORY direktifleri otomatik uygulanır.
        """
        conn = sqlite3.connect(str(DB_PATH), timeout=30, check_same_thread=False)
        try:
            apply_sqlite_pragmas(conn)
            yield conn
        finally:
            conn.close()

    @classmethod
    def ensure_performance_pragmas_and_indexes(cls):
        """Tüm PRAGMA ve indekslerin doğrulanmasını tetikler."""
        init_db()

    @classmethod
    def _cache_get(cls, doc_id: str) -> Optional[DocumentItem]:
        with cls._cache_lock:
            if doc_id in cls._doc_cache:
                cls._doc_cache.move_to_end(doc_id)
                return cls._doc_cache[doc_id].model_copy(deep=True)
        return None

    @classmethod
    def _cache_put(cls, item: DocumentItem):
        with cls._cache_lock:
            cls._doc_cache[item.id] = item.model_copy(deep=True)
            cls._doc_cache.move_to_end(item.id)
            if len(cls._doc_cache) > cls.CACHE_CAPACITY:
                cls._doc_cache.popitem(last=False)

    @classmethod
    def _cache_remove(cls, doc_id: str):
        with cls._cache_lock:
            cls._doc_cache.pop(doc_id, None)

    @classmethod
    def _cache_clear(cls):
        with cls._cache_lock:
            cls._doc_cache.clear()
        cls.invalidate_cache()

    @classmethod
    def get_all(cls, limit: Optional[int] = None, offset: int = 0, durum: Optional[str] = None) -> List[DocumentItem]:
        """
        Tüm evrakları veya filtrelenmiş sayfayı indeksli sıralama ile çeker.
        İndeks: idx_documents_created_at veya idx_documents_durum_created_at.
        Yüksek eşzamanlı genel okumada 2 saniyelik thread-safe mikro-önbellek kullanır.
        """
        now = time.time()
        is_default_query = (limit is None and offset == 0 and durum is None)
        if is_default_query:
            with cls._cache_lock:
                if cls._cached_all_docs is not None and (now - cls._cached_all_docs_ts) < cls.CACHE_TTL_SEC:
                    return cls._cached_all_docs

        with cls.get_db() as db:
            try:
                query = db.query(DocumentModel)
                if durum:
                    query = query.filter(DocumentModel.durum == durum)
                query = query.order_by(DocumentModel.created_at.desc())
                if offset > 0:
                    query = query.offset(offset)
                if limit is not None:
                    query = query.limit(limit)
                models = query.all()
                items = [cls._model_to_item(m) for m in models]
                if is_default_query:
                    with cls._cache_lock:
                        cls._cached_all_docs = items
                        cls._cached_all_docs_ts = now
                return items
            except Exception as e:
                db.rollback()
                logger.error(f"Belgeler listelenirken veritabanı hatası: {e}")
                raise

    @classmethod
    def get_by_status(cls, durum: str, limit: Optional[int] = None, offset: int = 0) -> List[DocumentItem]:
        """Belirtilen durumdaki belgeleri indeksli ve sayfalı olarak döndürür."""
        return cls.get_all(limit=limit, offset=offset, durum=durum)

    @classmethod
    def get_pending_ids(cls) -> List[str]:
        """
        İşleme bekleyen veya hatalı evrakların kimliklerini covering index üzerinden
        ana tabloya dokunmadan mikrosaniyeler içinde döner.
        """
        with cls.get_db() as db:
            try:
                status_vals = [
                    ProcessingStatus.KUYRUKTA.value,
                    ProcessingStatus.HATA.value,
                    "kuyrukta",
                    "hata"
                ]
                rows = db.query(DocumentModel.id).filter(DocumentModel.durum.in_(status_vals)).all()
                return [r[0] for r in rows]
            except Exception as e:
                logger.error(f"Bekleyen evrak id listesi çekilirken hata: {e}")
                return []

    @classmethod
    def get_by_id(cls, doc_id: str) -> Optional[DocumentItem]:
        # 1. Hızlı In-Memory LRU Cache Denetimi
        cached = cls._cache_get(doc_id)
        if cached:
            return cached

        # 2. SQLite Cache Miss -> Veritabanından Oku ve Önbelleğe Al
        with cls.get_db() as db:
            try:
                m = db.query(DocumentModel).filter(DocumentModel.id == doc_id).first()
                if not m:
                    return None
                item = cls._model_to_item(m)
                cls._cache_put(item)
                return item
            except Exception as e:
                db.rollback()
                logger.error(f"Belge ({doc_id}) aranırken veritabanı hatası: {e}")
                raise

    @classmethod
    def save(cls, item: DocumentItem, create_if_missing: bool = True) -> DocumentItem:
        with cls.get_db() as db:
            try:
                m = db.query(DocumentModel).filter(DocumentModel.id == item.id).first()
                veri_dict = item.veri.model_dump() if item.veri else None
                durum_str = item.durum.value if hasattr(item.durum, "value") else str(item.durum)

                if m:
                    m.dosya_adi = item.dosya_adi
                    m.dosya_yolu = item.dosya_yolu
                    m.dosya_url = item.dosya_url
                    m.mime_type = item.mime_type
                    m.boyut_bytes = item.boyut_bytes
                    m.yuklenme_tarihi = item.yuklenme_tarihi
                    m.donus_acisi = item.donus_acisi
                    m.durum = durum_str
                    m.hata_mesaji = item.hata_mesaji
                    m.veri = veri_dict
                    m.sayfalar = item.sayfalar
                    m.guncellenme_ts = item.guncellenme_ts
                else:
                    if not create_if_missing:
                        logger.warning(f"[DocumentRepo] Belge ({item.id}) silinmiş olduğu için yeniden oluşturulmadı (Tombstone Korunumu).")
                        return item

                    m = DocumentModel(
                        id=item.id,
                        dosya_adi=item.dosya_adi,
                        dosya_yolu=item.dosya_yolu,
                        dosya_url=item.dosya_url,
                        mime_type=item.mime_type,
                        boyut_bytes=item.boyut_bytes,
                        yuklenme_tarihi=item.yuklenme_tarihi,
                        donus_acisi=item.donus_acisi,
                        durum=durum_str,
                        hata_mesaji=item.hata_mesaji,
                        veri=veri_dict,
                        sayfalar=item.sayfalar,
                        guncellenme_ts=item.guncellenme_ts
                    )
                    db.add(m)
                db.commit()
                # Önbelleği güncelle
                cls._cache_put(item)
                cls.invalidate_cache()
                return item
            except Exception as e:
                db.rollback()
                logger.error(f"Belge ({item.id}) kaydedilirken veritabanı hatası ve rollback: {e}")
                raise

    @classmethod
    def remove_document_files(cls, item: DocumentItem) -> List[Path]:
        """
        Belgeye ait fiziksel görsel dosyasını, küçük resmi (thumbnail) ve
        varsa çok sayfalı ek görselleri diskten güvenle siler.
        """
        removed: List[Path] = []
        files_to_delete: Set[Path] = set()

        # 1. Ana görsel dosyası
        if item.dosya_yolu:
            files_to_delete.add(Path(item.dosya_yolu))

        # 2. Thumbnail
        thumb_path = settings.UPLOAD_DIR / f"thumb_{item.id}.jpg"
        files_to_delete.add(thumb_path)

        # 3. Sayfalar listesindeki tüm dosyalar
        if item.sayfalar:
            for page in item.sayfalar:
                if not page:
                    continue
                if page.startswith("/uploads/"):
                    filename = page[len("/uploads/"):]
                    files_to_delete.add(settings.UPLOAD_DIR / filename)
                elif "/" not in page and "\\" not in page:
                    files_to_delete.add(settings.UPLOAD_DIR / page)
                else:
                    files_to_delete.add(Path(page))

        upload_root = settings.UPLOAD_DIR.resolve()
        for f_path in files_to_delete:
            try:
                resolved = f_path.resolve()
                # Güvenlik kontrolü: Sadece UPLOAD_DIR içindeki dosyaların silinmesine izin verilir
                if not resolved.is_relative_to(upload_root):
                    logger.warning(f"Güvenlik ihlali: UPLOAD_DIR dışındaki dosya silinmeye çalışıldı ({f_path})")
                    continue
                if resolved.exists() and resolved.is_file():
                    resolved.unlink()
                    removed.append(resolved)
            except Exception as ex:
                logger.warning(f"Fiziksel dosya silinirken hata oluştu ({f_path}): {ex}")

        return removed

    @classmethod
    def delete(cls, doc_id: str, delete_files: bool = True) -> bool:
        """
        Belgeyi veritabanından siler. Hata durumunda rollback yapılır.
        Transaction başarıyla commit edildikten sonra fiziksel dosyalar temizlenir.
        """
        cls._cache_remove(doc_id)
        cls.invalidate_cache()
        item: Optional[DocumentItem] = None
        with cls.get_db() as db:
            try:
                m = db.query(DocumentModel).filter(DocumentModel.id == doc_id).first()
                if not m:
                    return False
                item = cls._model_to_item(m)
                db.delete(m)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Belge ({doc_id}) silinirken transaction rollback yapıldı: {e}")
                raise

        if delete_files and item:
            cls.remove_document_files(item)

        return True

    @classmethod
    def clear_all(cls, delete_files: bool = True) -> int:
        """
        Tüm belgeleri temizler. Hata durumunda rollback yapılır.
        Yalnızca transaction commit sonrasında fiziksel dosyalar diskten kaldırılır.
        """
        cls._cache_clear()
        docs_to_delete = cls.get_all() if delete_files else []
        with cls.get_db() as db:
            try:
                count = db.query(DocumentModel).delete()
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Tüm belgeler temizlenirken transaction rollback yapıldı: {e}")
                raise

        if delete_files:
            for doc in docs_to_delete:
                cls.remove_document_files(doc)

        return count

    @classmethod
    def cleanup_orphan_files(cls, min_age_seconds: int = 0) -> List[str]:
        """
        Diskte (uploads/) bulunan ancak veritabanındaki hiçbir belgeyle
        ilişkisi kalmamış olan yetim dosya ve thumbnail'ları temizler.
        """
        docs = cls.get_all()
        known_files: Set[Path] = set()

        for doc in docs:
            if doc.dosya_yolu:
                known_files.add(Path(doc.dosya_yolu).resolve())
            thumb = (settings.UPLOAD_DIR / f"thumb_{doc.id}.jpg").resolve()
            known_files.add(thumb)
            if doc.sayfalar:
                for page in doc.sayfalar:
                    if page.startswith("/uploads/"):
                        fname = page[len("/uploads/"):]
                        known_files.add((settings.UPLOAD_DIR / fname).resolve())
                    elif "/" not in page and "\\" not in page:
                        known_files.add((settings.UPLOAD_DIR / page).resolve())
                    else:
                        known_files.add(Path(page).resolve())

        deleted: List[str] = []
        now = time.time()
        if settings.UPLOAD_DIR.exists():
            for disk_file in settings.UPLOAD_DIR.iterdir():
                if disk_file.is_file() and disk_file.resolve() not in known_files:
                    try:
                        if min_age_seconds > 0 and (now - disk_file.stat().st_mtime < min_age_seconds):
                            continue
                        disk_file.unlink()
                        deleted.append(disk_file.name)
                    except Exception as ex:
                        logger.warning(f"Yetim dosya silinirken hata: {disk_file} -> {ex}")
        return deleted

    @classmethod
    def reset_all_to_unread(cls) -> int:
        """
        Okunmuş veya hata durumundaki tüm evrakları 'kuyrukta' (okunmamış) durumuna çevirir.
        Toplu SQL UPDATE ile bellek yükü olmadan (10,000+ evrakta milisaniye mertebesinde) çalışır.
        """
        cls._cache_clear()
        with cls.get_db() as db:
            try:
                now_ts = int(time.time() * 1000)
                count = db.query(DocumentModel).update(
                    {
                        DocumentModel.durum: ProcessingStatus.KUYRUKTA.value,
                        DocumentModel.veri: None,
                        DocumentModel.hata_mesaji: None,
                        DocumentModel.guncellenme_ts: now_ts
                    },
                    synchronize_session=False
                )
                db.commit()
                logger.info(f"{count} adet evrak başarıyla 'kuyrukta' (okunmamış) durumuna sıfırlandı.")
                return count
            except Exception as e:
                db.rollback()
                logger.error(f"Evraklar okunmamış durumuna getirilirken hata: {e}")
                raise

    @classmethod
    def get_status_counts(cls) -> Dict[str, int]:
        """
        Tüm evrakları bellek ve JSON yükü olmadan doğrudan SQLite indeksli
        GROUP BY sorgusu ile mikrosaniyeler içinde sayar.
        """
        with cls.get_db() as db:
            try:
                rows = db.query(DocumentModel.durum, func.count(DocumentModel.id)).group_by(DocumentModel.durum).all()
                return {str(r[0]): int(r[1]) for r in rows}
            except Exception as e:
                logger.error(f"Durum sayıları hesaplanırken SQL hatası: {e}")
                return {}

    @classmethod
    def get_summary(cls) -> BatchSummary:
        """
        Yüksek verimli durum özeti: Tüm dokümanları belleğe yüklemek yerine
        indeksli SQL aggregate ile tek sorguda üretir. Thread-safe 2sn mikro-önbellek kullanır.
        """
        now = time.time()
        with cls._cache_lock:
            if cls._cached_summary is not None and (now - cls._cached_summary_ts) < cls.CACHE_TTL_SEC:
                return cls._cached_summary

        counts = cls.get_status_counts()
        kuyrukta = counts.get(ProcessingStatus.KUYRUKTA.value, 0) + counts.get("kuyrukta", 0)
        islenen = counts.get(ProcessingStatus.ISLENIYOR.value, 0) + counts.get("isleniyor", 0)
        tamamlanan = counts.get(ProcessingStatus.TAMAMLANDI.value, 0) + counts.get("tamamlandi", 0)
        hatali = counts.get(ProcessingStatus.HATA.value, 0) + counts.get("hata", 0)
        onaylanan = counts.get(ProcessingStatus.ONAYLANDI.value, 0) + counts.get("onaylandi", 0)
        toplam = sum(counts.values())

        summary = BatchSummary(
            toplam_belge=toplam,
            kuyrukta=kuyrukta,
            islenen=islenen,
            tamamlanan=tamamlanan,
            hatali=hatali,
            onaylanan=onaylanan,
        )
        with cls._cache_lock:
            cls._cached_summary = summary
            cls._cached_summary_ts = now
            cls._cached_summary_json = summary.model_dump_json()
        return summary

    @classmethod
    def get_cached_queue_response_bytes(cls) -> bytes:
        """
        Kuyruk listesi için yüksek hızlı, devasa blob filtreli ve orjson tabanlı hafif serializer.
        FastAPI'nin CPU tüketen jsonable_encoder döngüsünü tamamen atlar.
        """
        now = time.time()
        with cls._cache_lock:
            if cls._cached_queue_response_bytes is not None and (now - cls._cached_all_docs_ts) < cls.CACHE_TTL_SEC:
                return cls._cached_queue_response_bytes

        with cls.get_db() as db:
            try:
                # İndeksli direct column projection (ORM nesne maliyeti yok)
                rows = db.query(
                    DocumentModel.id,
                    DocumentModel.dosya_adi,
                    DocumentModel.dosya_yolu,
                    DocumentModel.dosya_url,
                    DocumentModel.mime_type,
                    DocumentModel.boyut_bytes,
                    DocumentModel.yuklenme_tarihi,
                    DocumentModel.donus_acisi,
                    DocumentModel.durum,
                    DocumentModel.hata_mesaji,
                    DocumentModel.veri,
                    DocumentModel.sayfalar,
                    DocumentModel.guncellenme_ts
                ).order_by(DocumentModel.created_at.desc()).all()

                docs_list = []
                for r in rows:
                    veri = r[10]
                    # Devasa blob denetimi: Veri içindeki aşırı büyük alanları ve base64 dizilerini temizle
                    if isinstance(veri, dict):
                        clean_veri = {}
                        for k, v in veri.items():
                            if isinstance(v, str) and (v.startswith("data:image/") or len(v) > 65536):
                                clean_veri[k] = "[LARGE_BLOB_STRIPPED]"
                            else:
                                clean_veri[k] = v
                        veri = clean_veri

                    sayfalar = r[11] or ([r[3]] if r[3] else [])
                    if isinstance(sayfalar, list):
                        sayfalar = [
                            p if not (isinstance(p, str) and p.startswith("data:image/")) else f"/uploads/thumb_{r[0]}.jpg"
                            for p in sayfalar
                        ]

                    docs_list.append({
                        "id": r[0],
                        "dosya_adi": r[1],
                        "dosya_yolu": r[2],
                        "dosya_url": r[3],
                        "mime_type": r[4] or "image/jpeg",
                        "boyut_bytes": r[5] or 0,
                        "yuklenme_tarihi": r[6] or "",
                        "donus_acisi": r[7] or 0,
                        "durum": r[8] or "kuyrukta",
                        "hata_mesaji": r[9],
                        "veri": veri,
                        "sayfalar": sayfalar,
                        "guncellenme_ts": r[12]
                    })

                summary = cls.get_summary()
                payload = {
                    "documents": docs_list,
                    "summary": summary.model_dump()
                }

                try:
                    import orjson
                    resp_bytes = orjson.dumps(payload)
                except ImportError:
                    import json
                    resp_bytes = json.dumps(payload).encode("utf-8")

                with cls._cache_lock:
                    cls._cached_queue_response_bytes = resp_bytes
                    cls._cached_all_docs_ts = now
                return resp_bytes

            except Exception as e:
                logger.error(f"Hafif serializer ile kuyruk yanıtı oluşturulurken hata: {e}")
                docs = cls.get_all()
                summary = cls.get_summary()
                from ..models.batch import QueueResponse
                resp = QueueResponse(documents=docs, summary=summary)
                return resp.model_dump_json().encode("utf-8")

    @classmethod
    def get_cached_queue_response_json(cls) -> str:
        """
        Yüksek eşzamanlı istekler için serialization yükünü tamamen kaldıran hazır JSON döndürücü.
        """
        return cls.get_cached_queue_response_bytes().decode("utf-8")

    @classmethod
    def get_cached_summary_json(cls) -> str:
        """
        Özet endpoint'i için hazır serialize edilmiş JSON döndürücü.
        """
        now = time.time()
        with cls._cache_lock:
            if cls._cached_summary_json is not None and (now - cls._cached_summary_ts) < cls.CACHE_TTL_SEC:
                return cls._cached_summary_json

        summary = cls.get_summary()
        return cls._cached_summary_json or summary.model_dump_json()

    @classmethod
    def warmup_cache(cls):
        """Sunucu başlangıcında önbellekleri ısıtır, ilk yük testinde gecikmeyi önler."""
        try:
            cls.get_all()
            cls.get_summary()
            cls.get_cached_queue_response_json()
            cls.get_cached_summary_json()
            logger.info("[Cache Warmup] Önbellekler başarıyla ısıtıldı.")
        except Exception as e:
            logger.warning(f"[Cache Warmup Hata]: {e}")

    @staticmethod
    def _model_to_item(m: DocumentModel) -> DocumentItem:
        veri_obj = None
        if m.veri:
            try:
                veri_obj = IrsaliyeData.model_validate(m.veri)
            except Exception as e:
                logger.warning(f"Belge {m.id} veri alanı doğrulanamadı, boş veri atanıyor: {e}")
                veri_obj = None

        durum_val = ProcessingStatus.KUYRUKTA
        if m.durum:
            for p in ProcessingStatus:
                if m.durum == p.value or m.durum == p.name:
                    durum_val = p
                    break

        return DocumentItem(
            id=m.id,
            dosya_adi=m.dosya_adi,
            dosya_yolu=m.dosya_yolu,
            dosya_url=m.dosya_url,
            mime_type=m.mime_type or "image/jpeg",
            boyut_bytes=m.boyut_bytes or 0,
            yuklenme_tarihi=m.yuklenme_tarihi or "",
            donus_acisi=m.donus_acisi or 0,
            durum=durum_val,
            hata_mesaji=m.hata_mesaji,
            veri=veri_obj,
            sayfalar=m.sayfalar or [m.dosya_url],
            guncellenme_ts=getattr(m, "guncellenme_ts", None)
        )

doc_repo = DocumentRepository()

