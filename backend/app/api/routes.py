import os
import re
import uuid
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import asyncio
from fastapi import APIRouter, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from ..core.config import settings
from ..services.network import get_lan_ip, generate_qr_base64
from ..services.connection_manager import ws_manager
from ..services.document_repo import doc_repo
from ..models.irsaliye import (
    DocumentItem,
    ProcessingStatus,
    IrsaliyeData,
    DocumentUpdateRequest,
    MergeDocumentsRequest
)

from ..models.batch import (
    BatchSummary,
    QueueResponse,
    RotateRequest
)
from ..models.analytics import AnalyticsResponse
from ..services.analytics_service import analytics_service
from ..services.gemini_extractor import (
    gemini_extractor,
    GeminiRateLimitError,
    GeminiTimeoutError,
    GeminiNetworkError,
    GeminiExtractionError
)
from ..services.image_processor import image_processor
from ..services.excel_exporter import excel_exporter
from ..services.erp_exporter import erp_exporter
from ..services.validation import validate_vkn, validate_tckn, reconcile_purchase_order_3way
from ..services.qr_scanner import decode_qr_from_image, cross_verify_gib_qr
from ..services.uetds import generate_uetds_payload, generate_uetds_xml
from ..services.queue_manager import queue_manager, GLOBAL_AI_SEMAPHORE
from ..services.backup_service import backup_service
from ..services.erp_linter import erp_linter
from ..services.product_normalizer import product_normalizer

router = APIRouter()

def get_batch_summary() -> BatchSummary:
    return doc_repo.get_summary()

@router.get("/health")
async def health_check():
    return {
        "sistem": settings.PROJECT_NAME,
        "versiyon": settings.VERSION,
        "durum": "calisiyor",
        "motor": "Waybill OCR Engine v1.0"
    }

@router.get("/system/status")
async def system_status():
    return {
        "sistem": settings.PROJECT_NAME,
        "versiyon": settings.VERSION,
        "durum": "calisiyor",
        "motor": "Waybill OCR Engine v1.0"
    }

@router.get("/documents/summary", response_model=BatchSummary)
async def get_documents_summary():
    """Tüm kuyruk ve işleme durum özetini mikro-saniyeler içinde önbellekten döner."""
    cached_json = doc_repo.get_cached_summary_json()
    if cached_json:
        return Response(content=cached_json, media_type="application/json")
    return doc_repo.get_summary()

from .endpoints.documents import list_documents as endpoint_list_documents

@router.get("/documents", response_model=QueueResponse)
async def list_documents():
    """Tüm belgeleri ve kuyruk özetini döner. Hafif serializer ve in-memory byte cache ile çalışır."""
    return await endpoint_list_documents()

MAGIC_BYTES = {
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "png": [b"\x89PNG\r\n\x1a\n"],
    "webp": [b"RIFF"],
    "pdf": [b"%PDF-"],
    "tif": [b"II*\x00", b"MM\x00*"],
    "tiff": [b"II*\x00", b"MM\x00*"],
}

MIME_TYPE_MAP = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "pdf": "application/pdf",
    "tif": "image/tiff",
    "tiff": "image/tiff",
}

async def save_and_validate_upload(
    upload_file: UploadFile,
    custom_prefix: Optional[str] = None,
    doc_id: Optional[str] = None
) -> Tuple[str, Path, str, int, str]:
    """
    Güvenli dosya yükleme doğrulaması ve kaydı (CWE-22, CWE-434, CWE-400):
    1. Path traversal temizliği (Path(filename).name)
    2. İzin verilen uzantı kontrolü (ALLOWED_EXTENSIONS)
    3. Tehlikeli MIME türü engeli ve Magic Bytes imza doğrulaması (MIME spoofing koruması)
    4. UUID ve güvenli dosya adı sanitizasyonu
    5. Boyut sınırı kontrolü (MAX_FILE_SIZE_MB ile DoS / bellek tüketimi engeli)
    6. Dizin sınır kontrolü (UPLOAD_DIR dışına çıkış engeli)
    """
    if not upload_file or not upload_file.filename:
        raise HTTPException(status_code=400, detail="Dosya veya dosya adı bulunamadı.")

    # 1. Path traversal temizliği
    clean_display_name = Path(upload_file.filename).name.replace("\x00", "").strip()
    if not clean_display_name or clean_display_name in (".", ".."):
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")

    # 2. Uzantı kontrolü
    parts = clean_display_name.rsplit(".", 1)
    if len(parts) < 2 or not parts[1]:
        raise HTTPException(status_code=400, detail="Dosya uzantısı eksik veya geçersiz.")
    ext = parts[1].lower().strip()

    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Desteklenmeyen dosya türü: .{ext}. İzin verilenler: {', '.join(sorted(settings.ALLOWED_EXTENSIONS))}"
        )

    # 3. MIME Türü kontrolü
    expected_mime = MIME_TYPE_MAP.get(ext, "image/jpeg")
    content_type = (upload_file.content_type or "").lower().strip()
    dangerous_mimes = {
        "application/x-php", "text/html", "application/javascript",
        "application/x-sh", "application/x-msdos-program", "text/x-python",
        "application/x-executable"
    }
    if content_type in dangerous_mimes:
        raise HTTPException(status_code=400, detail=f"Güvenlik ihlali: Tehlikeli dosya içeriği tespit edildi ({content_type}).")

    # 4. UUID ve güvenli dosya adı oluşturma
    assigned_id = doc_id or str(uuid.uuid4())
    safe_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(clean_display_name).stem)[:40] or "file"
    if custom_prefix:
        safe_filename = f"{custom_prefix}_{safe_stem}.{ext}"
    else:
        safe_filename = f"{assigned_id}_{safe_stem}.{ext}"

    # Dizin sınırı kontrolü
    target_path = (settings.UPLOAD_DIR / safe_filename).resolve()
    upload_dir_resolved = settings.UPLOAD_DIR.resolve()
    if not target_path.is_relative_to(upload_dir_resolved):
        raise HTTPException(status_code=400, detail="Güvenlik ihlali: Dosya yolu izin verilen sınırların dışına çıkamaz.")

    # 5. Boyut sınırı ve akış denetimi (DoS koruması)
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    total_bytes = 0
    header_bytes = b""
    chunk_size = 64 * 1024  # 64 KB

    try:
        with open(target_path, "wb") as buffer:
            while chunk := await upload_file.read(chunk_size):
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    buffer.close()
                    if target_path.exists():
                        target_path.unlink()
                    raise HTTPException(
                        status_code=413,
                        detail=f"Dosya boyutu çok büyük. Maksimum izin verilen sınır: {settings.MAX_FILE_SIZE_MB}MB"
                    )
                if len(header_bytes) < 32:
                    header_bytes += chunk[:32 - len(header_bytes)]
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if target_path.exists():
            target_path.unlink()
        raise HTTPException(status_code=500, detail=f"Dosya kaydedilemedi: {e}")
    finally:
        try:
            upload_file.file.close()
        except Exception:
            pass

    # Boş dosya kontrolü
    if total_bytes == 0:
        if target_path.exists():
            target_path.unlink()
        raise HTTPException(status_code=400, detail="Boş dosya yüklenemez.")

    # 6. Magic Bytes doğrulaması (MIME spoofing önleme)
    magic_sigs = MAGIC_BYTES.get(ext, [])
    is_valid_magic = False
    if ext == "webp":
        is_valid_magic = header_bytes.startswith(b"RIFF") and len(header_bytes) >= 12 and header_bytes[8:12] == b"WEBP"
    else:
        is_valid_magic = any(header_bytes.startswith(sig) for sig in magic_sigs)

    if not is_valid_magic:
        if target_path.exists():
            target_path.unlink()
        raise HTTPException(
            status_code=400,
            detail=f"Dosya içeriği ve uzantısı (.{ext}) uyuşmuyor (sahte veya geçersiz dosya biçimi)."
        )

    return assigned_id, target_path, safe_filename, total_bytes, clean_display_name

