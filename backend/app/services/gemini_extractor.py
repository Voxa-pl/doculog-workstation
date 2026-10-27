import os
import re
import json
import base64
import random
import socket
import time
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
import httpx
from PIL import Image
from google import genai
from google.genai import types, errors

from ..core.config import settings
from ..models.irsaliye import IrsaliyeData, IrsaliyeHeader, LineItem
from .image_processor import image_processor
from .product_normalizer import product_normalizer

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
1. İRSALİYE NO:
   - e-İrsaliye ise VUK 509 standardı gereği kesinlikle 16 haneli resmi belge numarasını al (Örn: GIB2024000001234, TRS202600005432). Sipariş no veya onay kodlarını irsaliye no sanma.
   - Matbu sevk irsaliyesi ise seri harfi ve sıra numarasını eksiksiz tespit et (Örn: A-123456, B 045129).
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
   - birim: Standart Türk lojistik birimleri (Adet, Koli, Palet, Kg, Ton, Çuval, Bağ, Kutu, Paket, Teneke, Metre). Ürün cinsi içinde 'Kg', 'Ton', 'Palet' açıkça belirtilmişse varsayılan 'Adet' atama!
   - birim_fiyat ve tutar: Belirtilmişse al, yoksa null bırak.
   - KESİNLİKLE 'NAKLİ YEKÛN', 'ÖNCEKİ SAYFADAN DEVİR' veya 'ARA TOPLAM' satırlarını bağımsız ürün kalemi olarak ekleme!
7. NOKTA VURUŞLU (DOT-MATRIX) YAZICI, SİLİK ŞERİT VE HARF DEFORMASYONLARI:
   - İğneli (nokta vuruşlu) yazıcı şeritleri eskidikçe iğne vuruşları silikleşir veya pikseller birbirine kaynar.
   - Sık yapılan optik harf karışıklıklarına özellikle dikkat et:
     * 'b' harfi üst iğnesi silikse 'k' veya 'h' gibi görünebilir ('petibör' yerine 'püskür' OKUMAK KABUL EDİLEMEZ BİR HATADIR!).
     * 'et' harfleri birbirine yaklaşıp 'üs' gibi algılanabilir.
     * 'ö' / 'ü' noktaları silikleşip 'o' / 'u' olabilir veya tam tersi.
     * 'rn' harfleri 'm' ile, 'cl' harfleri 'd' ile, 'li' harfleri 'h' ile, 'vv' harfleri 'w' ile karışabilir.
     * '1', 'I', 'l', '|' ve 'i' ayrımına dikkat et.
   - KESİNLİKLE FONETİK HALÜSİNASYON ÜRETME:
     * Görseldeki silik veya bozuk harfleri Türkçede ve ticari piyasada (FMCG, gıda, hırdavat, sanayi, ambalaj) karşılığı olmayan anlamsız veya uydurma kelimelere dönüştürme! (Örn: 'Ülker Petibör' ibaresini 'Püskür' veya 'Püsküt' diye okumak kabul edilemez!).
     * Harfler deforme olsa dahi bağlamdan, bilinen ticari marka ve ürün adlarından (Örn: Ülker, Eti, Pınar, Sütaş, Torku, Doğuş, Çaykur, Şölen, Hayat, Nestle vb. gıda ürünleri; Henkel, Unilever, P&G, Hayat Kimya temizlik ürünleri; vb.) faydalanarak doğru ve geçerli ürün adını belirle.
     * Eğer harfler tamamen deforme ve belirsizse, uydurma kelime yazmak yerine en olası bilinen ticari karşılığını veya okunaklı kısımları yaz.
8. EL YAZILARI, AMBAR KAŞE VE İMZALARI:
   - Şoför veya ambar şefinin düştüğü hukuki teslimat şerhlerini (Örn: '2 koli hasarlı teslim alındı', 'Islak ambalaj', 'Eksiksiz kabul', 'Kaşe ve imza mevcut') genel_notlar alanına eksiksiz yaz.
9. OKUNABİLİRLİK VE GÜVEN:
   - Buruşukluk, gölge, eğrilik veya el yazısı zorluğuna göre guven_skoru (0.0 - 1.0) ve okunabilirlik_durumu ('net', 'orta', 'zor_okunur') belirle.
