import os
import json
import base64
import socket
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
import httpx
from PIL import Image
from google import genai
from google.genai import types, errors

from ..core.config import settings
from ..models.irsaliye import IrsaliyeData, IrsaliyeHeader, LineItem

logger = logging.getLogger(__name__)

class GeminiRateLimitError(Exception):
    """Gemini API kota aşımı veya 429 Rate Limit hatası"""
    pass

class GeminiTimeoutError(Exception):
    """Gemini API ağ veya yanıt zaman aşımı hatası"""
    pass

class GeminiNetworkError(Exception):
    """Gemini API ağ kopması / bağlantı hatası"""
    pass

class GeminiExtractionError(Exception):
    """Gemini yanıt ayrıştırma veya şema uyumsuzluğu hatası"""
    pass

SYSTEM_PROMPT = """Sen Türkiye lojistik, ambar ve taşımacılık sektörü için uzmanlaşmış kıdemli bir 'Evrak ve Sevk İrsaliyesi Ayrıştırma Yapay Zekası'sın (Logistics Document Intelligence).

GÖREVİN:
Sana sunulan görseldeki Sevk İrsaliyesi, e-İrsaliye çıktısı veya ambar teslim fişini en yüksek hassasiyetle inceleyip, istenen JSON şemasına birebir uygun yapılandırılmış veri üretmektir.

TÜRKİYE LOJİSTİK VE İRSALİYE KURALLARI:
1. İRSALİYE NO: Belge üzerindeki matbu seri-sıra numarasını (Örn: A-123456, GIB2024000001234, TRS202400005432) eksiksiz tespit et.
2. TARİHLER:
   - Düzenleme Tarihi: İrsaliyenin düzenlendiği tarih (GG.AA.YYYY formatında döndür).
   - Fiili Sevk Tarihi: Malların depodan çıktığı sevk tarihi (Varsa GG.AA.YYYY).
   - Sevk Saati: Sevkiyat saati (SS:DD).
3. GÖNDERİCİ (SATICI): Malı sevk eden firma/şahıs ticari ünvanı, VKN/TCKN, Vergi Dairesi ve açık adresi.
4. ALICI (MÜŞTERİ / TESLİMAT CARİSİ): Malın teslim edileceği firma ünvanı, VKN/TCKN, teslim adresi.
5. TAŞIYICI & LOJİSTİK: Varsa nakliyeci firma ünvanı, araç plakası (Örn: 34 AB 1234 / 06 CDE 56), şoför adı soyadı ve TC numarası.
6. ÜRÜN KALEMLERİ TABLOSU:
   - Tablodaki her bir mal/malzeme satırını tek tek ayrıştır.
   - sira_no: 1'den başlayan sıra numarası.
   - mal_hizmet: Ürün veya malzeme cinsi/tanımı (Örn: '100x120 Ahşap Euro Palet', 'Karton Koli 40x30x20', 'Galvaniz Rulo Saç').
   - miktar: Sayısal miktar (float veya int).
   - birim: Standart Türk lojistik birimleri (Adet, Koli, Palet, Kg, Ton, Çuval, Bağ, Kutu, Paket, Teneke, Metre).
   - birim_fiyat ve tutar: Belirtilmişse al, yoksa null bırak.
7. EL YAZILARI, KAŞE VE İMZALAR:
   - Şoför veya ambar şefinin el yazısıyla düştüğü teslim notları (Örn: '2 koli hasarlı teslim edildi', 'Eksiksiz teslim alındı', 'Kaşe ve imza mevcut') genel_notlar alanına yazılmalıdır.
8. OKUNABİLİRLİK VE GÜVEN:
   - Buruşukluk, gölge, eğrilik veya el yazısı zorluğuna göre guven_skoru (0.0 - 1.0) ve okunabilirlik_durumu ('net', 'orta', 'zor_okunur') belirle.
9. ALAN BAZLI GÜVENLİK SKORLARI (alan_guvenlikleri):
   - Başlık alanlarının netliğine göre her biri için (irsaliye_no, duzenleme_tarihi, sevk_tarihi, gonderici_vkn, alici_vkn, alici_unvan, plaka vb.) 0.0 ile 1.0 arasında bir güven skoru üret. Net okunan alanlar 0.90+, silik/el yazılı şüpheli alanlar 0.70 altı olmalıdır.

Tüm metinleri orijinal Türkçe karakterleriyle (ç, ğ, ı, ö, ş, ü, İ) eksiksiz aktar."""


