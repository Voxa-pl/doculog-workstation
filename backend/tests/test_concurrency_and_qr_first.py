"""
Unit & Integration Tests for:
1. Global Concurrency Semaphore & Burst Rate Limiting
2. QR-First Pre-Scan & Ground Truth Injection into Gemini Extractor
"""

import pytest
import asyncio
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.gemini_extractor import GeminiExtractor
from backend.app.models.irsaliye import IrsaliyeData, IrsaliyeHeader, LineItem
from backend.app.models.qr import GIBQRCodeData
from backend.app.api.routes import GLOBAL_PROCESSING_SEMAPHORE

client = TestClient(app)


class TestConcurrencyAndBurstProtection:
    def test_global_semaphore_limit(self):
        assert GLOBAL_PROCESSING_SEMAPHORE._value <= 2

    def test_queue_status_endpoint(self):
        res = client.get("/api/system/queue-status")
        assert res.status_code == 200
        data = res.json()
        assert "isleniyor_adet" in data
        assert "kuyrukta_adet" in data
        assert "concurrency_limit" in data
        assert data["concurrency_limit"] == 2
        assert "active_workers" in data

    @pytest.mark.anyio
    async def test_concurrent_semaphore_acquisition(self):
        acquired = []

        async def worker(idx: int):
            async with GLOBAL_PROCESSING_SEMAPHORE:
                acquired.append(idx)
                await asyncio.sleep(0.05)

        # 5 worker başlat
        tasks = [worker(i) for i in range(5)]
        await asyncio.gather(*tasks)
        assert len(acquired) == 5


class TestQrFirstInjection:
    def test_qr_pre_scan_enriches_missing_fields(self):
        extractor = GeminiExtractor(api_key="mock_key")

        # Mock image
        mock_path = Path("/tmp/mock_invoice_qr.jpg")
        mock_path.touch()

        # Mock QR scanner response
        mock_qr_data = GIBQRCodeData(
            raw_text="4600028213|||a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d|HYT2024000049182|2024-05-12|145000.50|TRY",
            format_turu="GIB_PIPE_DELIMITED",
            ettn="a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
            irsaliye_no="HYT2024000049182",
            gonderici_vkn_tckn="4600028213",
            belge_tarihi="2024-05-12"
        )

        mock_ai_json = {
            "header": {
                "irsaliye_no": "",  # Missing in AI OCR
                "gonderici_unvan": "Hayat Kimya Sanayi A.Ş.",
                "alici_unvan": "Borusan Lojistik A.Ş."
            },
            "kalemler": [
                {"sira_no": 1, "mal_hizmet": "Molfix Bebek Bezi", "miktar": 800, "birim": "Koli"}
            ]
        }

        with patch("backend.app.services.qr_scanner.gib_qr_scanner.scan_image", return_value=[mock_qr_data]), \
             patch.object(extractor, "get_client") as mock_client:
            
            mock_genai = MagicMock()
            mock_client.return_value = mock_genai
            mock_response = MagicMock()
            mock_response.text = '{"header": {"irsaliye_no": "", "gonderici_unvan": "Hayat Kimya Sanayi A.Ş."}, "kalemler": []}'
            mock_genai.models.generate_content.return_value = mock_response

            result = extractor.extract_from_image(mock_path)

            # ETTN and İrsaliye No must be auto-enriched from QR code!
            assert result.header.ettn == "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
            assert result.header.irsaliye_no == "HYT2024000049182"
            assert result.header.gonderici_vkn == "4600028213"
            assert result.header.sevk_tarihi == "2024-05-12"

        if mock_path.exists():
            mock_path.unlink()
