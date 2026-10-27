import json
from typing import List, Dict, Any
from xml.etree import ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from pathlib import Path

from ..models.irsaliye import DocumentItem, ProcessingStatus
from ..core.config import settings

class ErpExporter:
    """Logo Tiger / Go, Mikro, Netsis ve standart ERP sistemleri için veri aktarım servisi"""

    def export_single_logo_xml(self, doc: DocumentItem) -> Path:
        """Tekil irsaliye için standart Logo Tiger/Go XML dosyası üretir"""
        root = ET.Element("DISPATCHES")
        self._append_doc_to_logo_xml(root, doc)

        xml_str = self._prettify_xml(root)
        clean_id = doc.id[:8]
        file_path = settings.EXPORT_DIR / f"Logo_Irsaliye_{clean_id}.xml"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(xml_str)
        return file_path

    def export_batch_logo_xml(self, docs: List[DocumentItem]) -> Path:
        """Onaylanan veya tamamlanan tüm evraklar için toplu Logo XML dosyası üretir"""
        root = ET.Element("DISPATCHES")
        for doc in docs:
            if doc.durum in (ProcessingStatus.TAMAMLANDI, ProcessingStatus.ONAYLANDI) and doc.veri:
                self._append_doc_to_logo_xml(root, doc)

        xml_str = self._prettify_xml(root)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = settings.EXPORT_DIR / f"Logo_Toplu_Irsaliyeler_{timestamp}.xml"
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(xml_str)
        return file_path

    def export_single_erp_json(self, doc: DocumentItem) -> Path:
        """Tekil irsaliye için standart normalize B2B JSON dosyası üretir"""
        payload = self._doc_to_erp_dict(doc)
        clean_id = doc.id[:8]
        file_path = settings.EXPORT_DIR / f"Waybill_Irsaliye_{clean_id}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        return file_path

    def export_batch_erp_json(self, docs: List[DocumentItem]) -> Path:
        """Tüm evraklar için toplu normalize B2B JSON paketi üretir"""
        items = []
        for doc in docs:
            if doc.durum in (ProcessingStatus.TAMAMLANDI, ProcessingStatus.ONAYLANDI) and doc.veri:
                items.append(self._doc_to_erp_dict(doc))

        batch_payload = {
            "sistem": "Waybill Workstation",
            "olusturma_tarihi": datetime.now().isoformat(),
            "toplam_evrak": len(items),
            "irsaliyeler": items
        }
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = settings.EXPORT_DIR / f"Waybill_Toplu_Irsaliyeler_{timestamp}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(batch_payload, f, ensure_ascii=False, indent=2)
        return file_path

    def _append_doc_to_logo_xml(self, root: ET.Element, doc: DocumentItem):
        data = doc.veri
        if not data:
            return

        h = data.header
        dispatch = ET.SubElement(root, "DISPATCH", DBOP="INS")
        
        # Temel Belge & e-İrsaliye Başlık Bilgileri
        ET.SubElement(dispatch, "TYPE").text = "1"  # 1: Toptan Satış / Sevk İrsaliyesi
        ET.SubElement(dispatch, "PROFILE_ID").text = "TEMELIRSALIYE"
        ET.SubElement(dispatch, "NUMBER").text = h.irsaliye_no or f"IRS-{doc.id[:6]}"
        ET.SubElement(dispatch, "DOC_NUMBER").text = h.irsaliye_no or ""
        ET.SubElement(dispatch, "DATE").text = h.duzenleme_tarihi or datetime.now().strftime("%d.%m.%Y")
        ET.SubElement(dispatch, "DOC_DATE").text = h.duzenleme_tarihi or datetime.now().strftime("%d.%m.%Y")
        ET.SubElement(dispatch, "TIME").text = f"{h.sevk_saati or '12:00'}:00" if len(h.sevk_saati or '') == 5 else (h.sevk_saati or "12:00:00")
        ET.SubElement(dispatch, "SHIP_DATE").text = h.sevk_tarihi or h.duzenleme_tarihi or datetime.now().strftime("%d.%m.%Y")
        ET.SubElement(dispatch, "SHIP_TIME").text = f"{h.sevk_saati or '12:00'}:00" if len(h.sevk_saati or '') == 5 else (h.sevk_saati or "12:00:00")
        ET.SubElement(dispatch, "SOURCE_WH").text = "1"
        ET.SubElement(dispatch, "SOURCE_COST_GRP").text = "1"
        ET.SubElement(dispatch, "EINVOICE").text = "1"
        ET.SubElement(dispatch, "PRINT_COUNTER").text = "1"
        
        # Alıcı (Müşteri / Cari) Bilgileri
        ET.SubElement(dispatch, "ARP_CODE").text = h.alici_vkn or f"CAR-{doc.id[:6]}"
        ET.SubElement(dispatch, "CLIENTREF").text = h.alici_unvan or ""
        ET.SubElement(dispatch, "TAX_NR").text = h.alici_vkn or ""
        ET.SubElement(dispatch, "TAX_OFFICE").text = h.alici_vergi_dairesi or ""
        ET.SubElement(dispatch, "SHIP_LOC_CODE").text = h.teslim_adresi or ""
        ET.SubElement(dispatch, "ADDRESS1").text = h.teslim_adresi or ""

        # Gönderici Firma Bilgileri
        ET.SubElement(dispatch, "SELLER_CODE").text = h.gonderici_vkn or ""
        ET.SubElement(dispatch, "SELLER_NAME").text = h.gonderici_unvan or ""
        ET.SubElement(dispatch, "SELLER_TAX_OFFICE").text = h.gonderici_vergi_dairesi or ""
        ET.SubElement(dispatch, "SELLER_ADDRESS").text = h.gonderici_adres or ""

        # Nakliye, Araç ve Şoför Bilgileri
        ET.SubElement(dispatch, "CARRIER_TITLE").text = h.tasiyici_unvan or ""
        ET.SubElement(dispatch, "PLATE_NUM").text = h.plaka or ""
        ET.SubElement(dispatch, "DRIVER_NAME").text = h.sofor_ad_soyad or ""
        ET.SubElement(dispatch, "DRIVER_TCKN").text = h.sofor_tc or ""
        ET.SubElement(dispatch, "NOTES1").text = data.genel_notlar or ""
        tasiyici_bilgi = f"{h.tasiyici_unvan or ''} | {h.plaka or ''} | {h.sofor_ad_soyad or ''}"
        ET.SubElement(dispatch, "NOTES2").text = tasiyici_bilgi.strip(" |")

        # Ürün Kalemleri Tablosu
        transactions = ET.SubElement(dispatch, "TRANSACTIONS")
        for idx, k in enumerate(data.kalemler, 1):
            t = ET.SubElement(transactions, "TRANSACTION")
            ET.SubElement(t, "TYPE").text = "0"  # Malzeme hareketi
            ET.SubElement(t, "LINE_NUMBER").text = str(k.sira_no or idx)
            ET.SubElement(t, "MASTER_CODE").text = f"STK-{(k.sira_no or idx):03d}"
            ET.SubElement(t, "ITEM_NAME").text = k.mal_hizmet
            ET.SubElement(t, "QUANTITY").text = str(k.miktar or 1)
            ET.SubElement(t, "UNIT_CODE").text = self._map_unit_code(k.birim)
            ET.SubElement(t, "VAT_RATE").text = "20"
            if k.birim_fiyat:
                ET.SubElement(t, "PRICE").text = str(k.birim_fiyat)
            if k.tutar:
                ET.SubElement(t, "TOTAL").text = str(k.tutar)
            if k.notlar:
                ET.SubElement(t, "DESCRIPTION").text = k.notlar


    def _map_unit_code(self, unit: str | None) -> str:
        if not unit:
            return "ADET"
        u = unit.upper()
        if "KOL" in u:
            return "KOLI"
        if "PAL" in u:
            return "PALET"
        if "KG" in u or "KİLO" in u or "KILO" in u:
            return "KG"
        if "TON" in u:
            return "TON"
        if "MET" in u or u == "M":
            return "MT"
        if "LT" in u or "LİTR" in u or "LITR" in u:
            return "LT"
        if "M3" in u or "METREK" in u:
            return "M3"
        return "ADET"

    def _doc_to_erp_dict(self, doc: DocumentItem) -> Dict[str, Any]:
        data = doc.veri
        h = data.header if data else None
        return {
            "evrak_id": doc.id,
            "dosya_adi": doc.dosya_adi,
            "durum": doc.durum.value,
            "guven_skoru": data.guven_skoru if data else 0.0,
            "okunabilirlik": data.okunabilirlik_durumu if data else "orta",
            "irsaliye_no": h.irsaliye_no if h else None,
            "irsaliye_tipi": h.irsaliye_tipi if h else "Sevk İrsaliyesi",
            "duzenleme_tarihi": h.duzenleme_tarihi if h else None,
            "sevk_tarihi": h.sevk_tarihi if h else None,
            "sevk_saati": h.sevk_saati if h else None,
            "gonderici": {
                "unvan": h.gonderici_unvan if h else None,
                "vkn": h.gonderici_vkn if h else None,
                "vergi_dairesi": h.gonderici_vergi_dairesi if h else None,
                "adres": h.gonderici_adres if h else None,
            },
            "alici": {
                "unvan": h.alici_unvan if h else None,
                "vkn": h.alici_vkn if h else None,
                "vergi_dairesi": h.alici_vergi_dairesi if h else None,
                "teslim_adresi": h.teslim_adresi if h else None,
            },
            "nakliye": {
                "tasiyici_unvan": h.tasiyici_unvan if h else None,
                "plaka": h.plaka if h else None,
                "sofor_ad_soyad": h.sofor_ad_soyad if h else None,
                "sofor_tc": h.sofor_tc if h else None,
            },
            "kalemler": [
                {
                    "sira_no": k.sira_no or i + 1,
                    "mal_hizmet": k.mal_hizmet,
                    "miktar": k.miktar,
                    "birim": k.birim,
                    "birim_fiyat": k.birim_fiyat,
                    "tutar": k.tutar,
                    "notlar": k.notlar,
                }
                for i, k in enumerate(data.kalemler)
            ] if data else [],
            "toplam_miktar": data.genel_toplam_miktar if data else None,
            "teslimat_notlari": data.genel_notlar if data else None,
            "alan_guvenlikleri": getattr(data, "alan_guvenlikleri", {}) if data else {}
        }

    def _prettify_xml(self, elem: ET.Element) -> str:
        rough_string = ET.tostring(elem, "utf-8")
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")

erp_exporter = ErpExporter()