@router.post("/upload", response_model=List[DocumentItem])
async def upload_documents(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Hiçbir dosya gönderilmedi.")

    uploaded_items: List[DocumentItem] = []

    for file in files:
        try:
            doc_id, file_path, safe_filename, file_size, clean_name = await save_and_validate_upload(file)
        except HTTPException:
            if len(files) == 1:
                raise
            continue

        # Yüklenen görselin EXIF oryantasyonunu hemen normalize et
        image_processor.normalize_image(file_path)
        thumb_path = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"
        image_processor.generate_thumbnail(file_path, thumb_path)

        ext = file_path.suffix.lstrip(".").lower()
        mime_type = MIME_TYPE_MAP.get(ext, "image/jpeg")
        now_ts = int(datetime.now().timestamp() * 1000)

        doc_item = DocumentItem(
            id=doc_id,
            dosya_adi=clean_name,
            dosya_yolu=str(file_path),
            dosya_url=f"/uploads/{safe_filename}",
            mime_type=mime_type,
            boyut_bytes=file_size,
            yuklenme_tarihi=datetime.now().strftime("%d.%m.%Y %H:%M"),
            donus_acisi=0,
            durum=ProcessingStatus.KUYRUKTA,
            sayfalar=[f"/uploads/{safe_filename}"],
            guncellenme_ts=now_ts
        )

        doc_repo.save(doc_item)
        uploaded_items.append(doc_item)

    if not uploaded_items and files:
        raise HTTPException(status_code=400, detail="Geçerli veya desteklenen bir dosya yüklenemedi.")

    if uploaded_items:
        await ws_manager.broadcast_all({
            "type": "DOCUMENTS_UPDATED",
            "action": "upload",
            "count": len(uploaded_items),
            "document_ids": [d.id for d in uploaded_items]
        })

    return uploaded_items

@router.post("/demo/load", response_model=DocumentItem)
async def load_demo_document():
    demo_sample_path = settings.WORKSPACE_DIR / "samples" / "ornek_sevk_irsaliyesi.jpg"
    if not demo_sample_path.exists():
        raise HTTPException(status_code=404, detail="Örnek irsaliye dosyası bulunamadı.")

    doc_id = str(uuid.uuid4())
    safe_filename = f"{doc_id}_ornek_sevk_irsaliyesi.jpg"
    file_path = settings.UPLOAD_DIR / safe_filename
    thumb_path = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"

    shutil.copyfile(demo_sample_path, file_path)
    image_processor.generate_thumbnail(file_path, thumb_path)

    try:
        data = gemini_extractor.extract_from_image(file_path, "image/jpeg")
    except Exception:
        data = gemini_extractor._generate_realistic_fallback_data("ornek_sevk_irsaliyesi.jpg")

    doc_item = DocumentItem(
        id=doc_id,
        dosya_adi="ornek_sevk_irsaliyesi.jpg",
        dosya_yolu=str(file_path),
        dosya_url=f"/uploads/{safe_filename}",
        mime_type="image/jpeg",
        boyut_bytes=os.path.getsize(file_path) if file_path.exists() else (os.path.getsize(demo_sample_path) if demo_sample_path.exists() else 0),
        yuklenme_tarihi=datetime.now().strftime("%d.%m.%Y %H:%M"),
        donus_acisi=0,
        durum=ProcessingStatus.TAMAMLANDI,
        veri=data,
        sayfalar=[f"/uploads/{safe_filename}"],
        guncellenme_ts=int(datetime.now().timestamp() * 1000)
    )

    doc_repo.save(doc_item)
    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "demo_load",
        "document_id": doc_id
    })
    return doc_item