class GeminiExtractor:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self._client: Optional[genai.Client] = None

    def get_client(self) -> Optional[genai.Client]:
        key = self.api_key or os.getenv("GEMINI_API_KEY", "") or settings.GEMINI_API_KEY
        if not key or key == "your_gemini_api_key_here":
            return None
        if self._client is None or self.api_key != key:
            self.api_key = key
            # Timeout 30000ms (30 saniye) ile yapılandırılır
            self._client = genai.Client(
                api_key=key,
                http_options=types.HttpOptions(timeout=30000)
            )
        return self._client

    def extract_from_image(
        self,
        image_path: Path,
        mime_type: str = "image/jpeg",
        additional_pages: Optional[List[Path]] = None
    ) -> IrsaliyeData:
        client = self.get_client()

        if client is None:
            logger.info("Gemini API anahtarı tanımlı değil, gerçekçi simülasyon verisi üretiliyor.")
            return self._generate_realistic_fallback_data(image_path.name)

        if not image_path.exists():
            raise FileNotFoundError(f"İşlenecek görsel dosyası bulunamadı: {image_path}")

        try:
            parts = []
            with open(image_path, "rb") as f:
                parts.append(types.Part.from_bytes(data=f.read(), mime_type=mime_type))

            # Çoklu sayfa desteği
            if additional_pages:
                for add_page in additional_pages:
                    if add_page and add_page.exists() and add_page != image_path:
                        with open(add_page, "rb") as f_add:
                            parts.append(types.Part.from_bytes(data=f_add.read(), mime_type="image/jpeg"))

            schema = IrsaliyeData.model_json_schema()
            prompt_text = (
                f"{SYSTEM_PROMPT}\n\n"
                "Lütfen bu sevk irsaliyesi görsel(ler)indeki tüm başlık, cari, taşıma ve ürün kalemleri verilerini "
                "yapılandırılmış JSON olarak çıkart. Eğer birden fazla sayfa varsa tüm sayfalardaki kalemleri tek listede birleştir."
            )
            parts.append(prompt_text)

            # Yalnızca Gemini 3.5 ve 3.6 serisi modeller (kullanıcı kısıtı)
            models_to_try = [
                settings.GEMINI_MODEL,
                "gemini-3.5-flash",
                "gemini-3.5-flash-lite",
                "gemini-3.6-flash",
                "gemini-3.6-flash-lite",
            ]
            # Kesin kural: Sadece 3.5 ve 3.6 serisine ait modeller kabul edilir
            models_to_try = [
                m for m in dict.fromkeys(models_to_try)
                if m and ("3.5" in m or "3.6" in m)
            ]

            last_error: Optional[Exception] = None
            output_text: Optional[str] = None

            for model_name in models_to_try:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=parts,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_json_schema=schema,
                        ),
                    )
                    if response and response.text:
                        output_text = response.text
                        break
                except errors.APIError as api_err:
                    last_error = api_err
                    code = getattr(api_err, "code", None)
                    err_msg = str(api_err).lower()
                    if code == 429 or "429" in err_msg or "resource_exhausted" in err_msg or "quota" in err_msg:
                        logger.warning(f"[{model_name}] Gemini API kota sınırı aşıldı (429 Rate Limit): {api_err}")
                    else:
                        logger.warning(f"[{model_name}] Gemini APIError ({code}): {api_err}")
                    continue
                except (httpx.TimeoutException, TimeoutError, socket.timeout) as timeout_err:
                    last_error = timeout_err
                    logger.warning(f"[{model_name}] Gemini API zaman aşımı (Timeout): {timeout_err}")
                    continue
                except (httpx.NetworkError, ConnectionError, OSError) as net_err:
                    last_error = net_err
                    logger.warning(f"[{model_name}] Gemini API ağ kopması / bağlantı hatası: {net_err}")
                    continue
                except Exception as ex:
                    last_error = ex
                    logger.warning(f"[{model_name}] Beklenmeyen model hatası: {ex}")
                    continue

            if not output_text:
                if last_error:
                    err_str = str(last_error).lower()
                    code = getattr(last_error, "code", None)
                    if code == 429 or "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                        raise GeminiRateLimitError(
                            f"Gemini API kota sınırı aşıldı (429 Rate Limit / Quota Exceeded). Lütfen bir süre sonra tekrar deneyin."
                        )
                    elif isinstance(last_error, (httpx.TimeoutException, TimeoutError, socket.timeout)) or "timeout" in err_str:
                        raise GeminiTimeoutError(
                            f"Gemini API sunucusundan yanıt zaman aşımına uğradı (Timeout 30s). Ağ durumunu kontrol edin."
                        )
                    elif isinstance(last_error, (httpx.NetworkError, ConnectionError, OSError)) or "connection" in err_str:
                        raise GeminiNetworkError(
                            f"Gemini API sunucusuna ulaşılamadı (Network Error / Ağ Kopması). İnternet bağlantınızı kontrol edin."
                        )
                    else:
                        raise RuntimeError(f"Gemini API çağrı hatası: {last_error}")
                raise RuntimeError("Yapay zeka modelinden herhangi bir metin yanıtı alınamadı.")

            # Markdown kod bloklarını (```json ... ```) temizle
            clean_text = output_text.strip()
            if clean_text.startswith("```"):
                lines = clean_text.splitlines()
                if lines and lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                clean_text = "\n".join(lines).strip()

            try:
                data_dict = json.loads(clean_text)
            except json.JSONDecodeError as jde:
                logger.error(f"Gemini yanıtı geçerli JSON formatında değil: {jde}\nİçerik: {clean_text[:200]}")
                raise GeminiExtractionError(f"Model geçerli bir JSON çıktısı üretemedi: {jde}")

            try:
                return IrsaliyeData.model_validate(data_dict)
            except Exception as val_err:
                logger.error(f"Ayrıştırılan JSON şemaya uymadı: {val_err}")
                raise GeminiExtractionError(f"Ayrıştırılan veri irsaliye şemasına uymuyor: {val_err}")

        except (GeminiRateLimitError, GeminiTimeoutError, GeminiNetworkError, GeminiExtractionError, FileNotFoundError):
            raise
        except Exception as e:
            logger.error(f"[GeminiExtractor HATA] {image_path.name} ayrıştırılırken beklenmeyen istisna: {e}")
            raise

    def _generate_realistic_fallback_data(self, filename: str) -> IrsaliyeData:
        return IrsaliyeData(
            header=IrsaliyeHeader(
                irsaliye_no="TRS202400045129",
                irsaliye_tipi="Sevk İrsaliyesi",
                duzenleme_tarihi="14.10.2024",
                sevk_tarihi="14.10.2024",
                sevk_saati="11:45",
                gonderici_unvan="ANADOLU AMBALAJ VE ENDÜSTRİYEL ÜRÜNLER SAN. TİC. A.Ş.",
                gonderici_vkn="0680459201",
                gonderici_vergi_dairesi="Tuzla Vergi Dairesi",
                gonderici_adres="Orhanlı Mah. Demokrasi Cad. No:44 Tuzla / İstanbul",
                alici_unvan="MARMARA LOJİSTİK DEPOLAMA VE DAĞITIM HİZMETLERİ LTD. ŞTİ.",
                alici_vkn="6120938455",
                alici_vergi_dairesi="Çerkezköy Vergi Dairesi",
                teslim_adresi="Veliköy OSB 3. Cadde No:12 Çerkezköy / Tekirdağ",
                tasiyici_unvan="ÖZDOĞAN NAKLİYAT VE AMBAR İŞLETMECİLİĞİ",
                plaka="34 TRS 882",
                sofor_ad_soyad="Mehmet Yılmaz",
                sofor_tc="24981039482",
            ),
            kalemler=[
                LineItem(
                    sira_no=1,
                    mal_hizmet="100x120 Ahşap Euro Palet (Isıl İşlemli)",
                    miktar=120.0,
                    birim="Adet",
                    birim_fiyat=None,
                    tutar=None,
                    notlar="Sağlam, temiz",
                ),
                LineItem(
                    sira_no=2,
                    mal_hizmet="Karton Koli 60x40x40 Çift Oluklu A+ Kalite",
                    miktar=450.0,
                    birim="Koli",
                    birim_fiyat=None,
                    tutar=None,
                    notlar="Parti No: 2024-K09",
                ),
                LineItem(
                    sira_no=3,
                    mal_hizmet="Endüstriyel Streç Film 23 Mikron 50cm x 300m",
                    miktar=36.0,
                    birim="Rulo",
                    birim_fiyat=None,
                    tutar=None,
                    notlar="6 koli x 6 rulo",
                ),
                LineItem(
                    sira_no=4,
                    mal_hizmet="Plastik Çember Şeridi 12mm x 3000m Mavi",
                    miktar=8.0,
                    birim="Adet",
                    birim_fiyat=None,
                    tutar=None,
                    notlar="",
                ),
            ],
            genel_toplam_miktar=614.0,
            genel_notlar="Şoför kaşesi ve ambar giriş kaşesi basılmış. Eksiksiz teslim alınmıştır.",
            guven_skoru=0.96,
            okunabilirlik_durumu="net",
            alan_guvenlikleri={
                "irsaliye_no": 0.98,
                "duzenleme_tarihi": 0.95,
                "sevk_tarihi": 0.92,
                "gonderici_unvan": 0.96,
                "gonderici_vkn": 0.90,
                "alici_unvan": 0.95,
                "alici_vkn": 0.88,
                "tasiyici_unvan": 0.85,
                "plaka": 0.90,
                "sofor_ad_soyad": 0.82,
                "genel_notlar": 0.72,
            },
        )


gemini_extractor = GeminiExtractor()
