import os
import uuid
import asyncio
import unittest
from pathlib import Path
from PIL import Image
import qrcode
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.config import settings
from backend.app.models.irsaliye import DocumentItem, ProcessingStatus, IrsaliyeData, IrsaliyeHeader
from backend.app.services.document_repo import doc_repo
from backend.app.services.gemini_extractor import gemini_extractor, GeminiRateLimitError
from backend.app.services.queue_manager import queue_manager, GLOBAL_AI_SEMAPHORE
from backend.app.services.qr_scanner import gib_qr_scanner


class TestQueueAndQRInjection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    def test_queue_status_api_endpoint(self):
        """GET /api/system/queue-status anlık metrik endpoint testi"""
        res = self.client.get("/api/system/queue-status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("concurrency_limit", data)
        self.assertEqual(data["concurrency_limit"], 2)
        self.assertIn("active_workers", data)
        self.assertIn("queued_tasks", data)
        self.assertIn("total_retried", data)
        self.assertIn("total_completed", data)

    def test_qr_first_prescan_and_enrichment(self):
        """QR kod içeren görselden QR-First ön tarama ve veri zenginleştirme testi"""
        qr_content = "3340058912|8460012948|e1e2e3e4-1111-2222-3333-444455556666|EKL2024000012490|22.10.2024"
        qr_img = qrcode.make(qr_content)
        
        canvas = Image.new("RGB", (600, 800), color="white")
        canvas.paste(qr_img.resize((150, 150)), (420, 30))
        
        test_file = settings.UPLOAD_DIR / f"test_qr_anchor_{uuid.uuid4().hex[:6]}.jpg"
        canvas.save(test_file, "JPEG")

        try:
            # extract_from_image çağrısı (API keysiz fallback modunda bile QR zenginleştirmesi yapmalı)
            extracted = gemini_extractor.extract_from_image(image_path=test_file)
            self.assertIsNotNone(extracted.header)
            self.assertEqual(extracted.header.irsaliye_no, "EKL2024000012490")
            self.assertEqual(extracted.header.gonderici_vkn, "3340058912")
            self.assertEqual(extracted.header.ettn, "e1e2e3e4-1111-2222-3333-444455556666")
            self.assertIn("e1e2e3e4-1111-2222-3333-444455556666", extracted.genel_notlar or "")
        finally:
            if test_file.exists():
                test_file.unlink()

    def test_queue_concurrency_and_backoff_retry(self):
        """Kuyruk yöneticisinin 429 durumunda otomatik backoff retry yapması testi"""
        doc_id = f"test_backoff_{uuid.uuid4().hex[:6]}"
        dummy_file = settings.UPLOAD_DIR / f"{doc_id}.jpg"
        img = Image.new("RGB", (50, 50), color="blue")
        img.save(dummy_file, "JPEG")

        doc = DocumentItem(
            id=doc_id,
            dosya_adi="test_backoff.jpg",
            dosya_yolu=str(dummy_file),
            dosya_url=f"/uploads/{dummy_file.name}",
            mime_type="image/jpeg",
            boyut_bytes=os.path.getsize(dummy_file),
            yuklenme_tarihi="24.10.2026 12:00",
            durum=ProcessingStatus.KUYRUKTA
        )
        doc_repo.save(doc)

        attempts = 0
        def flaky_extractor(d_id: str):
            nonlocal attempts
            attempts += 1
            cur_doc = doc_repo.get_by_id(d_id)
            if attempts == 1:
                cur_doc.durum = ProcessingStatus.HATA
                cur_doc.hata_mesaji = "Gemini API kota sınırı aşıldı (429 Rate Limit)"
                doc_repo.save(cur_doc)
            else:
                cur_doc.durum = ProcessingStatus.TAMAMLANDI
                cur_doc.hata_mesaji = None
                cur_doc.veri = IrsaliyeData(header=IrsaliyeHeader(irsaliye_no="RETRY-SUCCESS-01"))
                doc_repo.save(cur_doc)

        async def run_test():
            # Hızlı test için retry delay'lerini küçük tutuyoruz (0.05s)
            result = await queue_manager.process_document_safe(
                doc_id=doc_id,
                extractor_func=flaky_extractor,
                max_retries=2,
                delays=(0.05, 0.1)
            )
            return result

        loop = asyncio.new_event_loop()
        final_doc = loop.run_until_complete(run_test())
        loop.close()

        self.assertEqual(attempts, 2, "İlk 429 hatasından sonra otomatik retry çalışmadı!")
        self.assertIsNotNone(final_doc)
        self.assertEqual(final_doc.durum, ProcessingStatus.TAMAMLANDI)
        self.assertEqual(final_doc.veri.header.irsaliye_no, "RETRY-SUCCESS-01")

        # Temizlik
        doc_repo.delete(doc_id, delete_files=True)


if __name__ == "__main__":
    unittest.main()
