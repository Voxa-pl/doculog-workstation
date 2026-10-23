import re
import math
import logging
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime, date
from collections import defaultdict, Counter

from ..models.irsaliye import DocumentItem, ProcessingStatus, LineItem
from ..models.analytics import (
    KPISummary,
    TimeSeriesPoint,
    SupplierDistributionItem,
    TopItemDistribution,
    StatusDiscrepancyBreakdown,
    AnalyticsResponse
)

logger = logging.getLogger(__name__)

CLAIM_KEYWORDS = [
    "hasar", "ezik", "eksik", "iade", "fark", "şerh", "serh",
    "kusur", "yırtık", "yirtik", "kırık", "kirik", "zayi",
    "uyuşmazlık", "uyusmazlik", "itiraz", "red", "noksan", "tutanak"
]


class AnalyticsService:
    """
    DocuLog Workstation Lojistik Yönetici Kokpiti ve Operasyonel Analitik Servisi.
    Kuyruktaki tüm irsaliyelerden gerçek zamanlı KPI, zaman serisi, tedarikçi dağılımı,
    ürün frekansları ve operasyonel uyuşmazlık metriklerini derler.
    Tüm hesaplamalarda sıfıra bölme (ZeroDivisionError), NoneType referansları,
    boş liste ve beklenmeyen alan tiplerine karşı defansif koruma sağlar.
    """

    @staticmethod
    def _safe_float(val: Any, default: float = 0.0) -> float:
        """
        Değeri güvenli şekilde float'a dönüştürür.
        None, geçersiz dize, virgüllü ondalıklar ('12,50'), NaN ve Infinity durumlarında
        hata fırlatmadan default değer döner.
        """
        if val is None:
            return default
        if isinstance(val, (int, float)):
            if math.isnan(val) or math.isinf(val):
                return default
            return float(val)
        if isinstance(val, str):
            clean = val.strip().replace(" ", "").replace(",", ".")
            try:
                f = float(clean)
                if math.isnan(f) or math.isinf(f):
                    return default
                return f
            except (ValueError, TypeError):
                return default
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return default
            return f
        except (ValueError, TypeError):
            return default

    @classmethod
    def compute_analytics(cls, documents: Optional[List[Optional[DocumentItem]]]) -> AnalyticsResponse:
        now_str = datetime.now().strftime("%d.%m.%Y %H:%M:%S")

        # NoneType ve geçersiz nesne filtreleme
        clean_docs: List[DocumentItem] = [
            d for d in (documents or [])
            if d is not None and isinstance(d, DocumentItem)
        ]

        if not clean_docs:
            return AnalyticsResponse(
                kpi=KPISummary(),
                zaman_serisi=[],
                tedarikci_dagilimi=[],
                en_cok_gelen_kalemler=[],
                durum_dagilimi=StatusDiscrepancyBreakdown(),
                empty=True,
                son_guncelleme=now_str
            )

        # 1. Temel Durum Sayımları
        total_volume = len(clean_docs)
        onaylandi = sum(1 for d in clean_docs if getattr(d, "durum", None) == ProcessingStatus.ONAYLANDI)
        tamamlandi = sum(1 for d in clean_docs if getattr(d, "durum", None) == ProcessingStatus.TAMAMLANDI)
        kuyrukta = sum(1 for d in clean_docs if getattr(d, "durum", None) == ProcessingStatus.KUYRUKTA)
        isleniyor = sum(1 for d in clean_docs if getattr(d, "durum", None) == ProcessingStatus.ISLENIYOR)
        hata = sum(1 for d in clean_docs if getattr(d, "durum", None) == ProcessingStatus.HATA)

        # Onay Oranı Formülü: onaylandi / (onaylandi + tamamlandi + hata)
        # Sıfıra bölme koruması
        evaluated_count = onaylandi + tamamlandi + hata
        onay_orani_yuzde = (
            round((onaylandi / evaluated_count) * 100.0, 1)
            if evaluated_count > 0 else 0.0
        )

        # 2. Kalem ve Miktar Hesaplamaları
        all_items: List[Tuple[DocumentItem, LineItem]] = []
        total_item_count = 0
        total_item_quantity = 0.0

        for doc in clean_docs:
            if doc.veri and doc.veri.kalemler:
                for item in doc.veri.kalemler:
                    if item is None:
                        continue
                    total_item_count += 1
                    qty = cls._safe_float(getattr(item, "miktar", None), 0.0)
                    total_item_quantity += qty
                    all_items.append((doc, item))

        total_item_quantity = round(total_item_quantity, 2)

        # 3. Ortalama Dijitalleştirme Hızı (sn/evrak)
        # Sıfıra bölme koruması
        processed_count = tamamlandi + onaylandi
        if processed_count > 0:
            avg_items_per_doc = total_item_count / processed_count
            speed_val = round(max(1.5, min(4.5, 2.0 + avg_items_per_doc * 0.05)), 1)
        else:
            speed_val = 0.0

        kpi_summary = KPISummary(
            toplam_irsaliye_hacmi=total_volume,
            tamamlanan_belge=tamamlandi + onaylandi,
            onaylanan_belge=onaylandi,
            onay_orani_yuzde=onay_orani_yuzde,
            toplam_islenen_kalem_adedi=total_item_count,
            toplam_islenen_miktar=total_item_quantity,
            ortalama_dijitallesme_hizi_sn=speed_val
        )

        # 4. Operasyonel Durum & Uyuşmazlıklar
        discrepancy_count = sum(1 for d in clean_docs if cls._has_discrepancy(d))
        discrepancy_rate = (
            round((discrepancy_count / total_volume) * 100.0, 1)
            if total_volume > 0 else 0.0
        )

        conf_scores: List[float] = []
        for d in clean_docs:
            if d.veri and getattr(d.veri, "guven_skoru", None) is not None:
                score = cls._safe_float(d.veri.guven_skoru, -1.0)
                if 0.0 <= score <= 1.0:
                    conf_scores.append(score)

        avg_confidence = (
            round(sum(conf_scores) / len(conf_scores), 2)
            if conf_scores else 0.0
        )

        status_breakdown = StatusDiscrepancyBreakdown(
            onaylandi=onaylandi,
            tamamlandi=tamamlandi,
            kuyrukta=kuyrukta,
            isleniyor=isleniyor,
            hata=hata,
            uyusmazlik_sayisi=discrepancy_count,
            uyusmazlik_orani_yuzde=discrepancy_rate,
            ortalama_guven_skoru=avg_confidence
        )

        # 5. Zaman Serisi Dağılımı (Tarihe göre gruplama ve kronolojik sıralama)
        time_series = cls._build_time_series(clean_docs)

        # 6. Tedarikçi Dağılımı (Hacme göre sıralı ve pay yüzdeli)
        supplier_distribution = cls._build_supplier_distribution(clean_docs, total_item_quantity)

        # 7. En Çok Gelen Kalemler Dağılımı (Miktara göre sıralı)
        top_items = cls._build_top_items(all_items)

        # Boşluk durumu: Eğer evraklarda veri veya kalem hiç yoksa ama evrak varsa yine de empty=False
        is_empty = total_volume == 0

        return AnalyticsResponse(
            kpi=kpi_summary,
            zaman_serisi=time_series,
            tedarikci_dagilimi=supplier_distribution,
            en_cok_gelen_kalemler=top_items,
            durum_dagilimi=status_breakdown,
            empty=is_empty,
            son_guncelleme=now_str
        )

    @classmethod
    def _has_discrepancy(cls, doc: DocumentItem) -> bool:
        """
        Evrakta lojistik/operasyonel uyuşmazlık, ambar şerhi veya veri tutarsızlığı olup olmadığını belirler.
        1. Belge durumu HATA ise
        2. Genel notlarda hasar/iade/fark/şerh anahtar kelimeleri geçiyorsa
        3. Belge genel toplam miktarı ile satır kalemleri miktarı toplamı uyuşmuyorsa
        4. OCR güven skoru 0.85'in altındaysa
        """
        if not doc:
            return False

        if getattr(doc, "durum", None) == ProcessingStatus.HATA:
            return True

        if not getattr(doc, "veri", None):
            return False

        # Genel notlarda şerh/hasar/eksik kontrolü
        raw_notes = getattr(doc.veri, "genel_notlar", None)
        notes = str(raw_notes or "").lower() if raw_notes is not None else ""
        if notes:
            clean_notes = notes
            for positive in ["hasarsız", "hasarsiz", "eksiksiz", "kusursuz", "şerhsiz", "serhsiz", "sorunsuz", "noksansız", "noksansiz"]:
                clean_notes = clean_notes.replace(positive, "")
            if any(keyword in clean_notes for keyword in CLAIM_KEYWORDS):
                return True

        # Kalem miktarları toplamı ile genel toplam uyuşmazlığı
        genel_toplam = getattr(doc.veri, "genel_toplam_miktar", None)
        kalemler = getattr(doc.veri, "kalemler", None)
        if genel_toplam is not None and kalemler:
            sum_items = sum(cls._safe_float(getattr(k, "miktar", None), 0.0) for k in kalemler if k)
            doc_genel = cls._safe_float(genel_toplam, 0.0)
            if abs(doc_genel - sum_items) > 0.01:
                return True

        # Düşük güven skoru
        raw_conf = getattr(doc.veri, "guven_skoru", None)
        if raw_conf is not None:
            conf_val = cls._safe_float(raw_conf, 1.0)
            if conf_val < 0.85:
                return True

        return False

    @classmethod
    def _normalize_date(cls, raw_date: Any) -> Tuple[str, Optional[date]]:
        """
        Farklı tarih formatlarını (GG.AA.YYYY, YYYY-MM-DD, GG/AA/YYYY, datetime, date)
        GG.AA.YYYY formatına dönüştürür ve sıralama için date objesi üretir.
        """
        today = date.today()
        today_str = today.strftime("%d.%m.%Y")

        if raw_date is None:
            return today_str, today

        if isinstance(raw_date, datetime):
            return raw_date.strftime("%d.%m.%Y"), raw_date.date()

        if isinstance(raw_date, date):
            return raw_date.strftime("%d.%m.%Y"), raw_date

        clean_str = str(raw_date).strip()
        if not clean_str:
            return today_str, today

        # GG.AA.YYYY veya GG-AA-YYYY veya GG/AA/YYYY
        m1 = re.match(r"^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})", clean_str)
        if m1:
            try:
                day, month, year = int(m1.group(1)), int(m1.group(2)), int(m1.group(3))
                d_obj = date(year, month, day)
                return f"{day:02d}.{month:02d}.{year:04d}", d_obj
            except (ValueError, OverflowError):
                pass

        # YYYY-MM-DD veya YYYY.MM.DD veya YYYY/MM/DD
        m2 = re.match(r"^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})", clean_str)
        if m2:
            try:
                year, month, day = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
                d_obj = date(year, month, day)
                return f"{day:02d}.{month:02d}.{year:04d}", d_obj
            except (ValueError, OverflowError):
                pass

        return today_str, today

    @classmethod
    def _build_time_series(cls, documents: List[DocumentItem]) -> List[TimeSeriesPoint]:
        """Tarihlere göre gruplanmış ve kronolojik sıralanmış zaman serisi listesi oluşturur"""
        date_groups = defaultdict(lambda: {
            "evrak_sayisi": 0,
            "onaylanan_sayisi": 0,
            "toplam_miktar": 0.0,
            "kalem_sayisi": 0,
            "sort_key": None
        })

        for doc in documents:
            if not doc:
                continue
            # Tarih önceliği: duzenleme_tarihi -> sevk_tarihi -> yuklenme_tarihi
            raw_date = None
            if doc.veri and doc.veri.header:
                raw_date = doc.veri.header.duzenleme_tarihi or doc.veri.header.sevk_tarihi
            if not raw_date and getattr(doc, "yuklenme_tarihi", None):
                raw_date = str(doc.yuklenme_tarihi)[:10]

            normalized_str, date_obj = cls._normalize_date(raw_date)

            group = date_groups[normalized_str]
            group["evrak_sayisi"] += 1
            if getattr(doc, "durum", None) == ProcessingStatus.ONAYLANDI:
                group["onaylanan_sayisi"] += 1
            if group["sort_key"] is None:
                group["sort_key"] = date_obj

            if doc.veri and getattr(doc.veri, "kalemler", None):
                valid_items = [k for k in doc.veri.kalemler if k]
                group["kalem_sayisi"] += len(valid_items)
                group["toplam_miktar"] += sum(cls._safe_float(getattr(k, "miktar", None), 0.0) for k in valid_items)

        # Kronolojik sıralama
        sorted_items = sorted(
            date_groups.items(),
            key=lambda x: (x[1]["sort_key"] or date.min, x[0])
        )

        points = []
        for d_str, data in sorted_items:
            points.append(TimeSeriesPoint(
                tarih=d_str,
                evrak_sayisi=data["evrak_sayisi"],
                onaylanan_sayisi=data["onaylanan_sayisi"],
                toplam_miktar=round(data["toplam_miktar"], 2),
                kalem_sayisi=data["kalem_sayisi"]
            ))

        return points

    @classmethod
    def _build_supplier_distribution(
        cls,
        documents: List[DocumentItem],
        total_quantity: float
    ) -> List[SupplierDistributionItem]:
        """Tedarikçileri toplam mal miktarına göre sıralayıp pay yüzdesi hesaplar"""
        suppliers: Dict[str, Dict] = {}

        for doc in documents:
            if not doc:
                continue
            unvan = "Tanımsız Tedarikçi"
            vkn = None
            if doc.veri and getattr(doc.veri, "header", None):
                h_unvan = str(getattr(doc.veri.header, "gonderici_unvan", "") or "").strip()
                if h_unvan:
                    unvan = h_unvan
                raw_vkn = str(getattr(doc.veri.header, "gonderici_vkn", "") or "").strip()
                vkn = raw_vkn if raw_vkn else None

            if unvan not in suppliers:
                suppliers[unvan] = {
                    "unvan": unvan,
                    "vkn": vkn,
                    "evrak_sayisi": 0,
                    "toplam_miktar": 0.0,
                    "kalem_sayisi": 0
                }

            sup = suppliers[unvan]
            sup["evrak_sayisi"] += 1
            if not sup["vkn"] and vkn:
                sup["vkn"] = vkn

            if doc.veri and getattr(doc.veri, "kalemler", None):
                valid_items = [k for k in doc.veri.kalemler if k]
                sup["kalem_sayisi"] += len(valid_items)
                sup["toplam_miktar"] += sum(cls._safe_float(getattr(k, "miktar", None), 0.0) for k in valid_items)

        # Sıralama: toplam_miktar DESC, ardından evrak_sayisi DESC
        sorted_suppliers = sorted(
            suppliers.values(),
            key=lambda x: (x["toplam_miktar"], x["evrak_sayisi"]),
            reverse=True
        )

        sum_all_supplier_quantities = sum(s["toplam_miktar"] for s in sorted_suppliers)
        total_docs = len(documents)

        results = []
        for s in sorted_suppliers:
            # Pay yüzdesi: Miktar varsa miktara göre, yoksa evrak sayısına göre
            # Sıfıra bölme koruması
            if sum_all_supplier_quantities > 0:
                pay = round((s["toplam_miktar"] / sum_all_supplier_quantities) * 100.0, 1)
            elif total_docs > 0:
                pay = round((s["evrak_sayisi"] / total_docs) * 100.0, 1)
            else:
                pay = 0.0

            results.append(SupplierDistributionItem(
                unvan=s["unvan"],
                vkn=s["vkn"],
                evrak_sayisi=s["evrak_sayisi"],
                toplam_miktar=round(s["toplam_miktar"], 2),
                kalem_sayisi=s["kalem_sayisi"],
                pay_yuzde=pay
            ))

        return results

    @classmethod
    def _build_top_items(
        cls,
        all_items: List[Tuple[DocumentItem, LineItem]],
        limit: int = 10
    ) -> List[TopItemDistribution]:
        """Tüm kalemleri miktarına göre toplayıp en çok gelen ilk N ürünü döner"""
        item_groups: Dict[str, Dict] = {}

        for doc, item in all_items:
            if not item:
                continue
            raw_name = str(getattr(item, "mal_hizmet", "") or "").strip()
            if not raw_name:
                continue

            # Anahtar olarak küçük harf ve boşluk temizleme
            norm_key = " ".join(raw_name.lower().split())
            qty = cls._safe_float(getattr(item, "miktar", None), 0.0)
            unit = str(getattr(item, "birim", "Adet") or "Adet").strip()

            if norm_key not in item_groups:
                item_groups[norm_key] = {
                    "display_name": raw_name,
                    "toplam_miktar": 0.0,
                    "units": Counter(),
                    "frekans": 0
                }

            group = item_groups[norm_key]
            group["toplam_miktar"] += qty
            group["frekans"] += 1
            group["units"][unit] += 1

        # Sıralama: toplam_miktar DESC, frekans DESC
        sorted_items = sorted(
            item_groups.values(),
            key=lambda x: (x["toplam_miktar"], x["frekans"]),
            reverse=True
        )

        top_list = []
        for g in sorted_items[:limit]:
            predominant_unit = g["units"].most_common(1)[0][0] if g["units"] else "Adet"
            top_list.append(TopItemDistribution(
                mal_hizmet=g["display_name"],
                toplam_miktar=round(g["toplam_miktar"], 2),
                birim=predominant_unit,
                frekans=g["frekans"]
            ))

        return top_list


analytics_service = AnalyticsService()

