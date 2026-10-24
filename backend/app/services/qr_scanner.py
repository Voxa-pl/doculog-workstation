import re
import json
import logging
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any, Union
from urllib.parse import urlparse, parse_qs
from PIL import Image, ImageOps, ImageEnhance
from pyzbar.pyzbar import decode, ZBarSymbol

from ..models.qr import GIBQRCodeData, QRCrossValidationResult, GIBQRResponse
from ..models.irsaliye import DocumentItem

logger = logging.getLogger(__name__)

UUID_REGEX = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
UUID_REGEX_SEARCH = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
VKN_REGEX = re.compile(r"^\d{10,11}$")
DATE_REGEX_1 = re.compile(r"^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$")
DATE_REGEX_2 = re.compile(r"^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})$")


class GIBQRScanner:
    """
    GİB 509 Sıra No.lu VUK e-Belge ve e-İrsaliye Karekod (QR) Ayrıştırma,
    Veri Kurtarma ve Yapay Zeka Çapraz Denetim Motoru.
    """

    @classmethod
    def scan_image(cls, image_input: Union[Path, str, Image.Image, bytes]) -> List[GIBQRCodeData]:
        """
        Görsel dosyasını veya bayt dizisini tarayarak tespit edilen tüm karekodları ayrıştırır.
        Standart okuma başarısız olursa kontrast artırma ve siyah-beyaz adaptif eşikleme uygular.
        """
        img: Optional[Image.Image] = None
        try:
            if isinstance(image_input, (str, Path)):
                p = Path(image_input)
                if not p.exists():
                    logger.warning(f"Karekod taranacak görsel bulunamadı: {p}")
                    return []
                img = Image.open(p)
            elif isinstance(image_input, bytes):
                import io
                img = Image.open(io.BytesIO(image_input))
            elif isinstance(image_input, Image.Image):
                img = image_input
            else:
                return []

            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            # 1. Aşama: Doğrudan Orijinal Görsel Taraması
            decoded_objects = decode(img)
            
            # 2. Aşama: Eğer bulunamadıysa Gri Tonlama ve Kontrast İyileştirmesi
            if not decoded_objects:
                gray = img.convert("L")
                decoded_objects = decode(gray)
                
                # 3. Aşama: Kontrast Artırılmış Tarama (Buruşuk/Silik Karekodlar İçin)
                if not decoded_objects:
                    enhancer = ImageEnhance.Contrast(gray)
                    high_contrast = enhancer.enhance(2.0)
                    decoded_objects = decode(high_contrast)

            results: List[GIBQRCodeData] = []
            for obj in decoded_objects:
                raw_bytes = obj.data
                try:
                    raw_text = raw_bytes.decode("utf-8").strip()
                except UnicodeDecodeError:
                    raw_text = raw_bytes.decode("iso-8859-9", errors="ignore").strip()

                if not raw_text:
                    continue

                b_type = str(obj.type)
                parsed_qr = cls.parse_gib_qr_text(raw_text, barcode_type=b_type)
                results.append(parsed_qr)

            return results

        except Exception as e:
            logger.warning(f"Karekod tarama sırasında istisna: {e}")
            return []

    @classmethod
    def parse_gib_qr_text(cls, raw_text: str, barcode_type: str = "QRCODE") -> GIBQRCodeData:
        """
        Karekod ham metnini GİB standardına göre analiz edip yapılandırılmış formata dönüştürür.
        1. GİB Pipe-Delimited: VKN|ALICI_VKN|ETTN|BELGE_NO|TARIH|TUTAR...
        2. GİB Anahtar-Değer: vkntckn:0680459201;ettn:...;belgeno:...
        3. Web URL: https://ebelge.gib.gov.tr/goruntule?ettn=...
        4. JSON Formatı: {"ettn": "...", "irsaliye_no": "..."}
        """
        text = raw_text.strip()

        # 1. JSON Formatı
        if text.startswith("{") and text.endswith("}"):
            try:
                data = json.loads(text)
                if isinstance(data, dict):
                    return GIBQRCodeData(
                        raw_text=raw_text,
                        barcode_type=barcode_type,
                        format_turu="JSON",
                        ettn=data.get("ettn") or data.get("uuid"),
                        irsaliye_no=data.get("irsaliye_no") or data.get("belge_no") or data.get("fatura_no"),
                        gonderici_vkn_tckn=data.get("vkn") or data.get("gonderici_vkn") or data.get("vkntckn"),
                        alici_vkn_tckn=data.get("alici_vkn"),
                        belge_tarihi=data.get("tarih") or data.get("belge_tarihi"),
                        odenecek_tutar=float(data["tutar"]) if "tutar" in data and str(data["tutar"]).replace('.', '', 1).isdigit() else None,
                        url=data.get("url")
                    )
            except Exception:
                pass

        # 2. Web URL Formatı (GİB e-Belge Doğrulama Portalı)
        if text.startswith("http://") or text.startswith("https://"):
            try:
                parsed_url = urlparse(text)
                raw_qs = parse_qs(parsed_url.query)
                # Case-insensitive query param matching
                qs = {k.lower(): v for k, v in raw_qs.items()}
                
                # Parametreleri çek
                ettn = qs.get("ettn", [None])[0] or qs.get("uuid", [None])[0]
                belge_no = qs.get("belgeno", [None])[0] or qs.get("irsaliyeno", [None])[0] or qs.get("no", [None])[0] or qs.get("docno", [None])[0]
                vkn = qs.get("vkn", [None])[0] or qs.get("vkntckn", [None])[0]
                alici_vkn = qs.get("alici_vkn", [None])[0]
                tarih = qs.get("tarih", [None])[0]
                
                return GIBQRCodeData(
                    raw_text=raw_text,
                    barcode_type=barcode_type,
                    format_turu="URL",
                    ettn=ettn,
                    irsaliye_no=belge_no,
                    gonderici_vkn_tckn=vkn,
                    alici_vkn_tckn=alici_vkn,
                    belge_tarihi=tarih,
                    url=text
                )
            except Exception:
                pass

        # 3. GİB Anahtar-Değer Formatı (vkntckn:12345;ettn:uuid;belgeno:ABC)
        if (":" in text or "=" in text) and (";" in text or "\n" in text or "&" in text):
            delimiter = ";" if ";" in text else ("\n" if "\n" in text else "&")
            pairs = [p.strip() for p in text.split(delimiter) if p.strip()]
            kv_dict: Dict[str, str] = {}
            for pair in pairs:
                if ":" in pair:
                    k, v = pair.split(":", 1)
                    kv_dict[k.strip().lower()] = v.strip()
                elif "=" in pair:
                    k, v = pair.split("=", 1)
                    kv_dict[k.strip().lower()] = v.strip()

            if any(k in kv_dict for k in ("vkntckn", "vkn", "ettn", "belgeno", "irsaliyeno")):
                return GIBQRCodeData(
                    raw_text=raw_text,
                    barcode_type=barcode_type,
                    format_turu="GIB_KEY_VALUE",
                    ettn=kv_dict.get("ettn") or kv_dict.get("uuid"),
                    irsaliye_no=kv_dict.get("belgeno") or kv_dict.get("irsaliyeno") or kv_dict.get("no"),
                    gonderici_vkn_tckn=kv_dict.get("vkntckn") or kv_dict.get("vkn") or kv_dict.get("gondericivkn"),
                    alici_vkn_tckn=kv_dict.get("alicivkn") or kv_dict.get("alicivkntckn"),
                    belge_tarihi=kv_dict.get("tarih") or kv_dict.get("belgetarihi"),
                    odenecek_tutar=float(kv_dict["tutar"].replace(',', '.')) if "tutar" in kv_dict else None
                )

        # 4. GİB Standart Pipe-Delimited Formatı (509 VUK Standardı)
        # Örn: VKN|ALICI_VKN|ETTN|BELGENO|BELGETARIHI|TUTAR...
        # veya: 0680459201|3fa85f64-5717-4562-b3fc-2c963f66afa6|TRS202400045129|14.10.2024
        if "|" in text:
            parts = [p.strip() for p in text.split("|")]
            ettn: Optional[str] = None
            irsaliye_no: Optional[str] = None
            gonderici_vkn: Optional[str] = None
            alici_vkn: Optional[str] = None
            belge_tarihi: Optional[str] = None
            odenecek_tutar: Optional[float] = None

            for part in parts:
                if not part:
                    continue
                # UUID kontrolü
                if UUID_REGEX.match(part):
                    ettn = part
                # VKN/TCKN kontrolü (10 veya 11 hane)
                elif VKN_REGEX.match(part):
                    if not gonderici_vkn:
                        gonderici_vkn = part
                    elif not alici_vkn:
                        alici_vkn = part
                # Tarih kontrolü
                elif DATE_REGEX_1.match(part) or DATE_REGEX_2.match(part):
                    belge_tarihi = part
                # Belge Seri-Sıra No kontrolü (3 harf 13 hane veya benzeri)
                elif re.match(r"^[A-Z0-9_\-]{8,24}$", part) and not part.isdigit():
                    if not irsaliye_no:
                        irsaliye_no = part
                # Tutar kontrolü
                elif re.match(r"^\d+([.,]\d{1,2})?$", part):
                    try:
                        odenecek_tutar = float(part.replace(',', '.'))
                    except ValueError:
                        pass

            return GIBQRCodeData(
                raw_text=raw_text,
                barcode_type=barcode_type,
                format_turu="GIB_PIPE_DELIMITED",
                ettn=ettn,
                irsaliye_no=irsaliye_no,
                gonderici_vkn_tckn=gonderici_vkn,
                alici_vkn_tckn=alici_vkn,
                belge_tarihi=belge_tarihi,
                odenecek_tutar=odenecek_tutar
            )

        # 5. Düz Metin / Diğer
        return GIBQRCodeData(
            raw_text=raw_text,
            barcode_type=barcode_type,
            format_turu="GENEL_METIN",
            irsaliye_no=text if len(text) <= 30 else None
        )

    @classmethod
    def cross_validate(cls, qr_data: Optional[GIBQRCodeData], doc: DocumentItem) -> QRCrossValidationResult:
        """
        Karekod verisi ile Gemini AI tarafından görselden okunan verileri çapraz doğrular.
        - İrsaliye No
        - Gönderici VKN
        - Alıcı VKN
        - Belge Tarihi
        - ETTN (UUID)
        """
        if not qr_data:
            return QRCrossValidationResult(
                has_qr=False,
                is_tam_uyumlu=False,
                uyum_skoru=0.0,
                uyari_mesaji="Evrak üzerinde taranabilir bir karekod (QR) bulunamadı."
            )

        if not doc or not doc.veri or not doc.veri.header:
            return QRCrossValidationResult(
                has_qr=True,
                is_tam_uyumlu=False,
                uyum_skoru=0.5,
                uyari_mesaji="Karekod çözüldü ancak belgede karşılaştırılacak yapay zeka verisi mevcut değil."
            )

        header = doc.veri.header
        comparisons: Dict[str, Dict[str, Any]] = {}
        matched_fields: List[str] = []
        mismatched_fields: List[str] = []

        total_verifiable_fields = 0
        matched_count = 0

        # 1. İrsaliye Numarası Karşılaştırması
        if qr_data.irsaliye_no:
            total_verifiable_fields += 1
            ai_no = cls._clean_code(header.irsaliye_no)
            qr_no = cls._clean_code(qr_data.irsaliye_no)
            is_match = bool(ai_no and qr_no and (ai_no == qr_no or ai_no in qr_no or qr_no in ai_no))
            comparisons["irsaliye_no"] = {
                "qr_degeri": qr_data.irsaliye_no,
                "ai_degeri": header.irsaliye_no,
                "eslesti": is_match
            }
            if is_match:
                matched_fields.append("irsaliye_no")
                matched_count += 1
            else:
                mismatched_fields.append("irsaliye_no")

        # 2. Gönderici VKN Karşılaştırması
        if qr_data.gonderici_vkn_tckn:
            total_verifiable_fields += 1
            ai_vkn = cls._clean_digits(header.gonderici_vkn)
            qr_vkn = cls._clean_digits(qr_data.gonderici_vkn_tckn)
            is_match = bool(ai_vkn and qr_vkn and ai_vkn == qr_vkn)
            comparisons["gonderici_vkn"] = {
                "qr_degeri": qr_data.gonderici_vkn_tckn,
                "ai_degeri": header.gonderici_vkn,
                "eslesti": is_match
            }
            if is_match:
                matched_fields.append("gonderici_vkn")
                matched_count += 1
            else:
                mismatched_fields.append("gonderici_vkn")

        # 3. Alıcı VKN Karşılaştırması
        if qr_data.alici_vkn_tckn and header.alici_vkn:
            total_verifiable_fields += 1
            ai_alici_vkn = cls._clean_digits(header.alici_vkn)
            qr_alici_vkn = cls._clean_digits(qr_data.alici_vkn_tckn)
            is_match = bool(ai_alici_vkn and qr_alici_vkn and ai_alici_vkn == qr_alici_vkn)
            comparisons["alici_vkn"] = {
                "qr_degeri": qr_data.alici_vkn_tckn,
                "ai_degeri": header.alici_vkn,
                "eslesti": is_match
            }
            if is_match:
                matched_fields.append("alici_vkn")
                matched_count += 1
            else:
                mismatched_fields.append("alici_vkn")

        # 4. Belge Düzenleme Tarihi Karşılaştırması
        if qr_data.belge_tarihi and header.duzenleme_tarihi:
            total_verifiable_fields += 1
            qr_date_norm = cls._normalize_date_str(qr_data.belge_tarihi)
            ai_date_norm = cls._normalize_date_str(header.duzenleme_tarihi)
            is_match = bool(qr_date_norm and ai_date_norm and qr_date_norm == ai_date_norm)
            comparisons["duzenleme_tarihi"] = {
                "qr_degeri": qr_data.belge_tarihi,
                "ai_degeri": header.duzenleme_tarihi,
                "eslesti": is_match
            }
            if is_match:
                matched_fields.append("duzenleme_tarihi")
                matched_count += 1
            else:
                mismatched_fields.append("duzenleme_tarihi")

        # 5. ETTN (UUID) Karşılaştırması
        if qr_data.ettn:
            ai_text_corpus = f"{header.irsaliye_no or ''} {doc.veri.genel_notlar or ''}"
            found_uuids = UUID_REGEX_SEARCH.findall(ai_text_corpus)
            if found_uuids:
                total_verifiable_fields += 1
                is_match = any(u.lower() == qr_data.ettn.lower() for u in found_uuids)
                comparisons["ettn"] = {
                    "qr_degeri": qr_data.ettn,
                    "ai_degeri": qr_data.ettn if is_match else found_uuids[0],
                    "eslesti": is_match
                }
                if is_match:
                    matched_fields.append("ettn")
                    matched_count += 1
                else:
                    mismatched_fields.append("ettn")
            else:
                # Belge metninde açıkça UUID bulunamadıysa bu tahrifat/uyuşmazlık değildir;
                # QR kod sistemi ETTN ile zenginleştirmiştir.
                comparisons["ettn"] = {
                    "qr_degeri": qr_data.ettn,
                    "ai_degeri": None,
                    "eslesti": True,
                    "bilgi": "ETTN optik metinde doğrudan tespit edilmedi (QR koddan sağlandı)"
                }

        # Uyum Skoru Hesabı
        score = (matched_count / total_verifiable_fields) if total_verifiable_fields > 0 else 1.0
        score = round(score, 2)

        # Kritik Alan Uyumu (İrsaliye No + Gönderici VKN)
        has_critical_match = ("irsaliye_no" in matched_fields) or ("gonderici_vkn" in matched_fields)
        is_tam = bool(len(mismatched_fields) == 0 and has_critical_match)

        warning: Optional[str] = None
        if mismatched_fields:
            warning = f"DİKKAT: Karekod verisi ile optik görsel verisi arasında {', '.join(mismatched_fields)} alanlarında uyuşmazlık tespit edildi! Evrak tahrifatı veya sahte karekod şüphesi olabilir."
        elif is_tam:
            warning = "GİB Karekod doğrulaması başarılı: Belge no, VKN ve tarihler karekod içeriğiyle %100 örtüşmektedir."

        return QRCrossValidationResult(
            has_qr=True,
            is_tam_uyumlu=is_tam,
            uyum_skoru=score,
            eslesen_alanlar=matched_fields,
            uyusmayan_alanlar=mismatched_fields,
            alan_karsilastirmalari=comparisons,
            uyari_mesaji=warning
        )

    @classmethod
    def scan_document(cls, doc: DocumentItem) -> GIBQRResponse:
        """Belirli bir DocumentItem nesnesi için karekod taraması ve çapraz denetimi yürütür"""
        if not doc or not doc.dosya_yolu:
            return GIBQRResponse(has_qr=False, qr_count=0)

        file_path = Path(doc.dosya_yolu)
        if not file_path.exists():
            return GIBQRResponse(has_qr=False, qr_count=0)

        qr_list = cls.scan_image(file_path)
        if not qr_list:
            return GIBQRResponse(
                has_qr=False,
                qr_count=0,
                cross_validation=QRCrossValidationResult(
                    has_qr=False,
                    is_tam_uyumlu=False,
                    uyum_skoru=0.0,
                    uyari_mesaji="Belge görselinde taranabilir bir GİB karekodu bulunamadı."
                )
            )

        primary_qr = qr_list[0]
        validation = cls.cross_validate(primary_qr, doc)

        return GIBQRResponse(
            has_qr=True,
            qr_count=len(qr_list),
            qr_data=primary_qr,
            cross_validation=validation
        )

    @staticmethod
    def _clean_code(val: Optional[str]) -> str:
        if not val:
            return ""
        return re.sub(r"[^a-zA-Z0-9]", "", str(val)).upper()

    @staticmethod
    def _clean_digits(val: Optional[str]) -> str:
        if not val:
            return ""
        return re.sub(r"\D", "", str(val))

    @staticmethod
    def _normalize_date_str(val: Optional[str]) -> Optional[str]:
        if not val:
            return None
        clean = str(val).strip()
        m1 = DATE_REGEX_1.match(clean)
        if m1:
            return f"{int(m1.group(1)):02d}.{int(m1.group(2)):02d}.{m1.group(3)}"
        m2 = DATE_REGEX_2.match(clean)
        if m2:
            return f"{int(m2.group(3)):02d}.{int(m2.group(2)):02d}.{m2.group(1)}"
        return clean


