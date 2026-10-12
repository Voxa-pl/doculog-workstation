import os
import uuid
import shutil
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..core.config import settings
from ..services.network import get_lan_ip, generate_qr_base64
from ..services.connection_manager import ws_manager
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
from ..services.gemini_extractor import gemini_extractor
from ..services.image_processor import image_processor
from ..services.excel_exporter import excel_exporter
from ..services.erp_exporter import erp_exporter

router = APIRouter()

DOCUMENT_STORE: Dict[str, DocumentItem] = {}

def get_batch_summary() -> BatchSummary:
    docs = list(DOCUMENT_STORE.values())
    return BatchSummary(
        toplam_belge=len(docs),
        kuyrukta=sum(1 for d in docs if d.durum == ProcessingStatus.KUYRUKTA),
        islenen=sum(1 for d in docs if d.durum == ProcessingStatus.ISLENIYOR),
        tamamlanan=sum(1 for d in docs if d.durum == ProcessingStatus.TAMAMLANDI),
        hatali=sum(1 for d in docs if d.durum == ProcessingStatus.HATA),
        onaylanan=sum(1 for d in docs if d.durum == ProcessingStatus.ONAYLANDI),
    )

@router.get("/health")
async def health_check():
    return {
        "sistem": settings.PROJECT_NAME,
        "versiyon": settings.VERSION,
        "durum": "calisiyor",
        "model": settings.GEMINI_MODEL
    }

@router.get("/documents", response_model=QueueResponse)
async def list_documents():
    return QueueResponse(
        documents=list(DOCUMENT_STORE.values()),
        summary=get_batch_summary()
    )

@router.post("/upload", response_model=List[DocumentItem])
async def upload_documents(files: List[UploadFile] = File(...)):
    uploaded_items: List[DocumentItem] = []

    for file in files:
        ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
        if ext not in settings.ALLOWED_EXTENSIONS:
            continue

        doc_id = str(uuid.uuid4())
        safe_filename = f"{doc_id}_{file.filename}"
        file_path = settings.UPLOAD_DIR / safe_filename
        thumb_path = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        image_processor.generate_thumbnail(file_path, thumb_path)

        doc_item = DocumentItem(
            id=doc_id,
            dosya_adi=file.filename,
            dosya_yolu=str(file_path),
            dosya_url=f"/uploads/{safe_filename}",
            mime_type=file.content_type or f"image/{ext}",
            boyut_bytes=os.path.getsize(file_path),
            yuklenme_tarihi=datetime.now().strftime("%d.%m.%Y %H:%M"),
            donus_acisi=0,
            durum=ProcessingStatus.KUYRUKTA,
            sayfalar=[f"/uploads/{safe_filename}"],
        )

        DOCUMENT_STORE[doc_id] = doc_item
        uploaded_items.append(doc_item)

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

    # Demo verisini anında hazır etmek için Gemini veya hızlı fallback verisini çıkart
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
        boyut_bytes=os.path.getsize(file_path),
        yuklenme_tarihi=datetime.now().strftime("%d.%m.%Y %H:%M"),
        donus_acisi=0,
        durum=ProcessingStatus.TAMAMLANDI,
        veri=data,
        sayfalar=[f"/uploads/{safe_filename}"],
    )

    DOCUMENT_STORE[doc_id] = doc_item
    return doc_item


@router.get("/documents/{doc_id}", response_model=DocumentItem)
async def get_document(doc_id: str):
    if doc_id not in DOCUMENT_STORE:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    return DOCUMENT_STORE[doc_id]

@router.post("/documents/{doc_id}/process", response_model=DocumentItem)
async def process_document(doc_id: str):
    if doc_id not in DOCUMENT_STORE:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    doc = DOCUMENT_STORE[doc_id]
    doc.durum = ProcessingStatus.ISLENIYOR

    try:
        extracted_data = gemini_extractor.extract_from_image(
            image_path=Path(doc.dosya_yolu),
            mime_type=doc.mime_type
        )
        doc.veri = extracted_data
        doc.durum = ProcessingStatus.TAMAMLANDI
        doc.hata_mesaji = None
    except Exception as e:
        doc.durum = ProcessingStatus.HATA
        doc.hata_mesaji = str(e)

    DOCUMENT_STORE[doc_id] = doc
    return doc

