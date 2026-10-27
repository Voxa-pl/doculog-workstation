"""
DocuLog Logistics Enterprise - Documents API Endpoint
Hafif ve ultra-hızlı evrak listeleme ve kuyruk yönetimi.
- orjson ve bellek içi bayt önbelleği ile FastAPI jsonable_encoder darboğazını ortadan kaldırır.
- Kuyruk transferinde devasa blob veya tekrarlı verileri süzer (data:image/ ve 64KB+ alanlar).
- GZipMiddleware ile tam uyumlu çalışarak ağ yükünü %85+ oranında küçültür.
"""

from fastapi import APIRouter, Response
from ...models.batch import QueueResponse
from ...services.document_repo import doc_repo

router = APIRouter(tags=["documents"])

@router.get("/documents", response_model=QueueResponse)
@router.get("", response_model=QueueResponse)
async def list_documents():
    """
    Evrak kuyruk listesi:
    Tüm evrakları ve kuyruk durum özetini yüksek hızlı önbellekli serializer ile döndürür.
    """
    payload_bytes = doc_repo.get_cached_queue_response_bytes()
    return Response(content=payload_bytes, media_type="application/json")
