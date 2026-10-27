from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, Field

class LineItem(BaseModel):
    """İrsaliye içerisindeki tek bir ürün / mal / malzeme kalemi"""
    sira_no: Optional[int] = Field(default=None, description="Kalem sıra numarası (1, 2, 3...)")
    mal_hizmet: str = Field(..., description="Mal/Malzeme Cinsi veya Açıklaması (Örn: 80x120 Euro Ahşap Palet, Plastik Kasa No:4)")
    miktar: Optional[float] = Field(default=None, description="Sayısal miktar (Örn: 24.0, 1500, 3.5)")
    birim: Optional[str] = Field(default="Adet", description="Ölçü birimi (Adet, Koli, Palet, Kg, Ton, Çuval, Bağ, Kutu, Teneke, Rulo, Metre)")
    birim_fiyat: Optional[float] = Field(default=None, description="Varsa birim fiyat")
    tutar: Optional[float] = Field(default=None, description="Varsa satır toplam tutarı")
    notlar: Optional[str] = Field(default=None, description="Satıra ait özel not, ambar işareti veya parti/lot no")

class IrsaliyeHeader(BaseModel):
    """Sevk irsaliyesi başlık, cari ve lojistik sevkiyat bilgileri"""
    irsaliye_no: Optional[str] = Field(default=None, description="İrsaliye seri-sıra no veya e-İrsaliye no (Örn: GIB2024000004521, A-149201)")
    irsaliye_tipi: Optional[str] = Field(default="Sevk İrsaliyesi", description="Belge türü (Sevk İrsaliyesi, e-İrsaliye, Ambar Teslim Fişi)")
    ettn: Optional[str] = Field(default=None, description="Evrensel Tekil Tanımlama Numarası (UUID formatında ETTN)")
    duzenleme_tarihi: Optional[str] = Field(default=None, description="Belge düzenleme tarihi (GG.AA.YYYY formatında, örn: 14.10.2024)")
    sevk_tarihi: Optional[str] = Field(default=None, description="Fiili sevk/yola çıkış tarihi (GG.AA.YYYY)")
    sevk_saati: Optional[str] = Field(default=None, description="Fiili sevk saati (SS:DD formatında)")
    
    # Gönderici (Satıcı / Çıkış Noktası)
    gonderici_unvan: Optional[str] = Field(default=None, description="Gönderici firma / şahıs ticari tam ünvanı")
    gonderici_vkn: Optional[str] = Field(default=None, description="Gönderici Vergi Kimlik No (VKN) veya TCKN (10 veya 11 hane)")
    gonderici_vergi_dairesi: Optional[str] = Field(default=None, description="Gönderici Vergi Dairesi")
    gonderici_adres: Optional[str] = Field(default=None, description="Gönderici çıkış / fabrika adresi")
    
    # Alıcı (Teslim Edilecek Cari)
    alici_unvan: Optional[str] = Field(default=None, description="Alıcı firma / şahıs ticari tam ünvanı")
    alici_vkn: Optional[str] = Field(default=None, description="Alıcı Vergi Kimlik No (VKN) veya TCKN")
    alici_vergi_dairesi: Optional[str] = Field(default=None, description="Alıcı Vergi Dairesi")
    teslim_adresi: Optional[str] = Field(default=None, description="Fiili teslimat adresi / varış deposu lokasyonu")
    
    # Lojistik & Nakliye
    tasiyici_unvan: Optional[str] = Field(default=None, description="Nakliyeci / Ambar / Lojistik firması ünvanı")
    plaka: Optional[str] = Field(default=None, description="Çekici veya kamyon plakası (Örn: 34 ABC 789)")
    sofor_ad_soyad: Optional[str] = Field(default=None, description="Şoför adı soyadı")
    sofor_tc: Optional[str] = Field(default=None, description="Şoför T.C. Kimlik Numarası")

class IrsaliyeData(BaseModel):
    """Gemini Vision tarafından ayrıştırılan yapılandırılmış irsaliye paketi"""
    header: IrsaliyeHeader = Field(default_factory=IrsaliyeHeader)
    kalemler: List[LineItem] = Field(default_factory=list, description="İrsaliyedeki tüm ürün/malzeme kalemleri tablosu")
    genel_toplam_miktar: Optional[float] = Field(default=None, description="Belgedeki genel toplam miktar/kap adedi")
    genel_notlar: Optional[str] = Field(default=None, description="El yazısı ambar notları, kaşe/imza açıklamaları (Örn: '3 koli ezik teslim alındı', 'Şoför imzası mevcut')")
    guven_skoru: float = Field(default=0.95, description="Modelin okuma güven düzeyi (0.0 - 1.0)")
    okunabilirlik_durumu: str = Field(default="net", description="Görsel netlik durumu: net, orta, zor_okunur")
    alan_guvenlikleri: Optional[dict[str, float]] = Field(default_factory=dict, description="Alan bazlı güven skorları (0.0 - 1.0)")

class ProcessingStatus(str, Enum):
    KUYRUKTA = "kuyrukta"
    ISLENIYOR = "isleniyor"
    TAMAMLANDI = "tamamlandi"
    HATA = "hata"
    ONAYLANDI = "onaylandi"

class DocumentItem(BaseModel):
    """İş istasyonu kuyruğundaki tekil evrak nesnesi"""
    id: str
    dosya_adi: str
    dosya_yolu: str
    dosya_url: str
    mime_type: str = "image/jpeg"
    boyut_bytes: int = 0
    yuklenme_tarihi: str = ""
    donus_acisi: int = 0
    durum: ProcessingStatus = ProcessingStatus.KUYRUKTA
    hata_mesaji: Optional[str] = None
    veri: Optional[IrsaliyeData] = None
    sayfalar: List[str] = Field(default_factory=list, description="Çok sayfalı irsaliye görsellerinin URL listesi")
    guncellenme_ts: Optional[int] = Field(default=None, description="Son güncelleme zaman damgası (ms)")

class DocumentUpdateRequest(BaseModel):
    """Operatörün sağ sütunda inline-edit ile yaptığı güncellemeler"""
    header: Optional[IrsaliyeHeader] = None
    kalemler: Optional[List[LineItem]] = None
    genel_toplam_miktar: Optional[float] = None
    genel_notlar: Optional[str] = None
    durum: Optional[ProcessingStatus] = None

class MergeDocumentsRequest(BaseModel):
    """Birden fazla irsaliye sayfasını tek evrak altında birleştirme isteği"""
    target_doc_id: str
    source_doc_ids: List[str]

