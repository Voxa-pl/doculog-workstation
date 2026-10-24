import unittest
import io
import qrcode
from PIL import Image
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.irsaliye import DocumentItem, IrsaliyeData, IrsaliyeHeader, LineItem, ProcessingStatus
from backend.app.services.document_repo import doc_repo
from backend.app.services.qr_scanner import (
    gib_qr_scanner,
    GIBQRCodeData,
    QRCrossValidationResult,
    decode_qr_from_image,
    cross_verify_gib_qr
)
from backend.app.core.config import settings


class TestGIBQRScanner(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    def test_parse_gib_pipe_delimited_format(self):
        """509 VUK Standardı Pipe-Delimited QR metninin çözümlenmesi"""
        raw_qr = "0680459201|6120938455|3fa85f64-5717-4562-b3fc-2c963f66afa6|TRS202400045129|14.10.2024|15400.50"
        data = gib_qr_scanner.parse_gib_qr_text(raw_qr)
        
        self.assertEqual(data.format_turu, "GIB_PIPE_DELIMITED")
        self.assertEqual(data.gonderici_vkn_tckn, "0680459201")
        self.assertEqual(data.alici_vkn_tckn, "6120938455")
        self.assertEqual(data.ettn, "3fa85f64-5717-4562-b3fc-2c963f66afa6")
        self.assertEqual(data.irsaliye_no, "TRS202400045129")
        self.assertEqual(data.belge_tarihi, "14.10.2024")
        self.assertEqual(data.odenecek_tutar, 15400.50)

    def test_parse_gib_key_value_format(self):
        """GİB Anahtar-Değer QR formatının çözümlenmesi"""
        raw_qr = "vkntckn:3340058912;ettn:a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d;belgeno:EKL2024000012490;tarih:22.10.2024;tutar:8450.0"
        data = gib_qr_scanner.parse_gib_qr_text(raw_qr)
        
        self.assertEqual(data.format_turu, "GIB_KEY_VALUE")
        self.assertEqual(data.gonderici_vkn_tckn, "3340058912")
        self.assertEqual(data.ettn, "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
        self.assertEqual(data.irsaliye_no, "EKL2024000012490")
        self.assertEqual(data.belge_tarihi, "22.10.2024")
        self.assertEqual(data.odenecek_tutar, 8450.0)

    def test_parse_gib_url_format(self):
        """GİB e-Belge Doğrulama Web URL formatının çözümlenmesi"""
        raw_qr = "https://ebelge.gib.gov.tr/goruntule?ettn=d9412e74-0000-1111-2222-333344445555&vkn=1800049211&belgeno=BRS2024000098410&tarih=21.10.2024"
        data = gib_qr_scanner.parse_gib_qr_text(raw_qr)
        
        self.assertEqual(data.format_turu, "URL")
        self.assertEqual(data.ettn, "d9412e74-0000-1111-2222-333344445555")
        self.assertEqual(data.gonderici_vkn_tckn, "1800049211")
        self.assertEqual(data.irsaliye_no, "BRS2024000098410")
        self.assertEqual(data.belge_tarihi, "21.10.2024")

    def test_scan_synthetic_qr_image_and_cross_validate(self):
        """Sentetik QR kod içeren görsel üretip tarama ve çapraz doğrulama testi"""
        qr_content = "3340058912|8460012948|e1e2e3e4-1111-2222-3333-444455556666|EKL2024000012490|22.10.2024"
        qr_img = qrcode.make(qr_content)
        
        # Test görseli oluştur (A4 boyutunda sevk irsaliyesi simülasyonu)
        canvas = Image.new("RGB", (600, 800), color="white")
        canvas.paste(qr_img.resize((150, 150)), (420, 30))
        
        test_file = settings.UPLOAD_DIR / "test_qr_irsaliye.jpg"
        canvas.save(test_file, "JPEG")

        # Görselden tarama
        scanned_list = gib_qr_scanner.scan_image(test_file)
        self.assertGreaterEqual(len(scanned_list), 1)
        qr_item = scanned_list[0]
        self.assertEqual(qr_item.irsaliye_no, "EKL2024000012490")
        self.assertEqual(qr_item.gonderici_vkn_tckn, "3340058912")

        # 1. Tam Uyumlu Çapraz Doğrulama
        doc_matching = DocumentItem(
            id="test_qr_doc_1",
            dosya_adi="test_qr_irsaliye.jpg",
            dosya_yolu=str(test_file),
            dosya_url="/uploads/test_qr_irsaliye.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1024,
            yuklenme_tarihi="24.10.2026 10:00",
            veri=IrsaliyeData(
                header=IrsaliyeHeader(
                    irsaliye_no="EKL2024000012490",
                    gonderici_vkn="3340058912",
                    alici_vkn="8460012948",
                    duzenleme_tarihi="22.10.2024"
                )
            )
        )
        val_res = gib_qr_scanner.cross_validate(qr_item, doc_matching)
        self.assertTrue(val_res.is_tam_uyumlu)
        self.assertEqual(val_res.uyum_skoru, 1.0)
        self.assertEqual(len(val_res.uyusmayan_alanlar), 0)
        self.assertIn("irsaliye_no", val_res.eslesen_alanlar)
        self.assertIn("gonderici_vkn", val_res.eslesen_alanlar)

        # 2. Uyuşmazlık Durumu (Sahte/Farklı Belge No)
        doc_mismatch = DocumentItem(
            id="test_qr_doc_2",
            dosya_adi="test_qr_irsaliye.jpg",
            dosya_yolu=str(test_file),
            dosya_url="/uploads/test_qr_irsaliye.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1024,
            yuklenme_tarihi="24.10.2026 10:00",
            veri=IrsaliyeData(
                header=IrsaliyeHeader(
                    irsaliye_no="SAHTE9999999",
                    gonderici_vkn="9999999999",
                    duzenleme_tarihi="01.01.2020"
                )
            )
        )
        val_res_mismatch = gib_qr_scanner.cross_validate(qr_item, doc_mismatch)
        self.assertFalse(val_res_mismatch.is_tam_uyumlu)
        self.assertIn("irsaliye_no", val_res_mismatch.uyusmayan_alanlar)
        self.assertIn("gonderici_vkn", val_res_mismatch.uyusmayan_alanlar)
        self.assertIsNotNone(val_res_mismatch.uyari_mesaji)

        # Temizlik
        if test_file.exists():
            test_file.unlink()

    def test_api_endpoint_gib_qr(self):
        """GET /api/documents/{id}/gib-qr API endpoint testi"""
        # Test görseli ve doküman oluştur
        qr_content = "1800049211|BRS2024000098410|21.10.2024"
        qr_img = qrcode.make(qr_content)
        canvas = Image.new("RGB", (400, 400), color="white")
        canvas.paste(qr_img.resize((120, 120)), (250, 20))
        
        doc_id = "test_qr_endpoint_doc"
        file_path = settings.UPLOAD_DIR / f"{doc_id}.jpg"
        canvas.save(file_path, "JPEG")

        doc = DocumentItem(
            id=doc_id,
            dosya_adi=f"{doc_id}.jpg",
            dosya_yolu=str(file_path),
            dosya_url=f"/uploads/{file_path.name}",
            mime_type="image/jpeg",
            boyut_bytes=1024,
            yuklenme_tarihi="24.10.2026 10:00",
            veri=IrsaliyeData(
                header=IrsaliyeHeader(
                    irsaliye_no="BRS2024000098410",
                    gonderici_vkn="1800049211",
                    duzenleme_tarihi="21.10.2024"
                )
            )
        )
        doc_repo.save(doc)

        response = self.client.get(f"/api/documents/{doc_id}/gib-qr")
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        
        self.assertTrue(json_data.get("has_qr"))
        self.assertTrue(json_data.get("is_matched"))
        self.assertIn("irsaliye_no", json_data.get("matched_fields", []))

        # Temizlik
        doc_repo.delete(doc_id, delete_files=True)


if __name__ == "__main__":
    unittest.main()