@router.get("/documents/{doc_id}", response_model=DocumentItem)
async def get_document(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    return doc

def _run_ai_extraction(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        return
    try:
        # Otomatik Deskew & Perspektif Ön Düzeltme (AI öncesi evrakı dikleştir)
        main_file = Path(doc.dosya_yolu)
        if main_file.exists() and main_file.suffix.lower() in (".jpg", ".jpeg", ".png"):
            try:
                corrected, rectified_path, _ = image_processor.detect_and_deskew_perspective(main_file)
                if corrected:
                    thumb_path = settings.UPLOAD_DIR / f"thumb_{doc.id}.jpg"
                    image_processor.generate_thumbnail(rectified_path, thumb_path)
            except Exception as deskew_err:
                print(f"[Optik Deskew Hata] {doc_id}: {deskew_err}")

        add_pages = []
        if doc.sayfalar and len(doc.sayfalar) > 1:
            for p_url in doc.sayfalar[1:]:
                fname = p_url.split("/")[-1].split("?")[0]
                p_path = settings.UPLOAD_DIR / fname
                if p_path.exists():
                    add_pages.append(p_path)

        extracted_data = gemini_extractor.extract_from_image(
            image_path=Path(doc.dosya_yolu),
            mime_type=doc.mime_type,
            additional_pages=add_pages
        )
        if extracted_data and extracted_data.kalemler:
            extracted_data.kalemler = product_normalizer.normalize_items(extracted_data.kalemler)
        doc.veri = extracted_data
        doc.durum = ProcessingStatus.TAMAMLANDI
        doc.hata_mesaji = None
    except GeminiRateLimitError as rle:
        doc.durum = ProcessingStatus.HATA
        doc.hata_mesaji = "Kota Sınırı (429 Rate Limit): Belge işlem hattında anlık yoğunluk yaşanıyor. Lütfen kısa bir süre sonra tekrar deneyiniz."
        print(f"[KOTA AŞIMI] Belge {doc_id}: {rle}")
    except GeminiTimeoutError as te:
        doc.durum = ProcessingStatus.HATA
        doc.hata_mesaji = "Zaman Aşımı (Timeout): Belge çözümleme servisi zaman aşımına uğradı. Ağ durumunu kontrol edip tekrar deneyiniz."
        print(f"[ZAMAN AŞIMI] Belge {doc_id}: {te}")
    except GeminiNetworkError as ne:
        doc.durum = ProcessingStatus.HATA
        doc.hata_mesaji = "Ağ Bağlantı Kopması: Doğrulama ve aktarım servisine ulaşılamadı. Lütfen ağ erişimini kontrol ediniz."
        print(f"[AĞ HATASI] Belge {doc_id}: {ne}")
    except GeminiExtractionError as ee:
        doc.durum = ProcessingStatus.HATA
        doc.hata_mesaji = "Belge Ayrıştırma Uyarısı: Evrak üzerindeki alanlar net olarak çözümlenemedi. Lütfen net bir görsel yükleyiniz."
        print(f"[FORMAT HATASI] Belge {doc_id}: {ee}")
    except Exception as e:
        doc.durum = ProcessingStatus.HATA
        doc.hata_mesaji = "İşlem Hatası: Evrak işlenirken bir sorun oluştu. Lütfen tekrar deneyiniz."
        print(f"[GENEL HATA] Belge {doc_id}: {e}")

    # Hayalet Evrak Koruması: İşlem sürerken kullanıcı evrakı silmişse diriltme!
    current_doc = doc_repo.get_by_id(doc_id)
    if not current_doc:
        print(f"[Ghost Prevention] Belge {doc_id} işlem sürerken silinmiş, yeniden oluşturulmuyor.")
        return

    # Kayıp Güncelleme (Lost Update) Koruması: Kullanıcı bu sürede formu düzenlediyse başlık/notları koru
    if current_doc.veri and doc.veri:
        if current_doc.veri.header and (current_doc.veri.header.irsaliye_no or current_doc.veri.header.gonderici_unvan):
            # Kullanıcının manuel girdiği alanları koru
            doc.veri.header.irsaliye_no = current_doc.veri.header.irsaliye_no or doc.veri.header.irsaliye_no
            doc.veri.header.gonderici_unvan = current_doc.veri.header.gonderici_unvan or doc.veri.header.gonderici_unvan
            doc.veri.header.alici_unvan = current_doc.veri.header.alici_unvan or doc.veri.header.alici_unvan
        if current_doc.veri.genel_notlar:
            doc.veri.genel_notlar = current_doc.veri.genel_notlar

    try:
        doc_repo.save(doc, create_if_missing=False)
    except Exception as save_err:
        print(f"[DocumentRepo HATA] Belge {doc_id} durumu kaydedilemedi: {save_err}")

    try:
        ws_manager.broadcast_all_sync({
            "type": "DOCUMENTS_UPDATED",
            "action": "process_completed",
            "document_id": doc_id,
            "durum": doc.durum.value if hasattr(doc.durum, "value") else str(doc.durum)
        })
    except Exception as ws_err:
        print(f"[WebSocket HATA] process_completed bildirimi gönderilemedi: {ws_err}")

GLOBAL_PROCESSING_SEMAPHORE = GLOBAL_AI_SEMAPHORE

@router.post("/documents/{doc_id}/process", response_model=DocumentItem)
async def process_document(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    doc.durum = ProcessingStatus.ISLENIYOR
    doc_repo.save(doc)
    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "process_started",
        "document_id": doc_id,
        "durum": ProcessingStatus.ISLENIYOR.value
    })

    await queue_manager.process_document_safe(doc_id, _run_ai_extraction)
    return doc_repo.get_by_id(doc_id)

BATCH_WORKER_LOCK = asyncio.Lock()
IS_BATCH_PROCESSING = False

async def _run_batch_worker(doc_ids: List[str]):
    """Toplu evrak işlemede kontrollü concurrency (max_concurrent workers) ile yüksek verimli worker havuzu."""
    global IS_BATCH_PROCESSING
    task_queue: asyncio.Queue = asyncio.Queue()
    for d_id in doc_ids:
        await task_queue.put(d_id)

    async def worker():
        while not task_queue.empty():
            try:
                doc_id = task_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            try:
                doc = doc_repo.get_by_id(doc_id)
                if not doc:
                    task_queue.task_done()
                    continue
                if doc.durum != ProcessingStatus.ISLENIYOR:
                    doc.durum = ProcessingStatus.ISLENIYOR
                    doc_repo.save(doc, create_if_missing=False)
                    await ws_manager.broadcast_all({
                        "type": "DOCUMENTS_UPDATED",
                        "action": "process_started",
                        "document_id": doc_id,
                        "durum": ProcessingStatus.ISLENIYOR.value
                    })
                await queue_manager.process_document_safe(doc_id, _run_ai_extraction)
                await asyncio.sleep(0.4)
            except Exception as item_err:
                print(f"[BatchWorker HATA] Belge {doc_id} işlenirken hata (diğer evraklar devam ediyor): {item_err}")
                err_doc = doc_repo.get_by_id(doc_id)
                if err_doc:
                    err_doc.durum = ProcessingStatus.HATA
                    err_doc.hata_mesaji = "İşlem Hatası: Evrak işlenirken bir sorun oluştu. Lütfen tekrar deneyiniz."
                    doc_repo.save(err_doc, create_if_missing=False)
            finally:
                task_queue.task_done()

    try:
        workers = [asyncio.create_task(worker()) for _ in range(queue_manager.max_concurrent)]
        await asyncio.gather(*workers)
    finally:
        async with BATCH_WORKER_LOCK:
            IS_BATCH_PROCESSING = False
        await ws_manager.broadcast_all({
            "type": "DOCUMENTS_UPDATED",
            "action": "batch_process_finished"
        })

@router.get("/system/queue-status")
async def get_queue_status():
    counts = doc_repo.get_status_counts()
    q_status = queue_manager.get_status()
    return {
        "isleniyor_adet": counts.get(ProcessingStatus.ISLENIYOR.value, 0) + counts.get("isleniyor", 0),
        "kuyrukta_adet": counts.get(ProcessingStatus.KUYRUKTA.value, 0) + counts.get("kuyrukta", 0),
        "tamamlandi_adet": counts.get(ProcessingStatus.TAMAMLANDI.value, 0) + counts.get("tamamlandi", 0),
        "hata_adet": counts.get(ProcessingStatus.HATA.value, 0) + counts.get("hata", 0),
        "concurrency_limit": queue_manager.max_concurrent,
        "active_workers": q_status["active_workers"],
        "queued_tasks": q_status["queued_tasks"],
        "total_completed": q_status["total_completed"],
        "total_failed": q_status["total_failed"],
        "total_retried": q_status["total_retried"]
    }

@router.post("/batch/process-all")
async def process_all_documents(background_tasks: BackgroundTasks):
    global IS_BATCH_PROCESSING
    async with BATCH_WORKER_LOCK:
        if IS_BATCH_PROCESSING:
            return {"mesaj": "Toplu işlem zaten arka planda çalışıyor.", "islenen_adet": 0}

        docs = doc_repo.get_all()
        to_process = [d for d in docs if d.durum in (ProcessingStatus.KUYRUKTA, ProcessingStatus.HATA)]
        
        if to_process:
            IS_BATCH_PROCESSING = True
            doc_ids = [d.id for d in to_process]
            background_tasks.add_task(_run_batch_worker, doc_ids)
            await ws_manager.broadcast_all({
                "type": "DOCUMENTS_UPDATED",
                "action": "batch_process_queued",
                "count": len(to_process)
            })
            return {"mesaj": "Toplu işlem kontrollü kuyrukla başlatıldı", "islenen_adet": len(to_process)}
        return {"mesaj": "İşlenecek bekleyen evrak yok", "islenen_adet": 0}

@router.post("/documents/reset-all")
async def reset_all_documents_to_unread():
    """
    Okunmuş/işlenmiş tüm evrakları sıfırlayarak 'kuyrukta' (okunmamış) durumuna çevirir.
    Veri ve hata mesajlarını temizler, WebSocket ile arayüze anlık yayınlar.
    """
    count = doc_repo.reset_all_to_unread()
    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "reset_all",
        "count": count
    })
    return {"mesaj": f"{count} adet evrak okunmamış (kuyrukta) durumuna getirildi.", "sifirlanan_adet": count}

