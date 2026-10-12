from typing import List, Optional
from pydantic import BaseModel
from .irsaliye import DocumentItem

class BatchSummary(BaseModel):
    toplam_belge: int = 0
    kuyrukta: int = 0
    islenen: int = 0
    tamamlanan: int = 0
    hatali: int = 0
    onaylanan: int = 0

class QueueResponse(BaseModel):
    documents: List[DocumentItem]
    summary: BatchSummary

class RotateRequest(BaseModel):
    derece: int = 90  # 90 veya -90 (270)
