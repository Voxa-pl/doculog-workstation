import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.erp_linter import erp_linter
from backend.app.services.document_repo import doc_repo
from backend.app.models.irsaliye import DocumentItem, ProcessingStatus, IrsaliyeData, IrsaliyeHeader, LineItem

client = TestClient(app)

class TestErpLinter:
    def test_logo_tiger_lint_valid_document(self):
        """Logo Tiger STFICHE tam geçerli evrak kontrolü"""
        header = {
            "irsaliye_no": "HYT2024000049182",
            "satici_vkn": "1234567890",
            "tarih": "12.05.2024"
        }
        kalemler = [
            {"mal_hizmet": "Rulman 6204-2Z", "miktar": 100, "birim": "ADET", "birim_fiyat": 45.0, "tutar": 4500.0}
        ]

        result = erp_linter.lint_logo_tiger(header, kalemler)
        assert result["score"] >= 90
        assert result["status"] == "READY"
        assert result["critical_count"] == 0

    def test_logo_tiger_lint_missing_vkn_and_negative_qty(self):
        """Logo Tiger kritik hata (VKN yok ve miktar <= 0) tespiti"""
        header = {
            "irsaliye_no": "HYT2024000049182",
            "satici_vkn": "",
            "tarih": "12.05.2024"
        }
        kalemler = [
            {"mal_hizmet": "Kusurlu Kalem", "miktar": 0, "birim": "ADET"}
        ]

        result = erp_linter.lint_logo_tiger(header, kalemler)
        assert result["critical_count"] >= 2
        assert result["status"] == "NEEDS_REVIEW"

    def test_sap_migo_lint_valid_and_missing_po(self):
        """SAP MIGO 101 mal girişi kontrolleri ve PO tespiti"""
        header = {
            "irsaliye_no": "HYT2024000049182",
            "siparis_no": "4500123456",
            "tarih": "2024-05-12"
        }
        kalemler = [
            {"mal_hizmet": "Endüstriyel Yağ 20L", "miktar": 5, "birim": "LITRE"}
        ]

        result = erp_linter.lint_sap_migo(header, kalemler)
        assert result["score"] >= 90
        assert result["critical_count"] == 0

    def test_uetds_lint_plates_and_tc(self):
        """U-ETDS plaka ve TCKN kontrolleri"""
        # Geçerli
        valid_res = erp_linter.lint_uetds(
            {"arac_plaka": "34ABC123", "sofor_tc": "10000000146", "tarih": "12.05.2024"},
            []
        )
        assert any(i["severity"] == "INFO" for i in valid_res["issues"])

        # Geçersiz plaka formatı
        invalid_res = erp_linter.lint_uetds(
            {"arac_plaka": "99INVALID!!!", "sofor_tc": "12345"},
            []
        )
        assert invalid_res["critical_count"] > 0 or invalid_res["warning_count"] > 0

    def test_api_erp_lint_endpoint(self):
        """API üzerinden /api/documents/{doc_id}/erp-lint uçtan uca testi"""
        doc_id = "test_erp_lint_doc_202"
        data = IrsaliyeData(
            header=IrsaliyeHeader(
                irsaliye_no="HYT2024000049182",
                satici_vkn="1234567890",
                tarih="12.05.2024",
                siparis_no="4500099887",
                arac_plaka="34VR9988"
            ),
            kalemler=[
                LineItem(
                    mal_hizmet="Transpalet Tekerleği",
                    miktar=8,
                    birim="ADET",
                    birim_fiyat=350.0,
                    tutar=2800.0
                )
            ]
        )

        doc = DocumentItem(
            id=doc_id,
            dosya_adi="test_erp_lint.jpg",
            dosya_yolu="/tmp/test_erp_lint.jpg",
            dosya_url="/uploads/test_erp_lint.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1024,
            yuklenme_tarihi="24.10.2026 14:00",
            durum=ProcessingStatus.TAMAMLANDI,
            veri=data
        )
        doc_repo.save(doc)

        try:
            resp = client.get(f"/api/documents/{doc_id}/erp-lint")
            assert resp.status_code == 200
            report = resp.json()
            assert "overall_score" in report
            assert "logo_tiger" in report
            assert "sap_migo_101" in report
            assert "uetds" in report
            assert "live_previews" in report
            assert "sap_bapi_preview" in report["live_previews"]
        finally:
            doc_repo.delete(doc_id)
