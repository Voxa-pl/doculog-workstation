export type ProcessingStatus = 
  | 'kuyrukta'
  | 'isleniyor'
  | 'tamamlandi'
  | 'hata'
  | 'onaylandi';

export interface LineItem {
  sira_no?: number | null;
  mal_hizmet: string;
  miktar?: number | null;
  birim?: string | null;
  birim_fiyat?: number | null;
  tutar?: number | null;
  notlar?: string | null;
}

export interface IrsaliyeHeader {
  irsaliye_no?: string | null;
  irsaliye_tipi?: string | null;
  duzenleme_tarihi?: string | null;
  sevk_tarihi?: string | null;
  sevk_saati?: string | null;
  gonderici_unvan?: string | null;
  gonderici_vkn?: string | null;
  gonderici_vergi_dairesi?: string | null;
  gonderici_adres?: string | null;
  alici_unvan?: string | null;
  alici_vkn?: string | null;
  alici_vergi_dairesi?: string | null;
  teslim_adresi?: string | null;
  tasiyici_unvan?: string | null;
  plaka?: string | null;
  sofor_ad_soyad?: string | null;
  sofor_tc?: string | null;
}

export interface IrsaliyeData {
  header: IrsaliyeHeader;
  kalemler: LineItem[];
  genel_toplam_miktar?: number | null;
  genel_notlar?: string | null;
  guven_skoru: number;
  okunabilirlik_durumu: string;
  alan_guvenlikleri?: Record<string, number>;
}


export interface DocumentItem {
  id: string;
  dosya_adi: string;
  dosya_yolu: string;
  dosya_url: string;
  mime_type: string;
  boyut_bytes: number;
  yuklenme_tarihi: string;
  donus_acisi: number;
  durum: ProcessingStatus;
  hata_mesaji?: string | null;
  veri?: IrsaliyeData | null;
  sayfalar?: string[];
  guncellenme_ts?: number;
}


export interface BatchSummary {
  toplam_belge: number;
  kuyrukta: number;
  islenen: number;
  tamamlanan: number;
  hatali: number;
  onaylanan: number;
}

export interface QueueResponse {
  documents: DocumentItem[];
  summary: BatchSummary;
}

export interface ApiKeyStatus {
  is_configured: boolean;
  masked_key: string;
  model: string;
}

export interface QrBridgeInfo {
  session_id: string;
  lan_ip: string;
  port: number;
  mobile_url: string;
  qr_data_url: string;
}

export type AppTheme = 'koyu-kurumsal' | 'gece-vardiyasi' | 'acik-ofis';
export type AppView = 'station' | 'dashboard';
export type MobileTab = 'queue' | 'viewer' | 'editor';
export type WorkspaceLayoutMode = 'three-column' | 'collapsible-dock' | 'focus-studio';

export interface KpiMetrics {
  toplam_irsaliye_hacmi: number;
  tamamlanan_belge?: number;
  onaylanan_belge?: number;
  onay_orani_yuzde: number;
  toplam_islenen_kalem_adedi?: number;
  toplam_islenen_kalem_miktari?: number;
  toplam_islenen_miktar?: number;
  ortalama_dijitallesme_hizi_sn?: number;
  ortalama_dijitallestirme_hizi_sn?: number;
}

export interface TimeSeriesPoint {
  tarih: string;
  evrak_sayisi?: number;
  toplam_evrak?: number;
  onaylanan_sayisi?: number;
  onaylanan_evrak?: number;
  toplam_miktar: number;
  kalem_sayisi?: number;
}

export interface SupplierStat {
  unvan: string;
  vkn?: string;
  evrak_sayisi?: number;
  irsaliye_sayisi?: number;
  toplam_miktar: number;
  kalem_sayisi?: number;
  pay_yuzde?: number;
  yuzde?: number;
}

export interface ItemFrequencyStat {
  mal_hizmet: string;
  toplam_miktar: number;
  birim?: string | null;
  frekans: number;
}

export interface StatusBreakdown {
  onaylandi: number;
  tamamlandi: number;
  kuyrukta: number;
  isleniyor: number;
  hata: number;
  uyusmazlik_sayisi: number;
  uyusmazlik_orani_yuzde?: number;
  ortalama_guven_skoru?: number;
}

export interface DashboardMetrics {
  kpi: KpiMetrics;
  zaman_serisi: TimeSeriesPoint[];
  tedarikci_dagilimi: SupplierStat[];
  en_cok_gelen_kalemler: ItemFrequencyStat[];
  durum_dagilimi: StatusBreakdown;
  empty?: boolean;
  son_guncelleme: string;
}