gib_qr_scanner = GIBQRScanner()


def parse_gib_qr_data(raw_text: str) -> Dict[str, Any]:
    """Helper function for parsing and testing raw QR string"""
    parsed = gib_qr_scanner.parse_gib_qr_text(raw_text)
    fmt = parsed.format_turu
    if fmt == "URL":
        fmt = "GIB_URL"
    return {
        "format": fmt,
        "vkn": parsed.gonderici_vkn_tckn,
        "ettn": parsed.ettn,
        "belge_no": parsed.irsaliye_no,
        "tarih": parsed.belge_tarihi,
        "tutar": parsed.odenecek_tutar
    }


def decode_qr_from_image(image_path: Union[str, Path]) -> Dict[str, Any]:
    """Helper function for routes and legacy endpoints"""
    qr_list = gib_qr_scanner.scan_image(image_path)
    if not qr_list:
        return {
            "has_qr": False,
            "raw_text": None,
            "barcode_type": None,
            "parsed": None
        }
    primary = qr_list[0]
    return {
        "has_qr": True,
        "raw_text": primary.raw_text,
        "barcode_type": primary.barcode_type,
        "format": primary.format_turu,
        "parsed": primary.model_dump()
    }


def cross_verify_gib_qr(qr_res: Dict[str, Any], header: Dict[str, Any]) -> Dict[str, Any]:
    """Helper function for routes to cross verify QR data with header dict"""
    if not qr_res or not qr_res.get("has_qr"):
        return {
            "has_qr": False,
            "is_matched": False,
            "match_score": 0.0,
            "matched_fields": [],
            "mismatched_fields": [],
            "details": {},
            "warning": "Evrak üzerinde taranabilir bir karekod (QR) bulunamadı."
        }
    parsed = dict(qr_res.get("parsed") or {})
    if parsed:
        parsed.setdefault("raw_text", "GIB_QR_DATA")
        parsed.setdefault("barcode_type", "QRCODE")
        if "vkn" in parsed and "gonderici_vkn_tckn" not in parsed:
            parsed["gonderici_vkn_tckn"] = parsed["vkn"]
        if "belge_no" in parsed and "irsaliye_no" not in parsed:
            parsed["irsaliye_no"] = parsed["belge_no"]
    qr_data = GIBQRCodeData(**parsed) if parsed else None

    from ..models.irsaliye import DocumentItem, IrsaliyeData, IrsaliyeHeader
    header_obj = IrsaliyeHeader(**header) if header else IrsaliyeHeader()
    genel_not = f"ETTN: {header.get('ettn')}" if header and header.get("ettn") else None
    mock_doc = DocumentItem(
        id="cross_val_doc",
        dosya_adi="",
        dosya_yolu="",
        dosya_url="",
        mime_type="image/jpeg",
        boyut_bytes=0,
        yuklenme_tarihi="",
        veri=IrsaliyeData(header=header_obj, genel_notlar=genel_not)
    )
    val = gib_qr_scanner.cross_validate(qr_data, mock_doc)
    is_verified = bool(len(val.uyusmayan_alanlar) == 0 and (val.is_tam_uyumlu or val.uyum_skoru >= 0.5))
    return {
        "has_qr": True,
        "is_matched": val.is_tam_uyumlu,
        "match_score": val.uyum_skoru,
        "matched_fields": val.eslesen_alanlar,
        "mismatched_fields": val.uyusmayan_alanlar,
        "details": val.alan_karsilastirmalari,
        "warning": val.uyari_mesaji,
        "parsed_qr": parsed,
        "qr_detected": True,
        "is_gib_verified": is_verified,
        "verification_status": "GIB_MUHURLU_VE_DOGRULANDI" if is_verified else "KAREKOD_UYUSMAZLIK",
        "matches": {
            "vkn_matched": "gonderici_vkn" in val.eslesen_alanlar or "vkn" in val.eslesen_alanlar,
            "doc_no_matched": "irsaliye_no" in val.eslesen_alanlar
        }
    }

