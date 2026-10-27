import asyncio
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from ..core.config import settings
from ..models.irsaliye import DocumentItem, ProcessingStatus
from ..services.document_repo import doc_repo
from ..services.connection_manager import ws_manager

logger = logging.getLogger(__name__)

GLOBAL_AI_SEMAPHORE = asyncio.Semaphore(2)


class QueueManager:
    """
    DocuLog İş İstasyonu Küresel Eşzamanlılık ve Kuyruk Yönetim Motoru.
    - Tüm tekil, toplu ve mobil yapay zeka işlemlerini 2 eşzamanlı worker ile sınırlar (503 burst koruması).
    - Ağır OCR ve OpenCV deskew işlemlerini izole bir ThreadPoolExecutor'da çalıştırarak event loop açlığını önler.
    - 429 Rate Limit durumunda otomatik üstel geri çekilme (exponential backoff: 1.5s, 3.0s) uygular.
    - Canlı izlenebilir kuyruk metrikleri sunar.
    """

    def __init__(self, max_concurrent: int = 2):
        self.semaphore = GLOBAL_AI_SEMAPHORE
        self.max_concurrent = max_concurrent
        self.active_workers: int = 0
        self.queued_tasks: int = 0
        self.total_completed: int = 0
        self.total_failed: int = 0
        self.total_retried: int = 0
        self._lock = asyncio.Lock()
        # Ağır görüntü işleme ve API çağrıları için ayrılmış thread havuzu
        self._executor = ThreadPoolExecutor(
            max_workers=max(4, max_concurrent * 2),
            thread_name_prefix="doculog_ai_worker"
        )

    def get_status(self) -> Dict[str, Any]:
        """Anlık kuyruk ve eşzamanlılık metriklerini döndürür"""
        return {
            "max_concurrent": self.max_concurrent,
            "active_workers": self.active_workers,
            "queued_tasks": self.queued_tasks,
            "total_completed": self.total_completed,
            "total_failed": self.total_failed,
            "total_retried": self.total_retried,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

    async def broadcast_status(self):
        """Kuyruk durumunu WebSocket üzerinden yayınlar"""
        try:
            await ws_manager.broadcast_all({
                "type": "QUEUE_STATUS_UPDATED",
                "queue_status": self.get_status()
            })
        except Exception as ws_err:
            logger.debug(f"Queue status WS yayını atlandı: {ws_err}")

    async def process_document_safe(
        self,
        doc_id: str,
        extractor_func,
        max_retries: int = 2,
        delays: Tuple[float, ...] = (1.5, 3.0)
    ) -> Optional[DocumentItem]:
        """
        Belgeyi global semaphore altında çalıştırır, 429 durumunda otomatik backoff retry uygular.
        """
        async with self._lock:
            self.queued_tasks += 1
        await self.broadcast_status()

        worker_active = False
        try:
            async with self.semaphore:
                async with self._lock:
                    self.queued_tasks = max(0, self.queued_tasks - 1)
                    self.active_workers += 1
                    worker_active = True
                await self.broadcast_status()

                loop = asyncio.get_event_loop()
                last_doc: Optional[DocumentItem] = None

                for attempt in range(max_retries + 1):
                    # Senkron AI çıkarma işlemini executor'da 75 saniye zaman aşımı garantisiyle çalıştır
                    try:
                        await asyncio.wait_for(
                            loop.run_in_executor(self._executor, extractor_func, doc_id),
                            timeout=75.0
                        )
                    except asyncio.TimeoutError:
                        logger.error(f"[QueueManager TIMEOUT] Belge {doc_id} 75 saniye içinde yanıt vermedi, zaman aşımına uğratıldı.")
                        timed_out_doc = doc_repo.get_by_id(doc_id)
                        if timed_out_doc:
                            timed_out_doc.durum = ProcessingStatus.HATA
                            timed_out_doc.hata_mesaji = "Zaman Aşımı: İşlem 75 saniye içinde tamamlanamadı."
                            doc_repo.save(timed_out_doc, create_if_missing=False)
                    last_doc = doc_repo.get_by_id(doc_id)

                    # 429 Rate Limit ve 503/504 Service Overload kontrolü ve exponential backoff
                    is_rate_or_overload = (
                        last_doc
                        and last_doc.durum == ProcessingStatus.HATA
                        and last_doc.hata_mesaji
                        and (
                            "429" in last_doc.hata_mesaji
                            or "kota" in last_doc.hata_mesaji.lower()
                            or "yoğunluk" in last_doc.hata_mesaji.lower()
                            or "503" in last_doc.hata_mesaji
                            or "504" in last_doc.hata_mesaji
                            or "overloaded" in last_doc.hata_mesaji.lower()
                        )
                    )

                    if is_rate_or_overload and attempt < max_retries:
                        delay = delays[min(attempt, len(delays) - 1)]
                        async with self._lock:
                            self.total_retried += 1
                        logger.warning(
                            f"[Burst Limiter] Belge {doc_id} geçici API yükü/kota aldı. {delay}s üstel gecikmeyle tekrar deneniyor (Deneme {attempt + 1}/{max_retries})..."
                        )
                        last_doc.durum = ProcessingStatus.ISLENIYOR
                        last_doc.hata_mesaji = f"Geçici sunucu yoğunluğu, {delay}s sonra otomatik yeniden deneniyor..."
                        doc_repo.save(last_doc, create_if_missing=False)
                        await self.broadcast_status()
                        await asyncio.sleep(delay)
                        continue
                    
                    break

                async with self._lock:
                    if last_doc and last_doc.durum == ProcessingStatus.TAMAMLANDI:
                        self.total_completed += 1
                    else:
                        self.total_failed += 1

                return last_doc

        except asyncio.CancelledError:
            logger.warning(f"[QueueManager İPTAL] Belge {doc_id} görevi istemci bağlantı iptali nedeniyle sonlandırıldı.")
            canceled_doc = doc_repo.get_by_id(doc_id)
            if canceled_doc and canceled_doc.durum == ProcessingStatus.ISLENIYOR:
                canceled_doc.durum = ProcessingStatus.HATA
                canceled_doc.hata_mesaji = "İstemci bağlantısı koptuğu için işlem durduruldu."
                doc_repo.save(canceled_doc, create_if_missing=False)
            raise
        except Exception as e:
            async with self._lock:
                self.total_failed += 1
            logger.error(f"[QueueManager HATA] Belge {doc_id} işlenirken istisna: {e}")
            raise
        finally:
            if worker_active:
                async with self._lock:
                    self.active_workers = max(0, self.active_workers - 1)
            await self.broadcast_status()


queue_manager = QueueManager(max_concurrent=2)
