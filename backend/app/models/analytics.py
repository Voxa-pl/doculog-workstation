from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class KPISummary(BaseModel):
    """Lojistik yönetici kokpiti üst düzey KPI göstergeleri"""
    toplam_irsaliye_hacmi: int = Field(default=0, description="Kuyruktaki toplam irsaliye evrak adedi")
    tamamlanan_belge: int = Field(default=0, description="Ayrıştırması başarıyla tamamlanmış evrak sayısı")
    onaylanan_belge: int = Field(default=0, description="Mal kabul operatörü tarafından onaylanan evrak sayısı")
    onay_orani_yuzde: float = Field(default=0.0, description="Onaylanan / (Onaylanan + Tamamlanan + Hata) başarı yüzdesi")
    toplam_islenen_kalem_adedi: int = Field(default=0, description="Tüm evraklardan çıkarılan toplam ürün/hizmet kalem sayısı")
    toplam_islenen_miktar: float = Field(default=0.0, description="Tüm kalemlerin sayısal miktarlarının toplamı")
    ortalama_dijitallesme_hizi_sn: float = Field(default=0.0, description="Evrak başına ortalama yapay zeka işleme süresi (saniye)")


class TimeSeriesPoint(BaseModel):
    """Zaman serisi grafiği için günlük/dönemsel veri noktası"""
    tarih: str = Field(..., description="Tarih etiketi (GG.AA.YYYY)")
    evrak_sayisi: int = Field(default=0, description="O günkü toplam evrak hacmi")
    onaylanan_sayisi: int = Field(default=0, description="O günkü onaylanan evrak sayısı")
    toplam_miktar: float = Field(default=0.0, description="O gün teslim alınan toplam mal miktarı")
    kalem_sayisi: int = Field(default=0, description="O gün işlenen toplam satır kalem sayısı")


class SupplierDistributionItem(BaseModel):
    """Tedarikçi / Cari bazlı sevkiyat dağılım satırı"""
    unvan: str = Field(..., description="Tedarikçi / Gönderici firma ticari ünvanı")
    vkn: Optional[str] = Field(default=None, description="Vergi Kimlik Numarası veya TCKN")
    evrak_sayisi: int = Field(default=0, description="Firmaya ait sevk irsaliyesi adedi")
    toplam_miktar: float = Field(default=0.0, description="Firmanın sevk ettiği toplam mal miktarı")
    kalem_sayisi: int = Field(default=0, description="Firmanın sevk ettiği toplam kalem adedi")
    pay_yuzde: float = Field(default=0.0, description="Toplam mal hacmi içindeki yüzdesel payı")


class TopItemDistribution(BaseModel):
    """En çok hareket gören / gelen ürün kalemleri dağılımı"""
    mal_hizmet: str = Field(..., description="Mal / Malzeme cinsi ve açıklaması")
    toplam_miktar: float = Field(default=0.0, description="Toplam teslim alınan miktar")
    birim: str = Field(default="Adet", description="Ölçü birimi (Adet, Kg, Koli...)")
    frekans: int = Field(default=0, description="Kaç farklı irsaliyede yer aldığı")


class StatusDiscrepancyBreakdown(BaseModel):
    """Operasyonel durumlar ve teslimat uyuşmazlıkları analizi"""
    onaylandi: int = Field(default=0, description="Onaylanan evrak adedi")
    tamamlandi: int = Field(default=0, description="İşlenen ama henüz onaylanmayan evrak adedi")
    kuyrukta: int = Field(default=0, description="Kuyrukta bekleyen evrak adedi")
    isleniyor: int = Field(default=0, description="Halen işlenmekte olan evrak adedi")
    hata: int = Field(default=0, description="Hata alan evrak adedi")
    uyusmazlik_sayisi: int = Field(default=0, description="Tespit edilen şerhli/hasarlı/uyuşmaz evrak sayısı")
    uyusmazlik_orani_yuzde: float = Field(default=0.0, description="Uyuşmazlıkların toplam evrak hacmine oranı (%)")
    ortalama_guven_skoru: float = Field(default=0.0, description="Ortalama yapay zeka okuma güven skoru (0.0 - 1.0)")


class AnalyticsResponse(BaseModel):
    """Lojistik Yönetici Kokpiti ve Analitik Servisi Yanıt Modeli"""
    kpi: KPISummary = Field(default_factory=KPISummary)
    zaman_serisi: List[TimeSeriesPoint] = Field(default_factory=list)
    tedarikci_dagilimi: List[SupplierDistributionItem] = Field(default_factory=list)
    en_cok_gelen_kalemler: List[TopItemDistribution] = Field(default_factory=list)
    durum_dagilimi: StatusDiscrepancyBreakdown = Field(default_factory=StatusDiscrepancyBreakdown)
    empty: bool = Field(default=True, description="Kuyrukta hiç evrak yoksa veya analiz verisi boşsa True")
    son_guncelleme: str = Field(default="", description="İstatistiğin hesaplandığı anın zaman damgası")