@router.post("/batch/process-all")
async def process_all_documents():
    results = []
    for doc_id, doc in list(DOCUMENT_STORE.items()):
        if doc.durum in (ProcessingStatus.KUYRUKTA, ProcessingStatus.HATA):
            doc.durum = ProcessingStatus.ISLENIYOR
            try:
                data = gemini_extractor.extract_from_image(Path(doc.dosya_yolu), doc.mime_type)
                doc.veri = data
                doc.durum = ProcessingStatus.TAMAMLANDI
                doc.hata_mesaji = None
            except Exception as e:
                doc.durum = ProcessingStatus.HATA
                doc.hata_mesaji = str(e)
            DOCUMENT_STORE[doc_id] = doc
            results.append(doc)
    return {"mesaj": "Toplu işlem tamamlandı", "islenen_adet": len(results)}

@router.post("/documents/{doc_id}/rotate", response_model=DocumentItem)
async def rotate_document(doc_id: str, req: RotateRequest):
    if doc_id not in DOCUMENT_STORE:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    doc = DOCUMENT_STORE[doc_id]
    file_path = Path(doc.dosya_yolu)
    thumb_path = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"

    image_processor.rotate_image(file_path, req.derece)
    image_processor.generate_thumbnail(file_path, thumb_path)

    doc.donus_acisi = (doc.donus_acisi + req.derece) % 360
    DOCUMENT_STORE[doc_id] = doc
    return doc

@router.put("/documents/{doc_id}", response_model=DocumentItem)
async def update_document_data(doc_id: str, req: DocumentUpdateRequest):
    if doc_id not in DOCUMENT_STORE:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    doc = DOCUMENT_STORE[doc_id]
    if doc.veri is None:
        doc.veri = IrsaliyeData()

    if req.header is not None:
        doc.veri.header = req.header
    if req.kalemler is not None:
        doc.veri.kalemler = req.kalemler
    if req.genel_toplam_miktar is not None:
        doc.veri.genel_toplam_miktar = req.genel_toplam_miktar
    if req.genel_notlar is not None:
        doc.veri.genel_notlar = req.genel_notlar
    if req.durum is not None:
        doc.durum = req.durum

    DOCUMENT_STORE[doc_id] = doc
    return doc

@router.post("/documents/merge", response_model=DocumentItem)
async def merge_documents(req: MergeDocumentsRequest):
    if req.target_doc_id not in DOCUMENT_STORE:
        raise HTTPException(status_code=404, detail="Hedef evrak bulunamadı.")

    target_doc = DOCUMENT_STORE[req.target_doc_id]
    if not target_doc.sayfalar:
        target_doc.sayfalar = [target_doc.dosya_url]

    merged_items = list(target_doc.veri.kalemler) if target_doc.veri and target_doc.veri.kalemler else []
    extra_notes = []

    for s_id in req.source_doc_ids:
        if s_id == req.target_doc_id:
            continue
        if s_id not in DOCUMENT_STORE:
            continue

        src_doc = DOCUMENT_STORE[s_id]
        # Sayfaları hedef evraka ekle
        if src_doc.sayfalar:
            for p in src_doc.sayfalar:
                if p not in target_doc.sayfalar:
                    target_doc.sayfalar.append(p)
        elif src_doc.dosya_url not in target_doc.sayfalar:
            target_doc.sayfalar.append(src_doc.dosya_url)

        # Kalemleri birleştir
        if src_doc.veri and src_doc.veri.kalemler:
            merged_items.extend(src_doc.veri.kalemler)

        # Notları birleştir
        if src_doc.veri and src_doc.veri.genel_notlar:
            extra_notes.append(src_doc.veri.genel_notlar)

        # Kaynak evrakı kuyruktan kaldır
        del DOCUMENT_STORE[s_id]

    # Kalemlerin sıra numaralarını 1'den başlatıp yeniden sırala
    for idx, item in enumerate(merged_items, 1):
        item.sira_no = idx

    if target_doc.veri:
        target_doc.veri.kalemler = merged_items
        target_doc.veri.genel_toplam_miktar = sum(k.miktar or 0 for k in merged_items)
        if extra_notes:
            existing = target_doc.veri.genel_notlar or ""
            target_doc.veri.genel_notlar = f"{existing} | {' | '.join(extra_notes)}".strip(" |")

    DOCUMENT_STORE[req.target_doc_id] = target_doc
    return target_doc

@router.delete("/documents/{doc_id}")

async def delete_document(doc_id: str):
    if doc_id in DOCUMENT_STORE:
        doc = DOCUMENT_STORE.pop(doc_id)
        try:
            if os.path.exists(doc.dosya_yolu):
                os.remove(doc.dosya_yolu)
            thumb = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"
            if thumb.exists():
                thumb.unlink()
        except Exception:
            pass
    return {"mesaj": "Belge silindi", "id": doc_id}