@router.post("/documents/{doc_id}/rotate", response_model=DocumentItem)
async def rotate_document(doc_id: str, req: RotateRequest):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    file_path = Path(doc.dosya_yolu)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Evrak görseli diskte bulunamadı.")

    target_file = file_path
    if req.sayfa_indeksi and req.sayfa_indeksi > 0 and doc.sayfalar and req.sayfa_indeksi < len(doc.sayfalar):
        page_url = doc.sayfalar[req.sayfa_indeksi]
        filename = page_url.split("/")[-1].split("?")[0]
        page_path = settings.UPLOAD_DIR / filename
        if page_path.exists():
            target_file = page_path

    thumb_path = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"

    image_processor.rotate_image(target_file, req.derece)
    if target_file == file_path:
        image_processor.generate_thumbnail(file_path, thumb_path)

    now_ts = int(datetime.now().timestamp() * 1000)
    doc.donus_acisi = 0
    doc.guncellenme_ts = now_ts
    if file_path.exists():
        doc.boyut_bytes = os.path.getsize(file_path)

    doc_repo.save(doc)
    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "rotate",
        "document_id": doc_id,
        "donus_acisi": 0,
        "sayfa_indeksi": req.sayfa_indeksi or 0,
        "timestamp": now_ts
    })
    return doc

