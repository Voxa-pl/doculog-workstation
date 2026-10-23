import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.validation import validate_vkn, validate_tckn, reconcile_purchase_order_3way

client = TestClient(app)

class TestValidationAnd3WayMatching:
    def test_vkn_modulo_10_algorithm(self):
        # Valid VKN
        assert validate_vkn("1234567890") is True
        # Invalid length
        assert validate_vkn("123456789") is False
        assert validate_vkn("12345678901") is False
        # Corrupted checksum
        assert validate_vkn("1234567891") is False
        assert validate_vkn("0000000001") is True

    def test_tckn_11_digit_algorithm(self):
        # Valid TCKN
        assert validate_tckn("10000000146") is True
        # Leading zero
        assert validate_tckn("01000000146") is False
        # Invalid checksum
        assert validate_tckn("10000000147") is False
        # Empty/None
        assert validate_tckn("") is False
        assert validate_tckn(None) is False

    def test_3way_matching_logic(self):
        header = {
            "irsaliye_no": "IRS-2026-0099",
            "gonderici_vkn": "1234567890",
            "gonderici_unvan": "Ekol Lojistik A.S."
        }
        kalemler = [
            {"mal_hizmet": "Rulman 6204", "miktar": 100, "birim": "Adet"},
            {"mal_hizmet": "Kaucuk Conta", "miktar": 50, "birim": "Koli"}
        ]
        res = reconcile_purchase_order_3way(header, kalemler)
        assert res["is_matched"] is True
        assert res["vkn_checksum_valid"] is True
        assert res["total_invoice_qty"] == 150.0
        assert res["match_percentage"] == 100.0
        assert res["erp_ready"]["sap_101_movement"] is True
        assert res["erp_ready"]["logo_stfiche_01"] is True

    def test_api_vkn_endpoint(self):
        response = client.get("/api/validation/vkn/1234567890")
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid_vkn"] is True

        response_invalid = client.get("/api/validation/vkn/9999999999")
        assert response_invalid.status_code == 200
        assert response_invalid.json()["is_valid_vkn"] is False