@router.delete("/documents")
async def clear_all_documents():
    for doc in list(DOCUMENT_STORE.values()):
        try:
            if os.path.exists(doc.dosya_yolu):
                os.remove(doc.dosya_yolu)
            thumb = settings.UPLOAD_DIR / f"thumb_{doc.id}.jpg"
            if thumb.exists():
                thumb.unlink()
        except Exception:
            pass
    DOCUMENT_STORE.clear()
    return {"mesaj": "Kuyruk temizlendi"}

@router.get("/documents/{doc_id}/export-excel")
async def export_single_excel(doc_id: str):
    if doc_id not in DOCUMENT_STORE:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")

    doc = DOCUMENT_STORE[doc_id]
    if not doc.veri:
        raise HTTPException(status_code=400, detail="Belgede henüz ayrıştırılmış veri yok.")

    export_path = excel_exporter.export_single_document(doc)
    irsaliye_no = doc.veri.header.irsaliye_no or doc_id[:8]
    filename = f"Irsaliye_{irsaliye_no}.xlsx"
    return FileResponse(
        path=export_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@router.get("/batch/export-excel")
async def export_batch_excel():
    docs_with_data = [d for d in DOCUMENT_STORE.values() if d.veri is not None]
    if not docs_with_data:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak işlenmiş irsaliye bulunamadı.")

    export_path = excel_exporter.export_batch_summary(list(DOCUMENT_STORE.values()))
    date_str = datetime.now().strftime("%Y%m%d_%H%M")
    filename = f"Toplu_Irsaliye_Raporu_{date_str}.xlsx"
    return FileResponse(
        path=export_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@router.get("/documents/{doc_id}/export-logo-xml")
async def export_single_logo_xml(doc_id: str):
    if doc_id not in DOCUMENT_STORE:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    doc = DOCUMENT_STORE[doc_id]
    if not doc.veri:
        raise HTTPException(status_code=400, detail="Belgede henüz ayrıştırılmış veri yok.")
    export_path = erp_exporter.export_single_logo_xml(doc)
    irsaliye_no = doc.veri.header.irsaliye_no or doc_id[:8]
    return FileResponse(
        path=export_path,
        filename=f"Logo_Irsaliye_{irsaliye_no}.xml",
        media_type="application/xml"
    )

@router.get("/documents/{doc_id}/export-json")
async def export_single_json(doc_id: str):
    if doc_id not in DOCUMENT_STORE:
        raise HTTPException(status_code=404, detail="Belge bulunamadı.")
    doc = DOCUMENT_STORE[doc_id]
    if not doc.veri:
        raise HTTPException(status_code=400, detail="Belgede henüz ayrıştırılmış veri yok.")
    export_path = erp_exporter.export_single_erp_json(doc)
    irsaliye_no = doc.veri.header.irsaliye_no or doc_id[:8]
    return FileResponse(
        path=export_path,
        filename=f"DocuLog_Irsaliye_{irsaliye_no}.json",
        media_type="application/json"
    )

@router.get("/batch/export-logo-xml")
async def export_batch_logo_xml():
    docs_with_data = [d for d in DOCUMENT_STORE.values() if d.veri is not None]
    if not docs_with_data:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak işlenmiş irsaliye bulunamadı.")
    export_path = erp_exporter.export_batch_logo_xml(list(DOCUMENT_STORE.values()))
    date_str = datetime.now().strftime("%Y%m%d_%H%M")
    return FileResponse(
        path=export_path,
        filename=f"Logo_Toplu_Irsaliyeler_{date_str}.xml",
        media_type="application/xml"
    )

@router.get("/batch/export-json")
async def export_batch_json():
    docs_with_data = [d for d in DOCUMENT_STORE.values() if d.veri is not None]
    if not docs_with_data:
        raise HTTPException(status_code=400, detail="Dışa aktarılacak işlenmiş irsaliye bulunamadı.")
    export_path = erp_exporter.export_batch_erp_json(list(DOCUMENT_STORE.values()))
    date_str = datetime.now().strftime("%Y%m%d_%H%M")
    return FileResponse(
        path=export_path,
        filename=f"DocuLog_Toplu_Irsaliyeler_{date_str}.json",
        media_type="application/json"
    )


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics():
    """
    Kuyruktaki tüm irsaliyelerden gerçek zamanlı lojistik KPI, zaman serisi,
    tedarikçi dağılımı, ürün frekansları ve operasyonel durum analizini döner.
    """
    docs = list(DOCUMENT_STORE.values())
    return analytics_service.compute_analytics(docs)


@router.get("/analytics/export-report")
async def export_executive_report_endpoint():
    """
    Lojistik Yönetici Kokpiti için resmi, çok sayfalı (Yonetici_Ozeti, Tedarikci_Dagilimi,
    En_Cok_Gelen_Kalemler, Evrak_Dokumu) kurumsal Excel raporu üretir ve indirir.
    """
    docs = list(DOCUMENT_STORE.values())
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
    masked = f"{key[:6]}...{key[-4:]}" if is_set and len(key) > 10 else ("Tanımlı" if is_set else "Tanımsız")
    return {
        "is_configured": is_set,
        "masked_key": masked,
        "model": settings.GEMINI_MODEL
    }

@router.post("/settings/api-key")
async def save_api_key(req: ApiKeyRequest):
    key = req.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Geçersiz API anahtarı.")

    os.environ["GEMINI_API_KEY"] = key
    settings.GEMINI_API_KEY = key
    gemini_extractor.api_key = key
    gemini_extractor._client = None

    # .env dosyalarına güvenli yazım
    for target_dir in (settings.WORKSPACE_DIR, settings.BACKEND_DIR):
        env_file = target_dir / ".env"
        try:
            lines = []
            if env_file.exists():
                with open(env_file, "r", encoding="utf-8") as f:
                    lines = f.readlines()
            
            has_key = False
            new_lines = []
            for line in lines:
                if line.startswith("GEMINI_API_KEY="):
                    new_lines.append(f"GEMINI_API_KEY={key}\n")
                    has_key = True
                else:
                    new_lines.append(line)
            if not has_key:
                new_lines.append(f"GEMINI_API_KEY={key}\n")

            with open(env_file, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
        except Exception as e:
            print(f"{env_file} yazılamadı: {e}")

    return {"mesaj": "API Anahtarı başarıyla güncellendi", "is_configured": True}


# --- Telefondan Canlı Yükleme (Mobile QR Bridge) Uç Noktaları ---

@router.get("/qr-url")
async def get_qr_url(session_id: Optional[str] = None):
    """
    Yerel ağ IP adresini otomatik tespit eder ve telefonun bağlanacağı
    özel session URL'sini ve yüksek çözünürlüklü QR kodunu döner.
    """
    if not session_id:
        session_id = uuid.uuid4().hex[:12]

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
    """
    Telefondan çekilen bir veya birden fazla sayfayı (Çok Sayfalı İrsaliye)
    kuyruğa alır ve WebSocket üzerinden masaüstüne canlı aktarır.
    """
    all_files = list(files) if files else []
    if file:
        all_files.append(file)

    if not all_files:
        raise HTTPException(status_code=400, detail="Hiçbir dosya gönderilmedi")

    doc_id = str(uuid.uuid4())
    page_urls: List[str] = []
    first_file_path = None
    total_bytes = 0

    for idx, f in enumerate(all_files):
        ext = f.filename.split(".")[-1].lower() if "." in f.filename else "jpg"
        if ext not in settings.ALLOWED_EXTENSIONS:
            continue
        safe_filename = f"mobile_{doc_id}_p{idx+1}_{f.filename}"
        file_path = settings.UPLOAD_DIR / safe_filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        
        file_bytes = os.path.getsize(file_path)
        total_bytes += file_bytes
        url = f"/uploads/{safe_filename}"
        page_urls.append(url)
        if idx == 0:
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
    )

    DOCUMENT_STORE[doc_id] = doc_item

    # Masaüstü oturumuna WebSocket üzerinden canlı sinyal gönder
    await ws_manager.send_to_session(session_id, {
        "type": "DOCUMENT_UPLOADED",
        "session_id": session_id,
        "document": doc_item.model_dump()
    })

    # Tüm bağlı dinleyicilere genel bildirim yayınla
    await ws_manager.broadcast_all({
        "type": "NEW_DOCUMENT_IN_QUEUE",
        "session_id": session_id,
        "document_id": doc_id
    })

    return doc_item


@router.websocket("/ws/{session_id}")
async def router_websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    APIRouter seviyesinde WebSocket kanalı (/api/ws/{session_id})
    """
    await ws_manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, session_id)
    except Exception:
        ws_manager.disconnect(websocket, session_id)

