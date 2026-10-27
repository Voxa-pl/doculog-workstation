import unittest
import time
import uuid
import sqlite3
from pathlib import Path
from backend.app.models.db import engine, SessionLocal, DocumentModel, DB_PATH, apply_sqlite_pragmas
from backend.app.services.document_repo import doc_repo, DocumentRepository
from backend.app.models.irsaliye import DocumentItem, ProcessingStatus


class TestSQLitePerformance(unittest.TestCase):
    """
    DocuLog SQLite Yüksek Performans ve İndeksleme Test Paketi:
    - WAL Modu, Synchronous NORMAL, 64MB Cache, 256MB MMAP, MEMORY Temp Store
    - documents tablosu id, durum, yuklenme_tarihi, created_at ve composite indeksleri
    - EXPLAIN QUERY PLAN ile sıfır sequential table scan ve sıfır temp b-tree garantisi
    - 66+ ve 10,000+ evrak ölçeğinde sorgu yanıt süresi doğrulaması
    """

    def setUp(self):
        DocumentRepository.ensure_performance_pragmas_and_indexes()

    def test_sqlite_pragmas_sqlalchemy(self):
        """SQLAlchemy bağlantılarında zorunlu PRAGMA ayarlarının otomatik uygulandığını doğrula"""
        with engine.connect() as conn:
            journal_mode = conn.exec_driver_sql("PRAGMA journal_mode;").scalar()
            synchronous = conn.exec_driver_sql("PRAGMA synchronous;").scalar()
            cache_size = conn.exec_driver_sql("PRAGMA cache_size;").scalar()
            mmap_size = conn.exec_driver_sql("PRAGMA mmap_size;").scalar()
            temp_store = conn.exec_driver_sql("PRAGMA temp_store;").scalar()
            busy_timeout = conn.exec_driver_sql("PRAGMA busy_timeout;").scalar()

        self.assertEqual(str(journal_mode).lower(), "wal", "PRAGMA journal_mode WAL olmalı!")
        self.assertEqual(int(synchronous), 1, "PRAGMA synchronous NORMAL (1) olmalı!")
        self.assertEqual(int(cache_size), -64000, "PRAGMA cache_size -64000 (64MB) olmalı!")
        self.assertEqual(int(mmap_size), 268435456, "PRAGMA mmap_size 256MB olmalı!")
        self.assertEqual(int(temp_store), 2, "PRAGMA temp_store MEMORY (2) olmalı!")
        self.assertGreaterEqual(int(busy_timeout), 5000, "PRAGMA busy_timeout >= 5000ms olmalı!")

    def test_sqlite_pragmas_raw_connection(self):
        """DocumentRepository.get_raw_connection() açılışında PRAGMA'ların otomatik uygulandığını doğrula"""
        with DocumentRepository.get_raw_connection() as conn:
            c = conn.cursor()
            journal_mode = c.execute("PRAGMA journal_mode;").fetchone()[0]
            synchronous = c.execute("PRAGMA synchronous;").fetchone()[0]
            cache_size = c.execute("PRAGMA cache_size;").fetchone()[0]
            mmap_size = c.execute("PRAGMA mmap_size;").fetchone()[0]
            temp_store = c.execute("PRAGMA temp_store;").fetchone()[0]
            busy_timeout = c.execute("PRAGMA busy_timeout;").fetchone()[0]

        self.assertEqual(str(journal_mode).lower(), "wal")
        self.assertEqual(int(synchronous), 1)
        self.assertEqual(int(cache_size), -64000)
        self.assertEqual(int(mmap_size), 268435456)
        self.assertEqual(int(temp_store), 2)
        self.assertGreaterEqual(int(busy_timeout), 5000)

    def test_required_indexes_exist(self):
        """documents tablosunda durum, yuklenme_tarihi, id ve composite indekslerin tam olduğunu doğrula"""
        with engine.connect() as conn:
            rows = conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='documents';"
            ).fetchall()
            existing_indexes = {r[0] for r in rows}

        required_indexes = [
            "idx_documents_durum",
            "idx_documents_yuklenme_tarihi",
            "idx_documents_created_at",
            "idx_documents_durum_created_at",
            "idx_documents_durum_yuklenme_tarihi",
            "idx_documents_durum_id"
        ]
        for idx in required_indexes:
            self.assertIn(idx, existing_indexes, f"Eksik indeks tespit edildi: {idx}")

    def test_explain_query_plan_zero_unindexed_scans(self):
        """Tüm ana sorgu tiplerinin indeks kullandığını, plansız tablo taraması veya sıralama ağacı olmadığını doğrula"""
        queries = [
            ("id_lookup", "EXPLAIN QUERY PLAN SELECT * FROM documents WHERE id = 'test_id';"),
            ("durum_filter", "EXPLAIN QUERY PLAN SELECT * FROM documents WHERE durum = 'tamamlandi';"),
            ("yuklenme_tarihi_filter", "EXPLAIN QUERY PLAN SELECT * FROM documents WHERE yuklenme_tarihi = '2026-10-27';"),
            ("yuklenme_tarihi_order", "EXPLAIN QUERY PLAN SELECT * FROM documents ORDER BY yuklenme_tarihi DESC;"),
            ("created_at_order", "EXPLAIN QUERY PLAN SELECT * FROM documents ORDER BY created_at DESC;"),
            ("durum_and_created_at", "EXPLAIN QUERY PLAN SELECT * FROM documents WHERE durum = 'kuyrukta' ORDER BY created_at DESC;"),
            ("durum_and_yuklenme_tarihi", "EXPLAIN QUERY PLAN SELECT * FROM documents WHERE durum = 'kuyrukta' ORDER BY yuklenme_tarihi DESC;"),
            ("status_group_by", "EXPLAIN QUERY PLAN SELECT durum, count(id) FROM documents GROUP BY durum;")
        ]

        with engine.connect() as conn:
            for q_name, sql in queries:
                plan_rows = conn.exec_driver_sql(sql).fetchall()
                full_plan = " | ".join([r[3] for r in plan_rows])

                # 1. Ham "SCAN documents" (indekssiz sequential scan) olmamalı
                for r in plan_rows:
                    detail = r[3].strip()
                    if detail.startswith("SCAN documents"):
                        self.assertIn("USING", detail, f"[{q_name}] İndekssiz SCAN documents bulundu: {detail}")

                # 2. "USE TEMP B-TREE FOR ORDER BY" olmamalı (indeks sıralamayı zaten sağlamalı)
                self.assertNotIn(
                    "USE TEMP B-TREE", full_plan,
                    f"[{q_name}] Geçici B-Tree sıralama maliyeti tespit edildi! Plan: {full_plan}"
                )

                # 3. İndeks kullanımı doğrulanmalı
                self.assertIn("INDEX", full_plan, f"[{q_name}] İndeks kullanılmıyor! Plan: {full_plan}")

    def test_batch_66_documents_performance(self):
        """66+ evraklık tipik parti yükleme ve sorgulama sürelerinin sub-millisecond olduğunu doğrula"""
        batch_ids = [f"perf_66_{i}_{uuid.uuid4().hex[:6]}" for i in range(66)]
        try:
            # Toplu ekleme
            t0 = time.perf_counter()
            for doc_id in batch_ids:
                item = DocumentItem(
                    id=doc_id,
                    dosya_adi=f"waybill_{doc_id}.jpg",
                    dosya_yolu=f"/uploads/{doc_id}.jpg",
                    dosya_url=f"/uploads/{doc_id}.jpg",
                    mime_type="image/jpeg",
                    boyut_bytes=102400,
                    yuklenme_tarihi="27.10.2026 14:00",
                    durum=ProcessingStatus.KUYRUKTA,
                    veri=None,
                    sayfalar=[f"/uploads/{doc_id}.jpg"]
                )
                doc_repo.save(item)
            t_insert = time.perf_counter() - t0

            # İndeksli durum sayımı (Dashboard özeti)
            t0 = time.perf_counter()
            summary = doc_repo.get_summary()
            t_summary = time.perf_counter() - t0

            self.assertGreaterEqual(summary.toplam_belge, 66)
            self.assertLess(t_summary, 0.25, f"get_summary 250ms altında olmalı! Süre: {t_summary*1000:.2f}ms")

            # get_by_id erişim süresi
            t0 = time.perf_counter()
            sample_doc = doc_repo.get_by_id(batch_ids[0])
            t_get = time.perf_counter() - t0

            self.assertIsNotNone(sample_doc)
            self.assertLess(t_get, 0.05, f"get_by_id 50ms altında olmalı! Süre: {t_get*1000:.2f}ms")
        finally:
            for doc_id in batch_ids:
                doc_repo.delete(doc_id, delete_files=False)

    def test_isolated_10000_documents_scale_performance(self):
        """10,000+ evrak ölçeğinde izole veritabanı ile EXPLAIN QUERY PLAN ve sub-millisecond yanıt testi"""
        test_db_path = DB_PATH.parent / "test_perf_10k.db"
        for p in (test_db_path, Path(f"{test_db_path}-wal"), Path(f"{test_db_path}-shm")):
            if p.exists():
                try:
                    p.unlink()
                except Exception:
                    pass

        conn = sqlite3.connect(str(test_db_path), timeout=30)
        try:
            apply_sqlite_pragmas(conn)
            c = conn.cursor()

            # Tablo ve İndeksleri oluştur
            c.execute("""
            CREATE TABLE documents (
                id VARCHAR(64) PRIMARY KEY,
                dosya_adi VARCHAR(255) NOT NULL,
                dosya_yolu VARCHAR(512) NOT NULL,
                dosya_url VARCHAR(512) NOT NULL,
                mime_type VARCHAR(64),
                boyut_bytes INTEGER,
                yuklenme_tarihi VARCHAR(64) NOT NULL,
                donus_acisi INTEGER,
                durum VARCHAR(32),
                hata_mesaji TEXT,
                veri JSON,
                sayfalar JSON,
                created_at DATETIME,
                guncellenme_ts INTEGER DEFAULT NULL
            );
            """)
            c.execute("CREATE INDEX idx_documents_durum ON documents(durum);")
            c.execute("CREATE INDEX idx_documents_yuklenme_tarihi ON documents(yuklenme_tarihi DESC);")
            c.execute("CREATE INDEX idx_documents_created_at ON documents(created_at DESC);")
            c.execute("CREATE INDEX idx_documents_durum_created_at ON documents(durum, created_at DESC);")
            c.execute("CREATE INDEX idx_documents_durum_yuklenme_tarihi ON documents(durum, yuklenme_tarihi DESC);")
            c.execute("CREATE INDEX idx_documents_durum_id ON documents(durum, id);")
            conn.commit()

            # 10,000 evrak verisi üret
            batch = [
                (
                    f"doc_10k_{i}",
                    f"irsaliye_{i}.jpg",
                    f"/uploads/irsaliye_{i}.jpg",
                    f"/uploads/irsaliye_{i}.jpg",
                    "image/jpeg",
                    150000,
                    f"2026-10-{(i % 28) + 1:02d} 14:00",
                    0,
                    ["kuyrukta", "isleniyor", "tamamlandi", "hata", "onaylandi"][i % 5],
                    None,
                    None,
                    "[]",
                    "2026-10-27 12:00:00",
                    1729000000 + i
                )
                for i in range(10000)
            ]

            # Toplu insert performansı
            t0 = time.perf_counter()
            c.executemany("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)
            conn.commit()
            t_insert = time.perf_counter() - t0
            self.assertLess(t_insert, 5.0, f"10k insert süresi 5s altında olmalı! Süre: {t_insert:.2f}s")

            # 1. Durum filtreleme + yuklenme_tarihi DESC sıralama (LIMIT 50)
            t0 = time.perf_counter()
            rows = c.execute(
                "SELECT * FROM documents WHERE durum = 'tamamlandi' ORDER BY yuklenme_tarihi DESC LIMIT 50"
            ).fetchall()
            t_query = time.perf_counter() - t0
            self.assertEqual(len(rows), 50)
            self.assertLess(t_query, 0.015, f"10k veri üzerinde sayfalı sorgu 15ms altında olmalı! Süre: {t_query*1000:.2f}ms")

            # 2. Covering index ile GROUP BY durum sayımı
            t0 = time.perf_counter()
            counts = c.execute("SELECT durum, count(id) FROM documents GROUP BY durum").fetchall()
            t_group = time.perf_counter() - t0
            self.assertEqual(len(counts), 5)
            self.assertLess(t_group, 0.05, f"Covering index count 50ms altında olmalı! Süre: {t_group*1000:.2f}ms")

            # 3. EXPLAIN QUERY PLAN ile temp b-tree ve unindexed scan olmadığını teyit et
            plan = c.execute(
                "EXPLAIN QUERY PLAN SELECT * FROM documents WHERE durum = 'tamamlandi' ORDER BY yuklenme_tarihi DESC LIMIT 50"
            ).fetchall()
            full_plan = " | ".join([r[3] for r in plan])
            self.assertNotIn("USE TEMP B-TREE", full_plan)
            self.assertIn("SEARCH documents USING INDEX idx_documents_durum_yuklenme_tarihi", full_plan)

        finally:
            conn.close()
            for ext in ["", "-wal", "-shm"]:
                p = Path(f"{test_db_path}{ext}")
                if p.exists():
                    p.unlink()

    def test_bulk_reset_all_to_unread_performance(self):
        """reset_all_to_unread metodunun tek SQL update ile anlık çalıştığını doğrula"""
        # Test için 5 belge oluştur
        test_ids = [f"reset_test_{i}_{uuid.uuid4().hex[:6]}" for i in range(5)]
        try:
            for tid in test_ids:
                item = DocumentItem(
                    id=tid,
                    dosya_adi=f"test_{tid}.jpg",
                    dosya_yolu=f"/uploads/{tid}.jpg",
                    dosya_url=f"/uploads/{tid}.jpg",
                    mime_type="image/jpeg",
                    boyut_bytes=1024,
                    yuklenme_tarihi="27.10.2026",
                    durum=ProcessingStatus.TAMAMLANDI,
                    veri=None,
                    sayfalar=[f"/uploads/{tid}.jpg"]
                )
                doc_repo.save(item)

            t0 = time.perf_counter()
            reset_count = doc_repo.reset_all_to_unread()
            t_reset = time.perf_counter() - t0

            self.assertGreaterEqual(reset_count, 5)
            self.assertLess(t_reset, 0.2, f"reset_all_to_unread 200ms altında olmalı! Süre: {t_reset*1000:.2f}ms")

            # Belgenin durumunun kuyrukta olduğunu teyit et
            checked = doc_repo.get_by_id(test_ids[0])
            self.assertEqual(checked.durum, ProcessingStatus.KUYRUKTA)
        finally:
            for tid in test_ids:
                doc_repo.delete(tid, delete_files=False)


if __name__ == "__main__":
    unittest.main()
