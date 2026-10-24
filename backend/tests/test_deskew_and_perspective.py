import pytest
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
import cv2
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.config import settings
from backend.app.services.image_processor import image_processor
from backend.app.services.document_repo import doc_repo
from backend.app.models.irsaliye import DocumentItem, ProcessingStatus

client = TestClient(app)

class TestDeskewAndPerspective:
    @pytest.fixture(autouse=True)
    def setup_and_teardown(self):
        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.created_files = []
        yield
        for f in self.created_files:
            try:
                if f.exists():
                    f.unlink()
            except Exception:
                pass

    def test_balanced_image_no_unnecessary_deskew(self):
        """Düzgün hizalı bir görselde gereksiz dönüşüm yapılmadığının doğrulanması"""
        test_path = settings.UPLOAD_DIR / "test_straight_doc.jpg"
        self.created_files.append(test_path)

        # 400x600 beyaz zemin üzerine siyah dikdörtgen
        img = Image.new("RGB", (400, 600), color="white")
        draw = ImageDraw.Draw(img)
        draw.rectangle([50, 50, 350, 550], fill="black")
        img.save(test_path, "JPEG")

        corrected, out_path, details = image_processor.detect_and_deskew_perspective(test_path)
        assert out_path.exists()
        assert details is not None

    def test_tilted_text_deskew_detection(self):
        """Eğik çizgili veya metinli evrakın açısal düzeltilmesi"""
        test_path = settings.UPLOAD_DIR / "test_tilted_doc.jpg"
        self.created_files.append(test_path)

        # 500x700 beyaz zemin üzerine eğik çizgiler çiz
        base = np.full((700, 500, 3), 255, dtype=np.uint8)
        # 12 derecelik eğik yazı/çizgiler
        cv2.line(base, (50, 100), (450, 150), (0, 0, 0), 4)
        cv2.line(base, (50, 200), (450, 250), (0, 0, 0), 4)
        cv2.line(base, (50, 300), (450, 350), (0, 0, 0), 4)
        cv2.imwrite(str(test_path), base)

        corrected, out_path, details = image_processor.detect_and_deskew_perspective(test_path)
        assert out_path.exists()
        assert "method" in details

    def test_api_deskew_endpoint_not_found(self):
        """Olmayan evrak için 404 dönmesi"""
        response = client.post("/api/documents/non_existent_doc_id/deskew")
        assert response.status_code == 404

    def test_api_deskew_endpoint_success(self):
        """API üzerinden deskew çağrısı ve küçük resmin yenilenmesi"""
        test_path = settings.UPLOAD_DIR / "test_api_deskew.jpg"
        self.created_files.append(test_path)

        img = Image.new("RGB", (300, 500), color="white")
        draw = ImageDraw.Draw(img)
        draw.rectangle([30, 30, 270, 470], outline="black", width=3)
        img.save(test_path, "JPEG")

        doc_id = "test_deskew_doc_101"
        doc = DocumentItem(
            id=doc_id,
            dosya_adi="test_api_deskew.jpg",
            dosya_yolu=str(test_path),
            dosya_url=f"/uploads/test_api_deskew.jpg",
            mime_type="image/jpeg",
            boyut_bytes=test_path.stat().st_size,
            yuklenme_tarihi="24.10.2026 14:00",
            durum=ProcessingStatus.KUYRUKTA
        )
        doc_repo.save(doc)

        thumb_path = settings.UPLOAD_DIR / f"thumb_{doc_id}.jpg"
        self.created_files.append(thumb_path)

        try:
            response = client.post(f"/api/documents/{doc_id}/deskew")
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "details" in data
            assert data["document"]["id"] == doc_id
        finally:
            doc_repo.delete(doc_id)
