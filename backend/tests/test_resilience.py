import io
import os
import time
import uuid
import threading
import unittest
from pathlib import Path
from PIL import Image

from backend.app.core.config import settings
from backend.app.models.db import engine, SessionLocal, DocumentModel
from backend.app.models.irsaliye import (
    DocumentItem,
    ProcessingStatus,
    IrsaliyeData,
    IrsaliyeHeader,
    LineItem
)
from backend.app.services.document_repo import doc_repo, DocumentRepository
from backend.app.services.gemini_extractor import (
    gemini_extractor,
    GeminiRateLimitError,
    GeminiTimeoutError,
    GeminiNetworkError,
    GeminiExtractionError
)
from backend.app.api.routes import _run_ai_extraction


class TestBackendResilience(unittest.TestCase):
    def setUp(self):
        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # =========================================================================
    # 1. SQLITE WAL MODU VE EŞZAMANLI YAZMA TESTLERİ
    # =========================================================================

    def test_sqlite_wal_and_busy_timeout_pragmas(self):
        """SQLite motorunun WAL modunda ve 5000ms busy_timeout ile çalıştığını doğrula"""
        with engine.connect() as conn:
            journal_mode = conn.exec_driver_sql("PRAGMA journal_mode;").scalar()
            busy_timeout = conn.exec_driver_sql("PRAGMA busy_timeout;").scalar()
            foreign_keys = conn.exec_driver_sql("PRAGMA foreign_keys;").scalar()

        self.assertEqual(
            str(journal_mode).lower(), "wal",
            f"SQLite WAL modunda değil! Mevcut mod: {journal_mode}"
        )
        self.assertGreaterEqual(
            int(busy_timeout), 5000,
            f"SQLite busy_timeout 5000ms altında! Mevcut: {busy_timeout}"
        )
        self.assertEqual(
            int(foreign_keys), 1,
            f"SQLite foreign_keys aktif değil!"
        )

    def test_concurrent_sqlite_writes(self):
        """Yoğun eşzamanlı yazma durumunda 'database is locked' olmadan tüm yazmaların tamamlanması"""
        num_threads = 10
        writes_per_thread = 5
        errors = []
        created_doc_ids = []

        def worker(thread_idx: int):
            for i in range(writes_per_thread):
                doc_id = f"concurr_{thread_idx}_{i}_{uuid.uuid4().hex[:6]}"
                created_doc_ids.append(doc_id)
                item = DocumentItem(
                    id=doc_id,
                    dosya_adi=f"concurrent_test_{doc_id}.jpg",
                    dosya_yolu=str(settings.UPLOAD_DIR / f"{doc_id}.jpg"),
                    dosya_url=f"/uploads/{doc_id}.jpg",
                    mime_type="image/jpeg",
                    boyut_bytes=1024,
                    yuklenme_tarihi="23.10.2026 10:00",
                    durum=ProcessingStatus.KUYRUKTA,
                    veri=None,
                    sayfalar=[f"/uploads/{doc_id}.jpg"]
                )
                try:
                    doc_repo.save(item)
                except Exception as ex:
                    errors.append(f"Thread {thread_idx} yazma hatası: {ex}")

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Eşzamanlı yazma sırasında hatalar oluştu: {errors}")

        # Kaydedilenlerin tümünün okunabilirliğini teyit et ve temizle
        for doc_id in created_doc_ids:
            found = doc_repo.get_by_id(doc_id)
            self.assertIsNotNone(found, f"Kaydedilen belge veritabanında bulunamadı: {doc_id}")
            doc_repo.delete(doc_id, delete_files=False)

    # =========================================================================
    # 2. YETİM DOSYA & FİZİKSEL TEMİZLİK & ROLLBACK TESTLERİ
    # =========================================================================

    def test_document_deletion_removes_physical_files_and_thumbnails(self):
        """Belge silindiğinde diskteki fiziksel görsellerin ve oluşturulan thumbnail'ların silinmesi"""
        doc_id = f"file_clean_test_{uuid.uuid4().hex[:8]}"
        main_file = settings.UPLOAD_DIR / f"{doc_id}_irsaliye.jpg"
        thumb_file = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"
        extra_page = settings.UPLOAD_DIR / f"{doc_id}_page2.jpg"

        # Dosyaları disk üzerinde oluştur
        img = Image.new("RGB", (100, 100), color="green")
        img.save(main_file, "JPEG")
        img.save(thumb_file, "JPEG")
        img.save(extra_page, "JPEG")

        self.assertTrue(main_file.exists())
        self.assertTrue(thumb_file.exists())
        self.assertTrue(extra_page.exists())

        doc_item = DocumentItem(
            id=doc_id,
            dosya_adi="irsaliye.jpg",
            dosya_yolu=str(main_file),
            dosya_url=f"/uploads/{main_file.name}",
            mime_type="image/jpeg",
            boyut_bytes=os.path.getsize(main_file),
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.TAMAMLANDI,
            veri=None,
            sayfalar=[f"/uploads/{main_file.name}", f"/uploads/{extra_page.name}"]
        )
        doc_repo.save(doc_item)

        # Belgeyi sil
        deleted = doc_repo.delete(doc_id, delete_files=True)
        self.assertTrue(deleted)

        # Veritabanında silindiğini doğrula
        self.assertIsNone(doc_repo.get_by_id(doc_id))

        # Diskteki ana dosya, thumbnail ve ek sayfanın silindiğini doğrula
        self.assertFalse(main_file.exists(), f"Ana dosya silinmedi: {main_file}")
        self.assertFalse(thumb_file.exists(), f"Thumbnail silinmedi: {thumb_file}")
        self.assertFalse(extra_page.exists(), f"Ek sayfa görseli silinmedi: {extra_page}")

    def test_transaction_rollback_preserves_files_on_db_failure(self):
        """Veritabanı işleminde hata olursa transaction'ın rollback edildiğini doğrula"""
        doc_id = f"rollback_test_{uuid.uuid4().hex[:8]}"
        main_file = settings.UPLOAD_DIR / f"{doc_id}.jpg"
        img = Image.new("RGB", (50, 50), color="red")
        img.save(main_file, "JPEG")

        doc_item = DocumentItem(
            id=doc_id,
            dosya_adi="rollback.jpg",
            dosya_yolu=str(main_file),
            dosya_url=f"/uploads/{main_file.name}",
            mime_type="image/jpeg",
            boyut_bytes=os.path.getsize(main_file),
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.KUYRUKTA
        )
        doc_repo.save(doc_item)

        # Simüle edilmiş veritabanı hatası ile delete işlemi
        class MockFailingSession:
            def __init__(self):
                self.rolled_back = False
            def __enter__(self):
                return self
            def __exit__(self, exc_type, exc_val, exc_tb):
                return False
            def query(self, *args, **kwargs):
                raise RuntimeError("Simüle edilmiş veritabanı kilitlenme/kesinti hatası")
            def rollback(self):
                self.rolled_back = True
            def delete(self, *args):
                pass
            def commit(self):
                pass

        mock_session_instance = MockFailingSession()
        original_get_db = DocumentRepository.get_db
        try:
            DocumentRepository.get_db = staticmethod(lambda: mock_session_instance)
            with self.assertRaises(RuntimeError):
                doc_repo.delete(doc_id, delete_files=True)
        finally:
            DocumentRepository.get_db = original_get_db

        # Transaction rollback çağrılmış olmalı
        self.assertTrue(mock_session_instance.rolled_back, "db.rollback() çağrılmadı!")
        # Veritabanı ve dosya korunmuş olmalı
        self.assertTrue(main_file.exists(), "Rollback olmasına rağmen dosya yanlışlıkla silindi!")
        self.assertIsNotNone(doc_repo.get_by_id(doc_id), "Belge veritabanından hatalı şekilde silinmiş!")

        # Gerçek temizlik
        doc_repo.delete(doc_id, delete_files=True)

    def test_orphan_file_scanner_and_cleanup(self):
        """Veritabanında kaydı olmayan yetim görsel ve thumbnail'ların taranıp temizlenmesi"""
        orphan_main = settings.UPLOAD_DIR / f"orphan_{uuid.uuid4().hex[:8]}.jpg"
        orphan_thumb = settings.UPLOAD_DIR / f"thumb_orphan_{uuid.uuid4().hex[:8]}.jpg"

        img = Image.new("RGB", (50, 50), color="yellow")
        img.save(orphan_main, "JPEG")
        img.save(orphan_thumb, "JPEG")

        self.assertTrue(orphan_main.exists())
        self.assertTrue(orphan_thumb.exists())

        # Yetim temizliğini çalıştır
        deleted_list = doc_repo.cleanup_orphan_files()

        self.assertIn(orphan_main.name, deleted_list)
        self.assertIn(orphan_thumb.name, deleted_list)
        self.assertFalse(orphan_main.exists())
        self.assertFalse(orphan_thumb.exists())

    # =========================================================================
    # 3. GEMINI API HATA YÖNETİMİ & AĞ RESILIENCE TESTLERİ
    # =========================================================================

    def test_gemini_rate_limit_429_handling(self):
        """Gemini 429 kota aşımında uygulamanın çökmeden evrak durumunu HATA ve açıklayıcı mesaja set etmesi"""
        doc_id = f"test_429_{uuid.uuid4().hex[:8]}"
        dummy_file = settings.UPLOAD_DIR / f"{doc_id}.jpg"
        img = Image.new("RGB", (50, 50), color="gray")
        img.save(dummy_file, "JPEG")

        doc_item = DocumentItem(
            id=doc_id,
            dosya_adi="irsaliye_429.jpg",
            dosya_yolu=str(dummy_file),
            dosya_url=f"/uploads/{dummy_file.name}",
            mime_type="image/jpeg",
            boyut_bytes=os.path.getsize(dummy_file),
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.ISLENIYOR
        )
        doc_repo.save(doc_item)

        def mock_extract_429(*args, **kwargs):
            raise GeminiRateLimitError("Gemini API kota sınırı aşıldı (429 Rate Limit / Quota Exceeded).")

        orig_extract = gemini_extractor.extract_from_image
        try:
            gemini_extractor.extract_from_image = mock_extract_429
            # _run_ai_extraction arka planda çağrıldığında çökmemeli
            _run_ai_extraction(doc_id)
        finally:
            gemini_extractor.extract_from_image = orig_extract

        updated = doc_repo.get_by_id(doc_id)
        self.assertEqual(updated.durum, ProcessingStatus.HATA)
        self.assertIn("Kota Sınırı (429 Rate Limit)", updated.hata_mesaji)

        # Temizlik
        doc_repo.delete(doc_id, delete_files=True)

    def test_gemini_timeout_handling(self):
        """Gemini zaman aşımı (Timeout) durumunda güvenli try/except yönetimi"""
        doc_id = f"test_timeout_{uuid.uuid4().hex[:8]}"
        dummy_file = settings.UPLOAD_DIR / f"{doc_id}.jpg"
        img = Image.new("RGB", (50, 50), color="gray")
        img.save(dummy_file, "JPEG")

        doc_item = DocumentItem(
            id=doc_id,
            dosya_adi="irsaliye_timeout.jpg",
            dosya_yolu=str(dummy_file),
            dosya_url=f"/uploads/{dummy_file.name}",
            mime_type="image/jpeg",
            boyut_bytes=os.path.getsize(dummy_file),
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.ISLENIYOR
        )
        doc_repo.save(doc_item)

        def mock_extract_timeout(*args, **kwargs):
            raise GeminiTimeoutError("Gemini API yanıt zaman aşımına uğradı (Timeout 30s).")

        orig_extract = gemini_extractor.extract_from_image
        try:
            gemini_extractor.extract_from_image = mock_extract_timeout
            _run_ai_extraction(doc_id)
        finally:
            gemini_extractor.extract_from_image = orig_extract

        updated = doc_repo.get_by_id(doc_id)
        self.assertEqual(updated.durum, ProcessingStatus.HATA)
        self.assertIn("Zaman Aşımı (Timeout)", updated.hata_mesaji)

        # Temizlik
        doc_repo.delete(doc_id, delete_files=True)

    def test_gemini_network_disconnect_handling(self):
        """Gemini ağ kopması / sunucuya erişilememesi durumunda güvenli hata yakalama"""
        doc_id = f"test_net_{uuid.uuid4().hex[:8]}"
        dummy_file = settings.UPLOAD_DIR / f"{doc_id}.jpg"
        img = Image.new("RGB", (50, 50), color="gray")
        img.save(dummy_file, "JPEG")

        doc_item = DocumentItem(
            id=doc_id,
            dosya_adi="irsaliye_net.jpg",
            dosya_yolu=str(dummy_file),
            dosya_url=f"/uploads/{dummy_file.name}",
            mime_type="image/jpeg",
            boyut_bytes=os.path.getsize(dummy_file),
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.ISLENIYOR
        )
        doc_repo.save(doc_item)

        def mock_extract_network(*args, **kwargs):
            raise GeminiNetworkError("Gemini API sunucusuna ulaşılamadı (Network Error / Ağ Kopması).")

        orig_extract = gemini_extractor.extract_from_image
        try:
            gemini_extractor.extract_from_image = mock_extract_network
            _run_ai_extraction(doc_id)
        finally:
            gemini_extractor.extract_from_image = orig_extract

        updated = doc_repo.get_by_id(doc_id)
        self.assertEqual(updated.durum, ProcessingStatus.HATA)
        self.assertIn("Ağ Bağlantı Kopması", updated.hata_mesaji)

        # Temizlik
        doc_repo.delete(doc_id, delete_files=True)


if __name__ == "__main__":
    unittest.main()
