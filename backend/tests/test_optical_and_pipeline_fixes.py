import pytest
from pathlib import Path
from PIL import Image
import numpy as np

from backend.app.services.image_processor import image_processor
from backend.app.services.qr_scanner import GIBQRScanner
from backend.app.services.gemini_extractor import gemini_extractor
from backend.app.models.irsaliye import IrsaliyeData, IrsaliyeHeader, LineItem
from backend.app.models.qr import GIBQRCodeData


def test_optimize_image_for_gemini(tmp_path: Path):
    """Büyük görsellerin uzun kenarının 2560px'e küçültülmesini test eder."""
    large_img = Image.new("RGB", (4000, 3000), color="white")
    input_file = tmp_path / "large_photo.jpg"
    large_img.save(input_file, "JPEG")

    optimized_path = image_processor.optimize_image_for_gemini(input_file, max_dimension=2560)
    assert optimized_path.exists()

    with Image.open(optimized_path) as opt_img:
        w, h = opt_img.size
        assert max(w, h) <= 2560
        assert w == 2560
        assert h == int(3000 * (2560 / 4000))


def test_deskew_expanded_canvas(tmp_path: Path):
    """Eğik evrak döndürülürken tuvalin genişleyip köşeleri kesmediğini doğrular."""
    test_img = Image.new("RGB", (800, 600), color="white")
    input_file = tmp_path / "tilted.jpg"
    test_img.save(input_file, "JPEG")

    corrected, rectified_path, details = image_processor.detect_and_deskew_perspective(input_file)
    assert rectified_path.exists()
    assert "method" in details


def test_subtotal_filter():
    """Çok sayfalı irsaliyelerde 'Nakli Yekûn' ve 'Ara Toplam' satırlarının filtrelendiğini test eder."""
    kalemler = [
        LineItem(sira_no=1, mal_hizmet="100x120 Euro Palet", miktar=50.0, birim="Adet"),
        LineItem(sira_no=2, mal_hizmet="NAKLİ YEKÛN", miktar=50.0, birim="Adet"),
        LineItem(sira_no=3, mal_hizmet="Önceki Sayfadan Devir", miktar=50.0, birim="Adet"),
        LineItem(sira_no=4, mal_hizmet="Streç Film 23 Mikron", miktar=20.0, birim="Rulo"),
        LineItem(sira_no=5, mal_hizmet="Sayfa Toplamı", miktar=70.0, birim="Adet"),
    ]

    filtered = gemini_extractor._filter_subtotal_rows(kalemler)
    assert len(filtered) == 2
    assert filtered[0].mal_hizmet == "100x120 Euro Palet"
    assert filtered[0].sira_no == 1
    assert filtered[1].mal_hizmet == "Streç Film 23 Mikron"
    assert filtered[1].sira_no == 2


def test_qr_ground_truth_overwrite():
    """Kriptografik GİB karekod verisinin optik OCR halüsinasyonlarını ezdiğini doğrular."""
    # OCR tarafından yanlış okunan veya eksik olan veri
    ocr_header = IrsaliyeHeader(
        irsaliye_no="YANLIS123",
        gonderici_vkn="0000000000",
        alici_vkn="9999999999",
        duzenleme_tarihi="01.01.2020",
    )
    irsaliye_data = IrsaliyeData(
        header=ocr_header,
        kalemler=[LineItem(sira_no=1, mal_hizmet="Ahşap Kasa", miktar=10.0, birim="Adet")],
        genel_toplam_miktar=10.0,
        guven_skoru=0.5,
        okunabilirlik_durumu="orta"
    )

    qr_truth = GIBQRCodeData(
        raw_text="GİB_OFFICIAL_QR",
        barcode_type="QRCODE",
        format_turu="PIPE_DELIMITED",
        ettn="e3b0c442-98fc-1c14-9afb-4c8996fb9242",
        irsaliye_no="GIB2026000014520",
        gonderici_vkn_tckn="1234567890",  # GİB Modulo-10 geçerli resmi test VKN
        alici_vkn_tckn="0000000001",      # GİB Modulo-10 geçerli resmi test VKN
        belge_tarihi="25.10.2026",
    )

    # Simüle edilmiş QR kanca uygulaması
    if qr_truth.ettn:
        irsaliye_data.header.ettn = qr_truth.ettn
    if qr_truth.irsaliye_no:
        irsaliye_data.header.irsaliye_no = qr_truth.irsaliye_no
    if qr_truth.gonderici_vkn_tckn:
        irsaliye_data.header.gonderici_vkn = qr_truth.gonderici_vkn_tckn
    if qr_truth.alici_vkn_tckn:
        irsaliye_data.header.alici_vkn = qr_truth.alici_vkn_tckn
    if qr_truth.belge_tarihi:
        irsaliye_data.header.duzenleme_tarihi = qr_truth.belge_tarihi

    calibrated = gemini_extractor._calibrate_confidence_scores(irsaliye_data, has_qr=True)

    assert calibrated.header.irsaliye_no == "GIB2026000014520"
    assert calibrated.header.gonderici_vkn == "1234567890"
    assert calibrated.header.alici_vkn == "0000000001"
    assert calibrated.header.duzenleme_tarihi == "25.10.2026"
    assert calibrated.guven_skoru >= 0.88
    assert calibrated.okunabilirlik_durumu == "net"
