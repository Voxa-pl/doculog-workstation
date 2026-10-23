import os
import unittest
from pathlib import Path
from PIL import Image
import httpx
from backend.app.services.image_processor import image_processor
from backend.app.core.config import settings

BASE_URL = "http://127.0.0.1:8000"

class TestImageRotation(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.http_client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)

    async def asyncTearDown(self):
        await self.http_client.aclose()

    def test_image_processor_rotation_and_normalization(self):
        """ImageProcessor fiziksel döndürme ve EXIF normalizasyonu doğrudan birim testi"""
        test_img_path = settings.UPLOAD_DIR / "test_proc_img.jpg"
        test_thumb_path = settings.UPLOAD_DIR / "thumb_test_proc_img.jpg"

        # 300 genişlik, 600 yükseklik (Dikey) görsel oluştur
        img = Image.new("RGB", (300, 600), color="blue")
        img.save(test_img_path, "JPEG")

        # 1. 90 derece saat yönünde döndür
        image_processor.rotate_image(test_img_path, 90)
        with Image.open(test_img_path) as rotated:
            self.assertEqual(rotated.size, (600, 300), "90° saat yönü döndürme sonrası boyut 600x300 olmalı")

        # 2. Thumbnail üretimi
        image_processor.generate_thumbnail(test_img_path, test_thumb_path)
        self.assertTrue(test_thumb_path.exists())

        # 3. -90 derece saat yönünün tersine döndür
        image_processor.rotate_image(test_img_path, -90)
        with Image.open(test_img_path) as rotated_back:
            self.assertEqual(rotated_back.size, (300, 600), "-90° döndürme sonrası boyut tekrar 300x600 olmalı")

        # Temizlik
        if test_img_path.exists():
            test_img_path.unlink()
        if test_thumb_path.exists():
            test_thumb_path.unlink()

    async def test_api_rotate_document_flow(self):
        """API /documents/{id}/rotate uçtan uca akış ve disk doğrulama testi"""
        # 1. Dikey bir test irsaliyesi yükle (400x800)
        temp_file = Path("/tmp/test_rot_doc.jpg")
        img = Image.new("RGB", (400, 800), color="white")
        img.save(temp_file, "JPEG")

        with open(temp_file, "rb") as f:
            res = await self.http_client.post(
                "/api/upload",
                files={"files": ("test_rot_doc.jpg", f, "image/jpeg")}
            )
        self.assertEqual(res.status_code, 200)
        docs = res.json()
        self.assertTrue(len(docs) > 0)
        doc = docs[0]
        doc_id = doc["id"]
        saved_file_path = Path(doc["dosya_yolu"])

        # Başlangıç boyutunu doğrula (400x800)
        with Image.open(saved_file_path) as initial_img:
            self.assertEqual(initial_img.size, (400, 800))

        # 2. Sağa 90° Döndür
        rotate_res = await self.http_client.post(
            f"/api/documents/{doc_id}/rotate",
            json={"derece": 90, "sayfa_indeksi": 0}
        )
        self.assertEqual(rotate_res.status_code, 200)
        updated_doc = rotate_res.json()

        # Doğrulamalar:
        # a) donus_acisi 0 olmalı (fiziksel döndürüldüğü için CSS açısı sıfırlanır)
        self.assertEqual(updated_doc["donus_acisi"], 0)
        # b) guncellenme_ts atanmış olmalı
        self.assertIsNotNone(updated_doc.get("guncellenme_ts"))
        # c) Diskteki fiziksel görsel 800x400 (Yatay) olmalı
        with Image.open(saved_file_path) as physically_rotated:
            self.assertEqual(physically_rotated.size, (800, 400), "Fiziksel disk görseli 800x400 olarak kaydedilmiş olmalı")

        # d) Küçük resim (thumbnail) güncellenmiş olmalı
        thumb_path = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"
        self.assertTrue(thumb_path.exists())

        # 3. Sola 90° (-90) Döndür
        rotate_res2 = await self.http_client.post(
            f"/api/documents/{doc_id}/rotate",
            json={"derece": -90, "sayfa_indeksi": 0}
        )
        self.assertEqual(rotate_res2.status_code, 200)
        with Image.open(saved_file_path) as back_img:
            self.assertEqual(back_img.size, (400, 800), "Görsel tekrar 400x800 dikey olmalı")

        # Temizlik
        await self.http_client.delete(f"/api/documents/{doc_id}")
        if temp_file.exists():
            temp_file.unlink()

if __name__ == "__main__":
    unittest.main()