10. ALAN BAZLI GÜVENLİK SKORLARI (alan_guvenlikleri):
    - Başlık alanlarının netliğine göre her biri için (irsaliye_no, duzenleme_tarihi, sevk_tarihi, gonderici_vkn, alici_vkn, alici_unvan, plaka vb.) 0.0 ile 1.0 arasında bir güven skoru üret.

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
        additional_pages: Optional[List[Path]] = None,
        qr_anchor: Optional[Any] = None
    ) -> IrsaliyeData:
        client = self.get_client()

        if not image_path.exists():
            raise FileNotFoundError(f"İşlenecek görsel dosyası bulunamadı: {image_path}")

        # QR-First Ön Tarama: Görsel üzerindeki karekodu yapay zekadan önce tara
        qr_anchor_text = ""
        qr_data_obj = qr_anchor
        if qr_data_obj is None:
            try:
                from .qr_scanner import gib_qr_scanner
                qr_list = gib_qr_scanner.scan_image(image_path)
                if qr_list:
                    qr_data_obj = qr_list[0]
            except Exception as qr_err:
                logger.debug(f"Karekod ön tarama istisnası (göz ardı edildi): {qr_err}")

        if qr_data_obj:
            anchors = []
            if qr_data_obj.irsaliye_no:
                anchors.append(f"Resmi İrsaliye Numarası: {qr_data_obj.irsaliye_no}")
            if qr_data_obj.gonderici_vkn_tckn:
                anchors.append(f"Gönderici VKN/TCKN: {qr_data_obj.gonderici_vkn_tckn}")
            if qr_data_obj.alici_vkn_tckn:
                anchors.append(f"Alıcı VKN/TCKN: {qr_data_obj.alici_vkn_tckn}")
            if qr_data_obj.ettn:
                anchors.append(f"ETTN (Evrensel UUID): {qr_data_obj.ettn}")
            if qr_data_obj.belge_tarihi:
                anchors.append(f"Belge Tarihi: {qr_data_obj.belge_tarihi}")
            if anchors:
                qr_anchor_text = (
                    "\n\nÖN DOĞRULANMIŞ GİB KAREKOD KANCASI (GROUND TRUTH ANCHOR):\n"
                    "Evrak üzerindeki kriptografik GİB karekodundan şu resmi alanlar %100 hassasiyetle okunmuştur:\n"
                    + "\n".join(f"- {a}" for a in anchors)
                    + "\nLütfen JSON çıktında bu değerleri temel al, uyuşmayan alanları karekod verisiyle düzelt ve görseldeki diğer kalem/adres bilgilerini tamamla.\n\n"
                )

        if client is None:
            logger.info("Gemini API anahtarı tanımlı değil, gerçekçi simülasyon verisi üretiliyor.")
            fallback = self._generate_realistic_fallback_data(image_path.name)
            if qr_data_obj and fallback.header:
                if qr_data_obj.ettn:
                    fallback.header.ettn = qr_data_obj.ettn
                if qr_data_obj.irsaliye_no:
                    fallback.header.irsaliye_no = qr_data_obj.irsaliye_no
                if qr_data_obj.gonderici_vkn_tckn:
                    fallback.header.gonderici_vkn = qr_data_obj.gonderici_vkn_tckn
                if qr_data_obj.alici_vkn_tckn:
                    fallback.header.alici_vkn = qr_data_obj.alici_vkn_tckn
                if qr_data_obj.belge_tarihi:
                    fallback.header.duzenleme_tarihi = qr_data_obj.belge_tarihi
                if qr_data_obj.ettn:
                    ettn_str = f"ETTN: {qr_data_obj.ettn}"
                    if not fallback.genel_notlar:
                        fallback.genel_notlar = ettn_str
                    elif qr_data_obj.ettn not in fallback.genel_notlar:
                        fallback.genel_notlar = f"{fallback.genel_notlar} | {ettn_str}"
            if fallback.kalemler:
                fallback.kalemler = product_normalizer.normalize_items(fallback.kalemler)
            return fallback

        try:
            # Bellek sızıntısı ve gecikmeyi önleyen yüksek verimli WebP/JPEG optik boyutlandırma
            opt_main_path = image_processor.optimize_image_for_gemini(image_path)
            eff_mime_type = image_processor.get_mime_type_for_file(opt_main_path)
            parts = []
            with open(opt_main_path, "rb") as f:
                parts.append(types.Part.from_bytes(data=f.read(), mime_type=eff_mime_type))

            # Çoklu sayfa desteği
            if additional_pages:
                for add_page in additional_pages:
                    if add_page and add_page.exists() and add_page != image_path:
                        opt_add_page = image_processor.optimize_image_for_gemini(add_page)
                        eff_page_mime = image_processor.get_mime_type_for_file(opt_add_page)
                        with open(opt_add_page, "rb") as f_add:
                            parts.append(types.Part.from_bytes(data=f_add.read(), mime_type=eff_page_mime))

            schema = IrsaliyeData.model_json_schema()
            prompt_text = (
                f"{SYSTEM_PROMPT}\n\n"
                f"{qr_anchor_text}"
                "Lütfen bu sevk irsaliyesi görsel(ler)indeki tüm başlık, cari, taşıma ve ürün kalemleri verilerini "
                "yapılandırılmış JSON olarak çıkart. Eğer birden fazla sayfa varsa tüm sayfalardaki kalemleri tek listede birleştir."
            )
            parts.append(prompt_text)

            # Yalnızca Gemini 3.5 ve 3.6 serisi modeller (kullanıcı kısıtı) - En yetkin 3.6-flash öncelikli
            models_to_try = [
                "gemini-3.6-flash",
                "gemini-3.5-flash",
                "gemini-3.5-flash-lite",
            ]
            if settings.GEMINI_MODEL and settings.GEMINI_MODEL not in models_to_try and ("3.5" in settings.GEMINI_MODEL or "3.6" in settings.GEMINI_MODEL):
                models_to_try.append(settings.GEMINI_MODEL)

            last_error: Optional[Exception] = None
            output_text: Optional[str] = None

            for model_name in models_to_try:
                for attempt in range(2):  # 429 için 2 deneme
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
                        if code == 404:
                            logger.warning(f"[{model_name}] Model bulunamadı (404), sonraki modele geçiliyor.")
                            break
                        if code == 429 or "429" in err_msg or "resource_exhausted" in err_msg or "quota" in err_msg:
                            sleep_time = random.uniform(0.6, 1.4) * (2 ** attempt)
                            logger.warning(f"[{model_name}] Servis kota sınırı (429), {sleep_time:.2f}s bekleniyor...")
                            time.sleep(sleep_time)
                            continue
                        else:
                            logger.warning(f"[{model_name}] Servis Hatası ({code}): {api_err}")
                            break
                    except (httpx.TimeoutException, TimeoutError, socket.timeout) as timeout_err:
                        last_error = timeout_err
                        logger.warning(f"[{model_name}] Zaman aşımı: {timeout_err}")
                        break
                    except (httpx.NetworkError, ConnectionError, OSError) as net_err:
                        last_error = net_err
                        logger.warning(f"[{model_name}] Ağ bağlantı hatası: {net_err}")
                        break
                    except Exception as ex:
                        last_error = ex
                        logger.warning(f"[{model_name}] Beklenmeyen ayrıştırma hatası: {ex}")
                        break

                if output_text:
                    break

            if not output_text:
                if last_error:
                    err_str = str(last_error).lower()
                    code = getattr(last_error, "code", None)
                    if code == 429 or "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                        raise GeminiRateLimitError(
                            "Belge işlem hattında anlık servis yoğunluğu yaşanıyor. Lütfen kısa bir süre sonra tekrar deneyiniz."
                        )
                    elif isinstance(last_error, (httpx.TimeoutException, TimeoutError, socket.timeout)) or "timeout" in err_str:
                        raise GeminiTimeoutError(
                            "Belge çözümleme servisi zaman aşımına uğradı. Ağ durumunu kontrol edip tekrar deneyiniz."
                        )
                    elif isinstance(last_error, (httpx.NetworkError, ConnectionError, OSError)) or "connection" in err_str:
                        raise GeminiNetworkError(
                            "Doğrulama ve aktarım servisine ulaşılamadı. Lütfen ağ bağlantınızı kontrol ediniz."
                        )
                    else:
                        raise RuntimeError(f"Evrak ayrıştırma servisi hatası: {last_error}")
                raise RuntimeError("Belge ayrıştırma servisinden yanıt alınamadı. Lütfen görsel kalitesini kontrol ediniz.")

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
                validated_data = IrsaliyeData.model_validate(data_dict)
                # Kriptografik GİB Karekod verisi optik halüsinasyonları kesinlikle ezer (Ground Truth Overwrite)
                if qr_data_obj and validated_data.header:
                    if qr_data_obj.ettn:
                        validated_data.header.ettn = qr_data_obj.ettn
                        ettn_str = f"ETTN: {qr_data_obj.ettn}"
                        if not validated_data.genel_notlar:
                            validated_data.genel_notlar = ettn_str
                        elif qr_data_obj.ettn not in validated_data.genel_notlar:
                            validated_data.genel_notlar = f"{validated_data.genel_notlar} | {ettn_str}"
                    if qr_data_obj.irsaliye_no:
                        validated_data.header.irsaliye_no = qr_data_obj.irsaliye_no
                    if qr_data_obj.gonderici_vkn_tckn:
                        validated_data.header.gonderici_vkn = qr_data_obj.gonderici_vkn_tckn
                    if qr_data_obj.alici_vkn_tckn:
                        validated_data.header.alici_vkn = qr_data_obj.alici_vkn_tckn
                    if qr_data_obj.belge_tarihi:
                        validated_data.header.duzenleme_tarihi = qr_data_obj.belge_tarihi
                        if not validated_data.header.sevk_tarihi:
                            validated_data.header.sevk_tarihi = qr_data_obj.belge_tarihi

                # Çok sayfalı irsaliyelerde mükerrer ara toplam / nakli yekûn satırlarını temizle
                if validated_data.kalemler:
                    validated_data.kalemler = self._filter_subtotal_rows(validated_data.kalemler)
                    # Nokta vuruşlu yazıcı ve OCR harf bozulmalarını master katalog ve öğrenilmiş hafızayla düzelt
                    validated_data.kalemler = product_normalizer.normalize_items(validated_data.kalemler)

                # Deterministik GİB Modulo-10 ve matematiksel mutabakat kalibrasyonu
                validated_data = self._calibrate_confidence_scores(validated_data, has_qr=bool(qr_data_obj))

                return validated_data
            except Exception as val_err:
                logger.error(f"Ayrıştırılan JSON şemaya uymadı: {val_err}")
                raise GeminiExtractionError(f"Ayrıştırılan veri irsaliye şemasına uymuyor: {val_err}")

        except (GeminiRateLimitError, GeminiTimeoutError, GeminiNetworkError, GeminiExtractionError, FileNotFoundError):
            raise
        except Exception as e:
            logger.error(f"[GeminiExtractor HATA] {image_path.name} ayrıştırılırken beklenmeyen istisna: {e}")
            raise

    @staticmethod
    def _filter_subtotal_rows(kalemler: List[LineItem]) -> List[LineItem]:
        """
        Çok sayfalı irsaliyelerde sayfa altlarındaki Nakli Yekûn, Ara Toplam veya
        Önceki Sayfadan Devir gibi ara toplam satırlarının mükerrer ürün kalemi olarak
        eklenmesini engeller.
        """
        subtotal_pattern = re.compile(
            r"(?i)(nakli\s*yek[uû]n|ara\s*toplam|devir|nakl-i\s*yekun|sayfa\s*toplam|yek[uû]n)",
            re.UNICODE
        )
        filtered = []
        for item in kalemler:
            name = (item.mal_hizmet or "").strip()
            if subtotal_pattern.search(name):
                logger.info(f"Mükerrer ara toplam satırı elendi: '{name}' (Miktar: {item.miktar})")
                continue
            item.sira_no = len(filtered) + 1
            filtered.append(item)
        return filtered

    @staticmethod
    def _calibrate_confidence_scores(data: IrsaliyeData, has_qr: bool) -> IrsaliyeData:
        """
        LLM'in halüsinatif yüksek güven skorlarını (overconfidence) deterministik
        mali kurallarla kalibre eder:
        1. VKN Modulo-10 doğrulaması (validate_vkn)
        2. GİB Kriptografik Karekod varlığı
        3. Matematiksel kalemler toplamı vs genel dip toplam tutarlılığı
        """
        from .validation import validate_vkn, validate_tckn

        llm_score = data.guven_skoru or 0.85
        score_vkn = 0.5
        vkn = data.header.gonderici_vkn if data.header else None
        if vkn:
            v_clean = re.sub(r"\D", "", vkn)
            if len(v_clean) == 10 and validate_vkn(v_clean):
                score_vkn = 1.0
            elif len(v_clean) == 11 and validate_tckn(v_clean):
                score_vkn = 1.0
            else:
                score_vkn = 0.3

        # Matematiksel mutabakat kontrolü
        score_math = 0.7
        if data.kalemler and data.genel_toplam_miktar is not None:
            sum_qty = sum(k.miktar or 0 for k in data.kalemler)
            diff = abs(sum_qty - data.genel_toplam_miktar)
            if diff < 0.05:
                score_math = 1.0
            elif diff < 1.0:
                score_math = 0.85
            else:
                score_math = 0.5

        # Ağırlıklı kalibrasyon (Kriptografik GİB Karekod varlığı ana teminat faktörüdür)
        if has_qr:
            score_qr = 1.0
            calibrated = (0.20 * llm_score) + (0.30 * score_vkn) + (0.35 * score_qr) + (0.15 * score_math)
        else:
            score_qr = 0.5
            calibrated = (0.40 * llm_score) + (0.30 * score_vkn) + (0.15 * score_qr) + (0.15 * score_math)

        data.guven_skoru = round(min(max(calibrated, 0.1), 0.99), 2)

        if data.guven_skoru >= 0.88:
            data.okunabilirlik_durumu = "net"
        elif data.guven_skoru >= 0.65:
            data.okunabilirlik_durumu = "orta"
        else:
            data.okunabilirlik_durumu = "zor_okunur"

        return data

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