@router.put("/documents/{doc_id}", response_model=DocumentItem)
async def update_document_data(doc_id: str, req: DocumentUpdateRequest):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    if doc.veri is None:
        doc.veri = IrsaliyeData()

    if req.header is not None:
        doc.veri.header = req.header
    if req.kalemler is not None:
        # Self-Learning Alias Engine: Operatörün yaptığı düzeltmeleri tespit edip kalıcı hafızaya kaydet
        if doc.veri and doc.veri.kalemler:
            old_items_map = {item.sira_no or idx: item.mal_hizmet for idx, item in enumerate(doc.veri.kalemler, 1)}
            for idx, new_item in enumerate(req.kalemler, 1):
                key = new_item.sira_no or idx
                old_name = old_items_map.get(key)
                if old_name and new_item.mal_hizmet and old_name.strip() != new_item.mal_hizmet.strip():
                    product_normalizer.record_user_correction(
                        raw_name=old_name,
                        corrected_name=new_item.mal_hizmet
                    )
        doc.veri.kalemler = req.kalemler
    if req.genel_toplam_miktar is not None:
        doc.veri.genel_toplam_miktar = req.genel_toplam_miktar
    if req.genel_notlar is not None:
        doc.veri.genel_notlar = req.genel_notlar
    if req.durum is not None:
        doc.durum = req.durum

    doc_repo.save(doc)
    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "update",
        "document_id": doc_id,
        "durum": doc.durum.value if hasattr(doc.durum, "value") else str(doc.durum)
    })
    return doc

@router.post("/documents/merge", response_model=DocumentItem)
async def merge_documents(req: MergeDocumentsRequest):
    target_doc = doc_repo.get_by_id(req.target_doc_id)
    if not target_doc:
        raise HTTPException(status_code=404, detail="Hedef evrak bulunamadı.")

    if not target_doc.sayfalar:
        target_doc.sayfalar = [target_doc.dosya_url]

    merged_items = list(target_doc.veri.kalemler) if target_doc.veri and target_doc.veri.kalemler else []
    extra_notes = []

    for s_id in req.source_doc_ids:
        if s_id == req.target_doc_id:
            continue
        src_doc = doc_repo.get_by_id(s_id)
        if not src_doc:
            continue

        if src_doc.sayfalar:
            for p in src_doc.sayfalar:
                if p not in target_doc.sayfalar:
                    target_doc.sayfalar.append(p)
        elif src_doc.dosya_url not in target_doc.sayfalar:
            target_doc.sayfalar.append(src_doc.dosya_url)

        if src_doc.veri and src_doc.veri.kalemler:
            merged_items.extend(src_doc.veri.kalemler)

        if src_doc.veri and src_doc.veri.genel_notlar:
            extra_notes.append(src_doc.veri.genel_notlar)

        # Hedef evraka bağlanan sayfaların fiziksel dosyalarını koru, sadece eski thumbnail'ı temizle
        orphan_thumb = settings.UPLOAD_DIR / f"thumb_{s_id}.jpg"
        if orphan_thumb.exists():
            try:
                orphan_thumb.unlink()
            except Exception:
                pass
        doc_repo.delete(s_id, delete_files=False)

    for idx, item in enumerate(merged_items, 1):
        item.sira_no = idx

    if target_doc.veri:
        target_doc.veri.kalemler = merged_items
        target_doc.veri.genel_toplam_miktar = sum(k.miktar or 0 for k in merged_items)
        if extra_notes:
            existing = target_doc.veri.genel_notlar or ""
            target_doc.veri.genel_notlar = f"{existing} | {' | '.join(extra_notes)}".strip(" |")

    doc_repo.save(target_doc)
    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "merge",
        "target_doc_id": req.target_doc_id,
        "source_doc_ids": req.source_doc_ids
    })
    return target_doc

@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    doc_repo.delete(doc_id, delete_files=True)
    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "delete",
        "document_id": doc_id
    })
    return {"mesaj": "Belge silindi", "id": doc_id}

@router.delete("/documents")
async def clear_all_documents():
    doc_repo.clear_all(delete_files=True)
    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "clear_all"
    })
    return {"mesaj": "Kuyruk temizlendi"}

@router.post("/system/cleanup-orphans")
async def cleanup_orphans_endpoint():
    deleted = doc_repo.cleanup_orphan_files()
    return {
        "mesaj": "Yetim dosya temizliği tamamlandı",
        "silinen_adet": len(deleted),
        "silinen_dosyalar": deleted
    }

