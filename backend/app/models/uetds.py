from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class UETDSSeferBilgisi(BaseModel):
    """
    Ulaştırma Elektronik Takip ve Denetim Sistemi (U-ETDS)
    Taşıma Seferi Resmi Başlık Bilgileri (4925 S.K. Karayolu Taşıma Kanunu).
    """
    plaka: str = Field(..., description="Çekici / Kamyon Araç Plakası (Örn: 34 ABC 789)")
    dorse_plaka: Optional[str] = Field(default=None, description="Varsa Dorse / Römork Plakası (Örn: 34 DR 551)")
    sofor1_tc: str = Field(..., description="1. Şoför 11 Haneli T.C. Kimlik Numarası")
    sofor1_ad_soyad: str = Field(..., description="1. Şoför Adı Soyadı")
    sofor2_tc: Optional[str] = Field(default=None, description="Varsa 2. Şoför TCKN")
    sofor2_ad_soyad: Optional[str] = Field(default=None, description="Varsa 2. Şoför Adı Soyadı")
    sefer_baslangic_tarihi: str = Field(..., description="Sefer Çıkış Tarihi (GG/AA/YYYY)")
    sefer_baslangic_saati: str = Field(default="08:00", description="Sefer Çıkış Saati (SS:DD)")
    sefer_bitis_tarihi: str = Field(..., description="Tahmini Varış Tarihi (GG/AA/YYYY)")
    sefer_bitis_saati: str = Field(default="18:00", description="Tahmini Varış Saati (SS:DD)")


class UETDSYukBilgisi(BaseModel):
    """
    U-ETDS Yük / Sevkiyat Kalemi Bildirimi.
    """
    irsaliye_no: str = Field(..., description="Resmi Sevk İrsaliyesi Seri-Sıra Numarası")
    irsaliye_tarihi: str = Field(..., description="İrsaliye Düzenleme Tarihi")
    
    # Gönderici & Yükleme Noktası
    gonderen_unvan: str = Field(..., description="Malı Sevk Eden / Gönderen Firma Ünvanı")
    gonderen_vergi_no: str = Field(..., description="Gönderici Vergi Kimlik No (VKN) veya TCKN")
    yukleme_ulke: str = Field(default="TR", description="Yükleme Ülke Kodu")
    yukleme_il: str = Field(..., description="Yükleme Yapılan İl (Örn: İSTANBUL)")
    yukleme_ilce: str = Field(..., description="Yükleme Yapılan İlçe (Örn: TUZLA)")
    
    # Alıcı & Boşaltma Noktası
    alici_unvan: str = Field(..., description="Malı Teslim Alacak / Varış Cari Ünvanı")
    alici_vergi_no: str = Field(..., description="Alıcı Vergi Kimlik No (VKN) veya TCKN")
    bosaltma_ulke: str = Field(default="TR", description="Boşaltma Ülke Kodu")
    bosaltma_il: str = Field(..., description="Boşaltma Yapılacak İl (Örn: BURSA)")
    bosaltma_ilce: str = Field(..., description="Boşaltma Yapılacak İlçe (Örn: NİLÜFER)")
    
    # Yük Detayları
    tasima_turu_kodu: int = Field(default=1, description="1: Yurtiçi Komple Eşya Taşıma, 2: Yurtiçi Parsiyel Eşya Taşıma")
    yuk_cinsi_kodu: str = Field(default="GENEL_KARGO", description="U-ETDS Yük Cinsi Kodu (GENEL_KARGO, GIDA, DEMIR_CELIK vb.)")
    yuk_cinsi_aciklama: str = Field(..., description="Malzeme / Yük Tanımı Açıklaması")
    yuk_miktari: float = Field(..., description="Toplam Yük Miktarı (Net / Brüt)")
    yuk_miktari_birimi: str = Field(default="KG", description="Yük Miktarı Ölçü Birimi (KG, TON, ADET, KOLI, DESI)")


class UETDSSeferBildirimResponse(BaseModel):
    """
    GET /api/documents/{id}/uetds-payload endpoint'i yanıt şeması.
    Ulaştırma ve Altyapı Bakanlığı web servislerine fırlatılabilecek resmi JSON ve SOAP XML paketi.
    """
    document_id: str
    irsaliye_no: str
    uetds_bildirim_hazir: bool = Field(..., description="Bakanlık zorunlu alanlarının tamamı eksiksiz sağlandı mı?")
    eksik_alanlar: List[str] = Field(default_factory=list, description="Bakanlık mevzuatı gereği eksik olan zorunlu alanlar listesi")
    sefer_bilgileri: Optional[UETDSSeferBilgisi] = None
    yuk_bilgileri: List[UETDSYukBilgisi] = Field(default_factory=list)
    json_payload: Optional[Dict[str, Any]] = Field(default=None, description="U-ETDS REST API JSON gövdesi")
    soap_xml_payload: Optional[str] = Field(default=None, description="U-ETDS SOAP Web Servisi 'uetdsEsyaSeferBildir' XML zarfı")
