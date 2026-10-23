from typing import List, Optional, Set
from pathlib import Path
import os
import time
import logging
from sqlalchemy.orm import Session
from ..models.db import SessionLocal, DocumentModel, init_db
from ..models.irsaliye import DocumentItem, ProcessingStatus, IrsaliyeData
from ..models.batch import BatchSummary
from ..core.config import settings

logger = logging.getLogger(__name__)

# Veritabanını başlat
init_db()

class DocumentRepository:
    @staticmethod
    def get_db() -> Session:
        return SessionLocal()

    @classmethod
    def get_all(cls) -> List[DocumentItem]:
        with cls.get_db() as db:
            try:
                models = db.query(DocumentModel).order_by(DocumentModel.created_at.desc()).all()
                return [cls._model_to_item(m) for m in models]
            except Exception as e:
                db.rollback()
                logger.error(f"Tüm belgeler listelenirken veritabanı hatası: {e}")
                raise

    @classmethod
    def get_by_id(cls, doc_id: str) -> Optional[DocumentItem]:
        with cls.get_db() as db:
            try:
                m = db.query(DocumentModel).filter(DocumentModel.id == doc_id).first()
                if not m:
                    return None
                return cls._model_to_item(m)
            except Exception as e:
                db.rollback()
                logger.error(f"Belge ({doc_id}) aranırken veritabanı hatası: {e}")
                raise

    @classmethod
    def save(cls, item: DocumentItem) -> DocumentItem:
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
    def get_summary(cls) -> BatchSummary:
        docs = cls.get_all()
        return BatchSummary(
            toplam_belge=len(docs),
            kuyrukta=sum(1 for d in docs if d.durum == ProcessingStatus.KUYRUKTA),
            islenen=sum(1 for d in docs if d.durum == ProcessingStatus.ISLENIYOR),
            tamamlanan=sum(1 for d in docs if d.durum == ProcessingStatus.TAMAMLANDI),
            hatali=sum(1 for d in docs if d.durum == ProcessingStatus.HATA),
            onaylanan=sum(1 for d in docs if d.durum == ProcessingStatus.ONAYLANDI),
        )

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