@router.get("/documents/{doc_id}/export-excel")
async def export_single_excel(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    if not doc.veri:
        raise HTTPException(status_code=400, detail="Belgede işlenmiş irsaliye verisi bulunmuyor.")

    export_path = excel_exporter.export_single_irsaliye(doc)
    irsaliye_no = doc.veri.header.irsaliye_no if doc.veri and doc.veri.header else doc_id[:8]
    clean_no = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(irsaliye_no))[:50]
    return FileResponse(
        path=export_path,
        filename=f"irsaliye_{clean_no}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@router.get("/batch/export-excel")
async def export_batch_excel():
    docs = doc_repo.get_all()
    docs_with_data = [d for d in docs if d.veri is not None]
    if not docs_with_data:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak işlenmiş irsaliye bulunamadı.")
    export_path = excel_exporter.export_batch_irsaliyeler(docs)
    return FileResponse(
        path=export_path,
        filename="tum_irsaliyeler_toplu_rapor.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@router.get("/documents/{doc_id}/export-logo-xml")
async def export_single_logo_xml(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    if not doc.veri:
        raise HTTPException(status_code=400, detail="Belgede işlenmiş irsaliye verisi bulunmuyor.")

    export_path = erp_exporter.export_single_logo_xml(doc)
    return FileResponse(
        path=export_path,
        filename=f"Logo_Irsaliye_{doc_id[:8]}.xml",
        media_type="application/xml"
    )

@router.get("/documents/{doc_id}/export-json")
async def export_single_json(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    if not doc.veri:
        raise HTTPException(status_code=400, detail="Belgede işlenmiş irsaliye verisi bulunmuyor.")

    export_path = erp_exporter.export_single_erp_json(doc)
    return FileResponse(
        path=export_path,
        filename=f"Waybill_Irsaliye_{doc_id[:8]}.json",
        media_type="application/json"
    )

@router.get("/batch/export-logo-xml")
async def export_batch_logo_xml():
    docs = doc_repo.get_all()
    docs_with_data = [d for d in docs if d.veri is not None]
    if not docs_with_data:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak işlenmiş irsaliye bulunamadı.")
    export_path = erp_exporter.export_batch_logo_xml(docs)
    date_str = datetime.now().strftime("%Y%m%d_%H%M")
    return FileResponse(
        path=export_path,
        filename=f"Logo_Toplu_Irsaliyeler_{date_str}.xml",
        media_type="application/xml"
    )

@router.get("/batch/export-json")
async def export_batch_json():
    docs = doc_repo.get_all()
    docs_with_data = [d for d in docs if d.veri is not None]
    if not docs_with_data:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak işlenmiş irsaliye bulunamadı.")
    export_path = erp_exporter.export_batch_erp_json(docs)
    date_str = datetime.now().strftime("%Y%m%d_%H%M")
    return FileResponse(
        path=export_path,
        filename=f"Waybill_Toplu_Irsaliyeler_{date_str}.json",
        media_type="application/json"
    )

@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics():
    docs = doc_repo.get_all()
    return analytics_service.compute_analytics(docs)

@router.get("/analytics/export-report")
async def export_executive_report_endpoint():
    docs = doc_repo.get_all()
    analytics_data = analytics_service.compute_analytics(docs)
    export_path = excel_exporter.export_executive_report(analytics_data, docs)
    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"Resmi_Mal_Kabul_Yonetici_Raporu_{date_str}.xlsx"
    return FileResponse(
        path=export_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

class ApiKeyRequest(BaseModel):
    api_key: str

@router.get("/settings/api-key")
async def get_api_key_status():
    key = os.getenv("GEMINI_API_KEY", "") or settings.GEMINI_API_KEY
    is_set = bool(key and key != "your_gemini_api_key_here")
    # API anahtarının sızmaması için yalnızca son 4 karakterini maskeli olarak göster
    masked = f"••••••••••••••••{key[-4:]}" if is_set and len(key) >= 4 else ("Tanımlı" if is_set else "Tanımsız")
    return {
        "is_configured": is_set,
        "masked_key": masked,
        "model": settings.GEMINI_MODEL
    }

@router.post("/settings/api-key")
async def save_api_key(req: ApiKeyRequest):
    key = req.api_key.strip()
    # Güvenlik kontrolleri: Boş, aşırı uzun veya geçersiz format
    if not key or len(key) < 10 or len(key) > 256:
        raise HTTPException(status_code=400, detail="Geçersiz API anahtarı formatı veya uzunluğu.")

    # .env içine newline veya kontrol karakteri enjeksiyonunu engelle (Environment Injection koruması)
    if any(c in key for c in ('\r', '\n', '\x00', '"', "'", '`', '$', ';')):
        raise HTTPException(status_code=400, detail="API anahtarı geçersiz karakterler içeremez.")

    if not re.match(r"^[a-zA-Z0-9_\-\.]+$", key):
        raise HTTPException(status_code=400, detail="API anahtarı yalnızca alfanümerik ve güvenli karakterler içerebilir.")

    os.environ["GEMINI_API_KEY"] = key
    settings.GEMINI_API_KEY = key
    gemini_extractor.api_key = key
    gemini_extractor._client = None

    env_path = settings.WORKSPACE_DIR / ".env"
    try:
        lines = []
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        has_key = False
        new_lines = []
        for line in lines:
            if line.startswith("GEMINI_API_KEY="):
                new_lines.append(f'GEMINI_API_KEY="{key}"\n')
                has_key = True
            else:
                new_lines.append(line)
        if not has_key:
            new_lines.append(f'\nGEMINI_API_KEY="{key}"\n')
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        # Sıkı izinler (chmod 600 - sadece sahip okuyup yazabilir)
        os.chmod(env_path, 0o600)
    except Exception as e:
        print(f".env kaydetme uyarısı: {e}")

    return {"mesaj": "API anahtarı başarıyla güncellendi", "is_configured": True}

@router.get("/qr-url")
async def get_qr_url(session_id: Optional[str] = None):
    if not session_id:
        session_id = uuid.uuid4().hex[:12]
    else:
        # Session ID sanitizasyonu
        session_id = re.sub(r'[^a-zA-Z0-9_\-]', '', session_id)[:64] or uuid.uuid4().hex[:12]

    lan_ip = get_lan_ip()
    port = settings.PORT
    mobile_url = f"http://{lan_ip}:{port}/mobile-scan?session_id={session_id}"
    qr_data_url = generate_qr_base64(mobile_url)

    return {
        "session_id": session_id,
        "lan_ip": lan_ip,
        "port": port,
        "mobile_url": mobile_url,
        "qr_data_url": qr_data_url,
    }

@router.post("/mobile-upload", response_model=DocumentItem)
async def mobile_upload(
    files: List[UploadFile] = File(default=[]),
    file: Optional[UploadFile] = File(default=None),
    session_id: str = Form("default-session")
):
    all_files = list(files) if files else []
    if file:
        all_files.append(file)

    if not all_files:
        raise HTTPException(status_code=400, detail="Hiçbir dosya gönderilmedi")

    # Session ID sanitizasyonu
    clean_session_id = re.sub(r'[^a-zA-Z0-9_\-]', '', session_id)[:64] or "default-session"

    doc_id = str(uuid.uuid4())
    page_urls: List[str] = []
    first_file_path = None
    total_bytes = 0

    for idx, f in enumerate(all_files):
        try:
            _, file_path, safe_filename, file_size, _ = await save_and_validate_upload(
                f,
                custom_prefix=f"mobile_{doc_id}_p{idx+1}",
                doc_id=doc_id
            )
        except HTTPException:
            if len(all_files) == 1:
                raise
            continue

        # Görselin EXIF oryantasyonunu normalize et
        image_processor.normalize_image(file_path)
        total_bytes += file_size
        url = f"/uploads/{safe_filename}"
        page_urls.append(url)
        if first_file_path is None:
            first_file_path = file_path
            thumb_path = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"
            image_processor.generate_thumbnail(file_path, thumb_path)

    if not page_urls or not first_file_path:
        raise HTTPException(status_code=400, detail="Desteklenen geçerli görsel bulunamadı")

    page_count = len(page_urls)
    doc_title = (
        f"Mobil İrsaliye ({page_count} Sayfa - {datetime.now().strftime('%H:%M:%S')})"
        if page_count > 1
        else f"Mobil İrsaliye ({datetime.now().strftime('%H:%M:%S')})"
    )

    now_ts = int(datetime.now().timestamp() * 1000)
    doc_item = DocumentItem(
        id=doc_id,
        dosya_adi=doc_title,
        dosya_yolu=str(first_file_path),
        dosya_url=page_urls[0],
        mime_type="image/jpeg",
        boyut_bytes=total_bytes,
        yuklenme_tarihi=datetime.now().strftime("%d.%m.%Y %H:%M"),
        donus_acisi=0,
        durum=ProcessingStatus.KUYRUKTA,
        sayfalar=page_urls,
        guncellenme_ts=now_ts
    )

    doc_repo.save(doc_item)

    await ws_manager.send_to_session(clean_session_id, {
        "type": "DOCUMENT_UPLOADED",
        "session_id": clean_session_id,
        "document": doc_item.model_dump()
    })

    await ws_manager.broadcast_all({
        "type": "DOCUMENTS_UPDATED",
        "action": "mobile_upload",
        "session_id": clean_session_id,
        "document_id": doc_id,
        "document": doc_item.model_dump()
    })

    await ws_manager.broadcast_all({
        "type": "NEW_DOCUMENT_IN_QUEUE",
        "session_id": clean_session_id,
        "document_id": doc_id
    })

    return doc_item

@router.get("/documents/{doc_id}/reconcile-po")
async def reconcile_document_po(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    
    header = doc.veri.header.model_dump() if doc.veri and doc.veri.header else {}
    kalemler = [k.model_dump() for k in doc.veri.kalemler] if doc.veri and doc.veri.kalemler else []
    
    return reconcile_purchase_order_3way(header, kalemler)

@router.get("/validation/vkn/{vkn}")
async def check_vkn(vkn: str):
    return {
        "vkn": vkn,
        "is_valid_vkn": validate_vkn(vkn),
        "is_valid_tckn": validate_tckn(vkn)
    }

@router.get("/documents/{doc_id}/gib-qr")
async def get_document_gib_qr(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    
    header = doc.veri.header.model_dump() if doc.veri and doc.veri.header else {}
    file_path = doc.dosya_yolu

    # PDF ise ilk sayfa görseli üzerinde tara
    if file_path.lower().endswith('.pdf') and doc.sayfalar and len(doc.sayfalar) > 0:
        first_page_name = doc.sayfalar[0].split("/")[-1].split("?")[0]
        file_path = str(settings.UPLOAD_DIR / first_page_name)

    qr_res = decode_qr_from_image(file_path)
    verification = cross_verify_gib_qr(qr_res, header)
    return verification

@router.get("/documents/{doc_id}/uetds-payload")
async def get_document_uetds_payload(doc_id: str):
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    
    header = doc.veri.header.model_dump() if doc.veri and doc.veri.header else {}
    kalemler = [k.model_dump() for k in doc.veri.kalemler] if doc.veri and doc.veri.kalemler else []
    
    payload = generate_uetds_payload(header, kalemler)
    xml_str = generate_uetds_xml(header, kalemler)
    payload["xml_preview"] = xml_str
    return payload

@router.post("/documents/{doc_id}/deskew")
async def deskew_document(doc_id: str):
    """
    Mobil / ambar ortamında çekilmiş eğik evrakların 4 köşe perspektifini veya
    açısal yamukluğunu (Deskew) OpenCV ile otomatik tespit edip dikleştirir.
    """
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    target_path = Path(doc.dosya_yolu)
    # PDF ise ilk sayfa görseli üzerinde işlem yap
    if target_path.suffix.lower() == ".pdf" and doc.sayfalar and len(doc.sayfalar) > 0:
        first_page_name = doc.sayfalar[0].split("/")[-1].split("?")[0]
        target_path = settings.UPLOAD_DIR / first_page_name

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Evrak fiziksel dosyası bulunamadı.")

    corrected, rectified_path, details = image_processor.detect_and_deskew_perspective(target_path)

    if corrected:
        # Küçük resmi (thumbnail) yenile
        thumb_path = settings.UPLOAD_DIR / f"thumb_{doc.id}.jpg"
        image_processor.generate_thumbnail(rectified_path, thumb_path)

        doc.guncellenme_ts = int(datetime.now().timestamp() * 1000)
        doc.boyut_bytes = rectified_path.stat().st_size
        doc_repo.save(doc)

        await ws_manager.broadcast_all({
            "type": "DOCUMENT_UPDATED",
            "document": doc.model_dump()
        })
        await ws_manager.broadcast_all({
            "type": "DOCUMENTS_UPDATED",
            "action": "deskew",
            "document_id": doc.id,
            "document": doc.model_dump()
        })

    return {
        "success": True,
        "corrected": corrected,
        "details": details,
        "document": doc
    }

@router.get("/documents/{doc_id}/erp-lint")
async def get_document_erp_lint(doc_id: str):
    """
    Belgenin Logo Tiger STFICHE, SAP S/4HANA MIGO (101 Mal Girişi) ve U-ETDS
    şemalarına tam uyumluluğunu denetler, alan bazlı skor ve canlı yük önizlemeleri üretir.
    """
    doc = doc_repo.get_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    header = doc.veri.header.model_dump() if doc.veri and doc.veri.header else {}
    kalemler = [k.model_dump() for k in doc.veri.kalemler] if doc.veri and doc.veri.kalemler else []

    lint_report = erp_linter.lint_document(header, kalemler)
    return lint_report

@router.post("/system/backup/create")
async def create_backup():
    """
    Disaster Recovery: SQLite WAL checkpoint uygulayarak veritabanı, yüklemeler ve küçük resimleri
    SHA-256 sağlama özeti ile timestamped .tar.gz arşivi haline getirir.
    """
    try:
        backup_result = backup_service.create_system_backup()
        return backup_result
    except Exception as e:
        logger.error(f"Sistem yedekleme oluşturulurken hata: {e}")
        raise HTTPException(status_code=500, detail=f"Yedekleme oluşturulamadı: {str(e)}")

@router.get("/system/backup/status")
async def get_backup_status():
    """
    Mevcut felaket kurtarma yedeklerini, veri tabanı ve görsel depolama boyutunu raporlar.
    """
    return backup_service.get_backup_status()

@router.get("/system/backup/download/{filename}")
async def download_backup(filename: str):
    """
    Oluşturulmuş .tar.gz felaket kurtarma arşivini güvenli şekilde indirir.
    """
    backup_file = backup_service.get_backup_path_by_name(filename)
    if not backup_file or not backup_file.exists():
        raise HTTPException(status_code=404, detail="İstenen yedek arşiv dosyası bulunamadı.")

    return FileResponse(
        path=backup_file,
        media_type="application/gzip",
        filename=backup_file.name
    )

class AliasCreateRequest(BaseModel):
    raw_pattern: str
    normalized_name: str
    kategori: Optional[str] = "fmcg_gida"

@router.get("/catalog/aliases")
async def get_product_aliases():
    """Tüm yerleşik ve operatörden öğrenilmiş ürün/terim eşleştirmelerini listeler."""
    return product_normalizer.get_all_aliases()

@router.post("/catalog/aliases")
async def create_product_alias(req: AliasCreateRequest):
    """Operatör tarafından manuel bir terim/ürün eşleştirmesi tanımlanır."""
    if not req.raw_pattern or not req.normalized_name:
        raise HTTPException(status_code=400, detail="Ham okuma kalıbı ve hedef isim boş olamaz.")
    product_normalizer.record_user_correction(
        raw_name=req.raw_pattern,
        corrected_name=req.normalized_name,
        category=req.kategori or "fmcg_gida"
    )
    return {"mesaj": "Ürün eşleştirmesi hafızaya kaydedildi", "data": req}

@router.delete("/catalog/aliases/{alias_id}")
async def delete_product_alias(alias_id: int):
    """Öğrenilmiş bir ürün eşleştirmesini hafızadan siler."""
    from ..models.db import SessionLocal, ProductAliasModel
    db = SessionLocal()
    try:
        rec = db.query(ProductAliasModel).filter(ProductAliasModel.id == alias_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Eşleştirme kaydı bulunamadı.")
        raw_key = rec.raw_pattern
        db.delete(rec)
        db.commit()
        with product_normalizer._lock:
            product_normalizer._dynamic_aliases.pop(raw_key, None)
        return {"mesaj": "Kural silindi", "id": alias_id}
    finally:
        db.close()



