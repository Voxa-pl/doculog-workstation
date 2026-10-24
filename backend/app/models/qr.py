from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class GIBQRCodeData(BaseModel):
    """
    509 Sıra No.lu VUK Genel Tebliği e-Belge ve e-İrsaliye standardına uygun
    çözümlenmiş karekod (QR) verisi paketi.
    """
    raw_text: str = Field(default="", description="Karekoddan okunan ham metin / URL")
    barcode_type: str = Field(default="QRCODE", description="Barkod tipi (QRCODE, DATAMATRIX, CODE128 vb.)")
    format_turu: str = Field(default="GIB_STANDART", description="Ayrıştırılan format (GIB_PIPE, GIB_KEY_VALUE, URL, JSON, METIN)")
    
    # GİB e-İrsaliye Çapraz Denetim Alanları
    ettn: Optional[str] = Field(default=None, description="Evrensel Tekil Tanımlama Numarası (UUID formatında ETTN)")
    irsaliye_no: Optional[str] = Field(default=None, description="Resmi e-İrsaliye Seri-Sıra Numarası (Örn: GIB2024000004521)")
    gonderici_vkn_tckn: Optional[str] = Field(default=None, description="Gönderici Vergi Kimlik Numarası veya TCKN (10 veya 11 hane)")
    alici_vkn_tckn: Optional[str] = Field(default=None, description="Alıcı Vergi Kimlik Numarası veya TCKN")
    belge_tarihi: Optional[str] = Field(default=None, description="İrsaliye Belge Tarihi (GG.AA.YYYY veya YYYY-MM-DD)")
    
    # Finansal & Tamamlayıcı Alanlar (Varsa)
    odenecek_tutar: Optional[float] = Field(default=None, description="Ödenecek / Fatura / İrsaliye Tutarı")
    kdv_tutari: Optional[float] = Field(default=None, description="KDV Tutarı")
    para_birimi: Optional[str] = Field(default="TRY", description="Para birimi kodu (TRY, USD, EUR)")
    url: Optional[str] = Field(default=None, description="e-Belge görüntüleme / doğrulama web URL'i")


class QRCrossValidationResult(BaseModel):
    """
    Karekod verisi ile Gemini AI tarafından görselden okunan verilerin
    matematiksel ve semantik çapraz doğrulama sonucu.
    """
    has_qr: bool = Field(..., description="Evrak üzerinde geçerli bir karekod tespit edildi mi?")
    is_tam_uyumlu: bool = Field(default=False, description="Tüm kritik alanlar (İrsaliye No, VKN, Tarih, ETTN) birebir uyuşuyor mu?")
    uyum_skoru: float = Field(default=0.0, description="Çapraz doğrulama uyum skoru (0.0 - 1.0)")
    eslesen_alanlar: List[str] = Field(default_factory=list, description="Karekod ile AI okumasında tam uyuşan alanlar")
    uyusmayan_alanlar: List[str] = Field(default_factory=list, description="Karekod ile AI okuması arasında fark tespit edilen alanlar")
    alan_karsilastirmalari: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Alan bazında karekod değeri ve AI görsel değeri kıyaslama tablosu"
    )
    uyari_mesaji: Optional[str] = Field(default=None, description="Uyuşmazlık veya sahtecilik şüphesi durumunda yönetici uyarı notu")


class GIBQRResponse(BaseModel):
    """
    GET /api/documents/{id}/gib-qr endpoint'i yanıt şeması.
    """
    has_qr: bool = Field(..., description="Evrak üzerinde karekod bulundu mu?")
    qr_count: int = Field(default=0, description="Tespit edilen karekod adedi")
    qr_data: Optional[GIBQRCodeData] = Field(default=None, description="İlk/ana karekoddan çözülen GİB verileri")
    cross_validation: Optional[QRCrossValidationResult] = Field(default=None, description="AI okuması ile yapılan çapraz denetim sonucu")
