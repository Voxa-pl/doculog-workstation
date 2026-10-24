import re
from typing import Dict, Any, List, Optional
from datetime import datetime
from xml.etree import ElementTree as ET
from xml.dom import minidom

from .validation import validate_vkn, validate_tckn
from .uetds import TURKISH_PLATE_REGEX, generate_uetds_payload, generate_uetds_xml
from .erp_exporter import erp_exporter

SAP_UOM_MAP = {
    "ADET": "PCE",
    "AD": "PCE",
    "PIECE": "PCE",
    "KG": "KGM",
    "KILOGRAM": "KGM",
    "TON": "TNE",
    "METRE": "MTR",
    "M": "MTR",
    "LITRE": "LTR",
    "LT": "LTR",
    "KOLI": "CS",
    "KUTU": "BX",
    "PALET": "PF"
}

class ErpLinter:
    @staticmethod
    def _safe_float(val: Any) -> float:
        if val is None:
            return 0.0
        try:
            return float(str(val).replace(".", "").replace(",", "."))
        except (ValueError, TypeError):
            try:
                return float(val)
            except Exception:
                return 0.0

    @classmethod
    def lint_document(cls, header_dict: Dict[str, Any], kalemler_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Bir irsaliyenin kurumsal ERP sistemlerine (Logo Tiger, SAP S/4HANA MIGO, U-ETDS)
        aktarılabilirlik uygunluğunu derinlemesine denetler (Linter).
        """
        logo_result = cls.lint_logo_tiger(header_dict, kalemler_list)
        sap_result = cls.lint_sap_migo(header_dict, kalemler_list)
        uetds_result = cls.lint_uetds(header_dict, kalemler_list)

        # Ağırlıklı genel kurumsal hazır olma skoru (Logo %40, SAP %40, U-ETDS %20)
        overall_score = round(
            (logo_result["score"] * 0.40) +
            (sap_result["score"] * 0.40) +
            (uetds_result["score"] * 0.20),
            1
        )

        all_critical = logo_result["critical_count"] + sap_result["critical_count"] + uetds_result["critical_count"]
        all_warnings = logo_result["warning_count"] + sap_result["warning_count"] + uetds_result["warning_count"]

        status = "PASSED" if all_critical == 0 else "ACTION_REQUIRED"

        return {
            "overall_score": overall_score,
            "status": status,
            "total_critical_errors": all_critical,
            "total_warnings": all_warnings,
            "logo_tiger": logo_result,
            "sap_migo_101": sap_result,
            "uetds": uetds_result,
            "live_previews": {
                "logo_xml_preview": cls._generate_logo_xml_preview(header_dict, kalemler_list)[:800] + "...",
                "sap_bapi_preview": cls._generate_sap_bapi_payload(header_dict, kalemler_list),
                "uetds_xml_preview": generate_uetds_xml(header_dict, kalemler_list)[:800] + "..."
            }
        }

    @classmethod
    def lint_logo_tiger(cls, header: Dict[str, Any], kalemler: List[Dict[str, Any]]) -> Dict[str, Any]:
        issues: List[Dict[str, Any]] = []
        score = 100

        irs_no = str(header.get("irsaliye_no") or "").strip()
        vkn = str(header.get("gonderici_vkn") or header.get("satici_vkn") or "").strip()
        tarih = str(header.get("duzenleme_tarihi") or header.get("tarih") or "").strip()

        # 1. İrsaliye No Kontrolü
        if not irs_no:
            score -= 30
            issues.append({
                "severity": "CRITICAL",
                "field": "header.irsaliye_no",
                "message": "İrsaliye numarası eksik. Logo Tiger XML aktarımı yapılamaz."
            })
        elif len(irs_no) == 16 and re.match(r"^[A-Z]{3}20\d{2}\d{9}$", irs_no):
            issues.append({
                "severity": "INFO",
                "field": "header.irsaliye_no",
                "message": f"Resmi GİB e-İrsaliye formatı doğrulandı ({irs_no})."
            })
        else:
            score -= 5
            issues.append({
                "severity": "WARNING",
                "field": "header.irsaliye_no",
                "message": f"İrsaliye no 16 haneli e-İrsaliye şablonuna uymuyor ({irs_no}). Matbu irsaliye olarak işlenecek."
            })

        # 2. VKN / Cari Kod Kontrolü
        if not vkn:
            score -= 25
            issues.append({
                "severity": "CRITICAL",
                "field": "header.satici_vkn",
                "message": "Satıcı Vergi Kimlik Numarası (VKN) eksik. Cari hesap eşleşemez."
            })
        elif len(vkn) == 10:
            if validate_vkn(vkn):
                issues.append({
                    "severity": "INFO",
                    "field": "header.satici_vkn",
                    "message": f"10 haneli VKN algoritması doğrulandı ({vkn})."
                })
            else:
                score -= 15
                issues.append({
                    "severity": "CRITICAL",
                    "field": "header.satici_vkn",
                    "message": f"VKN ({vkn}) Modulo-10 checksum algoritmasını geçemedi."
                })
        elif len(vkn) == 11:
            if validate_tckn(vkn):
                issues.append({
                    "severity": "INFO",
                    "field": "header.satici_vkn",
                    "message": f"11 haneli şahıs şirketi TCKN doğrulandı ({vkn})."
                })
            else:
                score -= 15
                issues.append({
                    "severity": "CRITICAL",
                    "field": "header.satici_vkn",
                    "message": f"TCKN ({vkn}) algoritma doğrulamasını geçemedi."
                })
        else:
            score -= 20
            issues.append({
                "severity": "CRITICAL",
                "field": "header.satici_vkn",
                "message": f"VKN geçersiz uzunlukta ({len(vkn)} hane, 10 veya 11 olmalı)."
            })

        # 3. Tarih Kontrolü
        if not tarih:
            score -= 10
            issues.append({
                "severity": "WARNING",
                "field": "header.tarih",
                "message": "Evrak tarihi bulunamadı. Bugünün tarihi varsayılacak."
            })

        # 4. Kalemler Kontrolü
        if not kalemler:
            score -= 40
            issues.append({
                "severity": "CRITICAL",
                "field": "kalemler",
                "message": "Faturada hiçbir malzeme/hizmet satırı bulunamadı."
            })
        else:
            for idx, item in enumerate(kalemler, 1):
                name = str(item.get("mal_hizmet") or "").strip()
                miktar = cls._safe_float(item.get("miktar"))
                birim = str(item.get("birim") or "").strip().upper()

                if not name:
                    score -= 5
                    issues.append({
                        "severity": "CRITICAL",
                        "field": f"kalemler[{idx}].mal_hizmet",
                        "message": f"{idx}. satırda malzeme tanımı boş."
                    })
                if miktar <= 0:
                    score -= 10
                    issues.append({
                        "severity": "CRITICAL",
                        "field": f"kalemler[{idx}].miktar",
                        "message": f"{idx}. satırda miktar 0 veya negatif ({miktar}). STFICHE fişi reddedilir."
                    })
                if not birim:
                    score -= 3
                    issues.append({
                        "severity": "WARNING",
                        "field": f"kalemler[{idx}].birim",
                        "message": f"{idx}. satırda ölçü birimi boş. Varsayılan 'ADET' atanacak."
                    })

        final_score = max(0, min(100, score))
        return {
            "score": final_score,
            "status": "READY" if final_score >= 80 and not any(i["severity"] == "CRITICAL" for i in issues) else "NEEDS_REVIEW",
            "critical_count": sum(1 for i in issues if i["severity"] == "CRITICAL"),
            "warning_count": sum(1 for i in issues if i["severity"] == "WARNING"),
            "issues": issues
        }

    @classmethod
    def lint_sap_migo(cls, header: Dict[str, Any], kalemler: List[Dict[str, Any]]) -> Dict[str, Any]:
        issues: List[Dict[str, Any]] = []
        score = 100

        irs_no = str(header.get("irsaliye_no") or "").strip()
        tarih = str(header.get("tarih") or "").strip()
        po_no = str(header.get("siparis_no") or "").strip()

        # SAP Header Kontrolleri
        if not irs_no:
            score -= 25
            issues.append({
                "severity": "CRITICAL",
                "field": "HEADER.REF_DOC_NO",
                "message": "SAP MIGO 101 için REF_DOC_NO (İrsaliye No) zorunludur."
            })
        elif len(irs_no) > 16:
            score -= 10
            issues.append({
                "severity": "WARNING",
                "field": "HEADER.REF_DOC_NO",
                "message": f"REF_DOC_NO 16 karakterden uzun ({len(irs_no)}). SAP alanı kırpabilir."
            })

        if not po_no:
            score -= 10
            issues.append({
                "severity": "WARNING",
                "field": "HEADER.PO_NUMBER",
                "message": "Satın Alma Sipariş No (PO) bulunamadı. MIGO'da manuel PO seçimi gerekecektir."
            })
        else:
            issues.append({
                "severity": "INFO",
                "field": "HEADER.PO_NUMBER",
                "message": f"PO Numarası tespit edildi ({po_no}). Otomatik 3-Way eşleme hazır."
            })

        # SAP Kalem Kontrolleri
        if not kalemler:
            score -= 40
            issues.append({
                "severity": "CRITICAL",
                "field": "ITEM",
                "message": "MIGO Mal Girişi için en az bir malzeme kalemi gereklidir."
            })
        else:
            for idx, item in enumerate(kalemler, 1):
                miktar = cls._safe_float(item.get("miktar"))
                birim = str(item.get("birim") or "").strip().upper()

                if miktar <= 0:
                    score -= 15
                    issues.append({
                        "severity": "CRITICAL",
                        "field": f"ITEM[{idx}].ENTRY_QNT",
                        "message": f"{idx}. kalemde giriş miktarı geçersiz ({miktar}). BAPI_GOODSMVT_CREATE hata verir."
                    })

                sap_uom = SAP_UOM_MAP.get(birim)
                if not sap_uom:
                    score -= 5
                    issues.append({
                        "severity": "WARNING",
                        "field": f"ITEM[{idx}].ENTRY_UOM",
                        "message": f"{idx}. kalem birimi '{birim}' standart SAP ISO tablosunda eşleşmedi (C62/KGM/PCE önerilir)."
                    })

        final_score = max(0, min(100, score))
        return {
            "score": final_score,
            "status": "READY" if final_score >= 80 and not any(i["severity"] == "CRITICAL" for i in issues) else "NEEDS_REVIEW",
            "critical_count": sum(1 for i in issues if i["severity"] == "CRITICAL"),
            "warning_count": sum(1 for i in issues if i["severity"] == "WARNING"),
            "issues": issues
        }

    @classmethod
    def lint_uetds(cls, header: Dict[str, Any], kalemler: List[Dict[str, Any]]) -> Dict[str, Any]:
        issues: List[Dict[str, Any]] = []
        score = 100

        plaka = str(header.get("plaka") or header.get("arac_plaka") or "").strip()
        sofor_tc = str(header.get("sofor_tc") or "").strip()
        sevk_tarihi = str(header.get("sevk_tarihi") or header.get("duzenleme_tarihi") or header.get("tarih") or "").strip()

        # 1. Plaka Kontrolü
        clean_plaka = re.sub(r"[^A-Z0-9]", "", plaka.upper())
        if not clean_plaka:
            score -= 25
            issues.append({
                "severity": "WARNING",
                "field": "uetds.plaka",
                "message": "Araç plaka numarası tespit edilemedi. U-ETDS bildirimi için gereklidir."
            })
        elif not TURKISH_PLATE_REGEX.match(clean_plaka):
            score -= 10
            issues.append({
                "severity": "WARNING",
                "field": "uetds.plaka",
                "message": f"Plaka ({clean_plaka}) Türkiye standart plaka formatına uymuyor."
            })
        else:
            issues.append({
                "severity": "INFO",
                "field": "uetds.plaka",
                "message": f"Geçerli araç plakası formatı ({clean_plaka})."
            })

        # 2. Şoför TC Kontrolü
        if not sofor_tc:
            score -= 20
            issues.append({
                "severity": "WARNING",
                "field": "uetds.sofor_tc",
                "message": "Şoför TC Kimlik Numarası eksik."
            })
        elif not validate_tckn(sofor_tc):
            score -= 15
            issues.append({
                "severity": "CRITICAL",
                "field": "uetds.sofor_tc",
                "message": f"Şoför TC ({sofor_tc}) 11 haneli TCKN algoritma doğrulamasından geçemedi."
            })
        else:
            issues.append({
                "severity": "INFO",
                "field": "uetds.sofor_tc",
                "message": f"Şoför TC Kimlik Numarası doğrulandı ({sofor_tc})."
            })

        # 3. Sevk Tarihi Kontrolü
        if not sevk_tarihi:
            score -= 10
            issues.append({
                "severity": "WARNING",
                "field": "uetds.sevk_tarihi",
                "message": "Sevk tarihi eksik."
            })

        final_score = max(0, min(100, score))
        return {
            "score": final_score,
            "status": "READY" if final_score >= 80 and not any(i["severity"] == "CRITICAL" for i in issues) else "NEEDS_REVIEW",
            "critical_count": sum(1 for i in issues if i["severity"] == "CRITICAL"),
            "warning_count": sum(1 for i in issues if i["severity"] == "WARNING"),
            "issues": issues
        }

    @classmethod
    def _generate_sap_bapi_payload(cls, header: Dict[str, Any], kalemler: List[Dict[str, Any]]) -> Dict[str, Any]:
        """SAP BAPI_GOODSMVT_CREATE formatında canlı JSON yükü simülasyonu"""
        date_str = str(header.get("tarih") or datetime.now().strftime("%Y-%m-%d"))
        
        items_payload = []
        for idx, k in enumerate(kalemler, 1):
            birim = str(k.get("birim") or "ADET").strip().upper()
            items_payload.append({
                "LINE_ID": f"{idx:06d}",
                "MATERIAL": str(k.get("malzeme_kodu") or k.get("mal_hizmet") or "MAT_001")[:18],
                "PLANT": "1000",
                "STGE_LOC": "0001",
                "MOVE_TYPE": "101",
                "ENTRY_QNT": cls._safe_float(k.get("miktar")),
                "ENTRY_UOM": SAP_UOM_MAP.get(birim, "PCE"),
                "PO_NUMBER": str(header.get("siparis_no") or "")[:10],
                "PO_ITEM": f"{idx * 10:05d}"
            })

        return {
            "GOODSMVT_HEADER": {
                "PSTNG_DATE": date_str,
                "DOC_DATE": date_str,
                "REF_DOC_NO": str(header.get("irsaliye_no") or "")[:16],
                "PR_UNAME": "WAYBILL_AI"
            },
            "GOODSMVT_CODE": {"GM_CODE": "01"},
            "GOODSMVT_ITEM": items_payload
        }

    @classmethod
    def _generate_logo_xml_preview(cls, header: Dict[str, Any], kalemler: List[Dict[str, Any]]) -> str:
        root = ET.Element("DISPATCHES")
        dispatch = ET.SubElement(root, "DISPATCH", DBOP="INS")
        ET.SubElement(dispatch, "TYPE").text = "1"
        ET.SubElement(dispatch, "NUMBER").text = str(header.get("irsaliye_no") or "IRS-DEMO")
        ET.SubElement(dispatch, "DATE").text = str(header.get("duzenleme_tarihi") or header.get("tarih") or datetime.now().strftime("%d.%m.%Y"))
        ET.SubElement(dispatch, "ARP_CODE").text = str(header.get("gonderici_vkn") or header.get("satici_vkn") or "CAR_001")
        lines_elem = ET.SubElement(dispatch, "TRANSACTIONS")
        for idx, k in enumerate(kalemler, 1):
            line = ET.SubElement(lines_elem, "TRANSACTION")
            ET.SubElement(line, "ITEM_CODE").text = str(k.get("malzeme_kodu") or f"MLZ_{idx:03d}")
            ET.SubElement(line, "QUANTITY").text = str(k.get("miktar") or 1)
            ET.SubElement(line, "UNIT_CODE").text = str(k.get("birim") or "ADET")
        rough_string = ET.tostring(root, encoding="utf-8")
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent="  ")

erp_linter = ErpLinter()
