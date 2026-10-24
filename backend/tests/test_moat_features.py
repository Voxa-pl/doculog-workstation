"""
Test Suite for Technical Moat Features:
1. GİB e-İrsaliye Karekod (QR) Decoding & Cross Verification
2. U-ETDS Bakanlık Sefer Bildirimi (JSON & SOAP XML)
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.qr_scanner import parse_gib_qr_data, cross_verify_gib_qr
from backend.app.services.uetds import generate_uetds_payload, generate_uetds_xml, map_to_uetds_unit

client = TestClient(app)


class TestGibQrDecoding:
    def test_parse_gib_url_qr(self):
        url = "https://ebelge.gib.gov.tr/gibme?vkn=1234567890&ettn=a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d&belgeNo=HYT2024000049182&tarih=2024-05-12"
        res = parse_gib_qr_data(url)
        assert res["format"] == "GIB_URL"
        assert res["vkn"] == "1234567890"
        assert res["ettn"] == "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
        assert res["belge_no"] == "HYT2024000049182"
        assert res["tarih"] == "2024-05-12"

    def test_parse_gib_pipe_qr(self):
        # Format: VKN|TCKN|AVD|ETTN|BELGENO|BELGETARIHI|ODENECEK...
        raw = "4600028213|||a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d|HYT2024000049182|2024-05-12|145000.50|TRY"
        res = parse_gib_qr_data(raw)
        assert res["format"] == "GIB_PIPE_DELIMITED"
        assert res["vkn"] == "4600028213"
        assert res["ettn"] == "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
        assert res["belge_no"] == "HYT2024000049182"
        assert res["tarih"] == "2024-05-12"

    def test_cross_verify_match(self):
        qr_result = {
            "has_qr": True,
            "parsed": {
                "vkn": "4600028213",
                "belge_no": "HYT2024000049182",
                "ettn": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
            }
        }
        header = {
            "gonderici_vkn": "4600028213",
            "irsaliye_no": "HYT2024000049182",
            "ettn": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
        }
        verification = cross_verify_gib_qr(qr_result, header)
        assert verification["qr_detected"] is True
        assert verification["is_gib_verified"] is True
        assert verification["verification_status"] == "GIB_MUHURLU_VE_DOGRULANDI"
        assert verification["matches"]["vkn_matched"] is True
        assert verification["matches"]["doc_no_matched"] is True

    def test_cross_verify_mismatch(self):
        qr_result = {
            "has_qr": True,
            "parsed": {
                "vkn": "9999999999",
                "belge_no": "ABC2024000000001",
                "ettn": None
            }
        }
        header = {
            "gonderici_vkn": "1234567890",
            "irsaliye_no": "XYZ2024999999999"
        }
        verification = cross_verify_gib_qr(qr_result, header)
        assert verification["qr_detected"] is True
        assert verification["is_gib_verified"] is False
        assert verification["verification_status"] == "KAREKOD_UYUSMAZLIK"


class TestUetdsIntegration:
    def test_unit_mapping(self):
        assert map_to_uetds_unit("Koli") == "KUTU"
        assert map_to_uetds_unit("Paket") == "KUTU"
        assert map_to_uetds_unit("KG") == "KG"
        assert map_to_uetds_unit("Ton") == "TON"
        assert map_to_uetds_unit("Litre") == "LITRE"
        assert map_to_uetds_unit("Metre") == "METRE"
        assert map_to_uetds_unit("Adet") == "ADET"

    def test_generate_uetds_payload_structure(self):
        header = {
            "arac_plaka": "34 DCL 1923",
            "dorse_plaka": "34 DRS 88",
            "sofor_tc": "10000000146",  # valid TCKN
            "gonderici_unvan": "Hayat Kimya Sanayi A.Ş.",
            "gonderici_vkn": "1234567890",
            "alici_unvan": "Borusan Lojistik Dağıtım A.Ş.",
            "alici_vkn": "9876543210",
            "sevk_tarihi": "2026-10-24",
            "sevk_saati": "09:45"
        }
        kalemler = [
            {"mal_hizmet": "Molfix Bebek Bezi", "miktar": "500", "birim": "Koli"},
            {"mal_hizmet": "Papia Tuvalet Kağıdı", "miktar": "350", "birim": "Paket"}
        ]
        payload = generate_uetds_payload(header, kalemler)

        assert "seferBildirim" in payload
        assert payload["seferBildirim"]["sofor1Tc"] == "10000000146"
        assert len(payload["seferBildirim"]["yukListesi"]) > 0
        assert "uetds_bildirim_hazir" in payload

    def test_generate_uetds_xml_structure(self):
        header = {
            "arac_plaka": "34ABC123",
            "sofor_tc": "10000000146",
            "sevk_tarihi": "2026-10-24",
            "sevk_saati": "10:00"
        }
        kalemler = [{"mal_hizmet": "Oto Yedek Parça", "miktar": 120, "birim": "Adet"}]
        xml_res = generate_uetds_xml(header, kalemler)

        assert '<soapenv:Envelope' in xml_res
        assert '<uet:uetdsEsyaSeferBildir>' in xml_res
        assert '<uet:sofor1Tc>10000000146</uet:sofor1Tc>' in xml_res
