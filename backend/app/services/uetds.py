import re
import logging
from typing import Tuple, Optional, List, Dict, Any
from datetime import datetime
from ..models.irsaliye import DocumentItem, IrsaliyeData
from ..models.uetds import (
    UETDSSeferBilgisi,
    UETDSYukBilgisi,
    UETDSSeferBildirimResponse
)

logger = logging.getLogger(__name__)

TURKISH_PROVINCES = [
    "ADANA", "ADIYAMAN", "AFYONKARAHİSAR", "AĞRI", "AMASYA", "ANKARA", "ANTALYA", "ARTVİN",
    "AYDIN", "BALIKESİR", "BİLECİK", "BİNGÖL", "BİTLİS", "BOLU", "BURDUR", "BURSA",
    "ÇANAKKALE", "ÇANKIRI", "ÇORUM", "DENİZLİ", "DİYARBAKIR", "EDİRNE", "ELAZIĞ", "ERZİNCAN",
    "ERZURUM", "ESKİŞEHİR", "GAZİANTEP", "GİRESUN", "GÜMÜŞHANE", "HAKKARİ", "HATAY", "ISPARTA",
    "MERSİN", "İSTANBUL", "İZMİR", "KARS", "KASTAMONU", "KAYSERİ", "KIRKLARELİ", "KIRŞEHİR",
    "KOCAELİ", "KONYA", "KÜTAHYA", "MALATYA", "MANİSA", "KAHRAMANMARAŞ", "MARDİN", "MUĞLA",
    "MUŞ", "NEVŞEHİR", "NİĞDE", "ORDU", "RİZE", "SAKARYA", "SAMSUN", "SİİRT", "SİNOP",
    "SİVAS", "TEKİRDAĞ", "TOKAT", "TRABZON", "TUNCELİ", "ŞANLIURFA", "UŞAK", "VAN",
    "YOZGAT", "ZONGULDAK", "AKSARAY", "BAYBURT", "KARAMAN", "KIRIKKALE", "BATMAN", "ŞIRNAK",
    "BARTIN", "ARDAHAN", "IĞDIR", "YALOVA", "KARABÜK", "KİLİS", "OSMANİYE", "DÜZCE"
]

COMMON_DISTRICTS = {
    "İSTANBUL": ["TUZLA", "ÇATALCA", "AVCILAR", "BAĞCILAR", "ESENYURT", "BEYLİKDÜZÜ", "ÜSKÜDAR", "ÜMRANİYE", "SULTANBEYLİ", "KADIKÖY", "ŞİŞLİ", "BEYKOZ", "PENDİK", "MALTEPE", "KARTAL", "ZEYTİNBURNU", "BAŞAKŞEHİR"],
    "KOCAELİ": ["GEBZE", "ÇAYIROVA", "DİLOVASI", "KÖRFEZ", "İZMİT", "BAŞİSKELE", "GÖLCÜK", "DARICA", "KARTEPE"],
    "BURSA": ["NİLÜFER", "OSMANGAZİ", "YILDIRIM", "KARACABEY", "YENİŞEHİR", "İNEGÖL", "GEMLİK", "MUDANYA"],
    "ANKARA": ["YENİMAHALLE", "SİNCAN", "ÇANKAYA", "KAHRAMANKAZAN", "ETİMESGUT", "ALTINDAĞ", "PURSAKLAR"],
    "İZMİR": ["KEMALPAŞA", "BORNOVA", "ÇİĞLİ", "ALİAĞA", "TORBALI", "GAZİEMİR", "MENEMEN", "BUCA"],
    "TEKİRDAĞ": ["ÇERKEZKÖY", "ÇORLU", "ERGENE", "SÜLEYMANPAŞA", "KAPAKLI", "MURATLI"],
    "SAKARYA": ["ADAPAZARI", "SERDİVAN", "ARİFİYE", "ERENLER", "HENDEK", "AKYAZI"],
    "ESKİŞEHİR": ["ODUNPAZARI", "TEPEBAŞI"],
    "MANİSA": ["YUNUSEMRE", "ŞEHZADELER", "TURGUTLU", "AKHİSAR", "SALİHLİ"],
    "TOKAT": ["MERKEZ", "TURHAL", "ERBAA", "NİKSAR", "ZİLE"]
}


def tr_upper(text: Optional[str]) -> str:
    """
    Türkçe karakter kurallarına uygun büyük harf dönüşümü yapar.
    i -> İ, ı -> I
    """
    if not text:
        return ""
    return str(text).replace("i", "İ").replace("ı", "I").upper()


def canonical_district(candidate: str, city: str) -> str:
    """
    İlçe ismini COMMON_DISTRICTS listesindeki standart yazıma normalize eder.
    """
    cand_norm = tr_upper(candidate).strip()
    districts = COMMON_DISTRICTS.get(city, [])
    for d in districts:
        if d == cand_norm:
            return d
        if d.replace("İ", "I") == cand_norm.replace("İ", "I"):
            return d
    return cand_norm


class UETDSBuilder:
    """
    4925 Sayılı Karayolu Taşıma Kanunu ve U-ETDS Yük Taşıma Yönetmeliği
    Bakanlık Bildirim Paketi Üreticisi.
    """

    @classmethod
    def parse_city_and_district(cls, address: Optional[str], tax_office: Optional[str] = None) -> Tuple[str, str]:
        """
        Adres metninden veya vergi dairesinden İl ve İlçe bilgisini ayrıştırır.
        Örnekler:
        'Hadımköy Yolu Cad. No:45 Çatalca / İSTANBUL' -> ('İSTANBUL', 'ÇATALCA')
        'İvedik Organize Sanayi 1468. Cadde Yenimahalle / ANKARA' -> ('ANKARA', 'YENİMAHALLE')
        'Balçık Mah. Pelitli Yolu Gebze / KOCAELİ' -> ('KOCAELİ', 'GEBZE')
        """
        if not address and not tax_office:
            return ("İSTANBUL", "MERKEZ")

        combined = f"{address or ''} {tax_office or ''}"
        raw = tr_upper(combined)
        # Türkçe karakter normalizasyonu (I/İ)
        raw = raw.replace("ISTANBUL", "İSTANBUL").replace("IZMIR", "İZMİR")

        found_city = "İSTANBUL"
        found_district = "MERKEZ"

        # 1. İlçe / İl eşleştirmesi: 'Çatalca / İSTANBUL' veya 'Nilüfer / BURSA'
        slash_match = re.search(r"([A-ZÇĞİÖŞÜa-zçğıöşü]+)\s*/\s*([A-ZÇĞİÖŞÜa-zçğıöşü]+)", combined)
        if slash_match:
            d_candidate = tr_upper(slash_match.group(1).strip())
            c_candidate = tr_upper(slash_match.group(2).strip())
            for city in TURKISH_PROVINCES:
                if city == c_candidate or city in c_candidate:
                    found_city = city
                    found_district = canonical_district(d_candidate, found_city)
                    return (found_city, found_district)

        # 2. İlleri tara
        for city in TURKISH_PROVINCES:
            if re.search(r"\b" + re.escape(city) + r"\b", raw):
                found_city = city
                break

        # 3. Bulunan ilin ilçelerini tara
        districts = COMMON_DISTRICTS.get(found_city, [])
        for dist in districts:
            if re.search(r"\b" + re.escape(dist) + r"\b", raw):
                found_district = dist
                break

        # Vergi dairesinden ilçe çıkarma (Örn: "Çerkezköy Vergi Dairesi")
        if found_district == "MERKEZ" and tax_office:
            t_upper = tr_upper(tax_office).replace("VERGİ DAİRESİ", "").replace("V.D.", "").strip()
            if t_upper and len(t_upper) >= 3:
                found_district = canonical_district(t_upper, found_city)

        return (found_city, found_district)

    @classmethod
    def extract_driver_and_plates(cls, header: Any) -> Tuple[str, Optional[str], str, str]:
        """
        Plaka (Çekici + Varsa Dorse) ve Şoför (Ad Soyad + TCKN) bilgilerini ayrıştırır.
        Örn: '34 EKL 892 / 34 EKL 893' -> plaka='34 EKL 892', dorse='34 EKL 893'
        'Ahmet Yılmaz (T.C. 28491028472)' -> ad='Ahmet Yılmaz', tc='28491028472'
        """
        raw_plaka = str(getattr(header, "plaka", "") or "").strip()
        plaka = "34 ABC 001"
        dorse: Optional[str] = None

        if "/" in raw_plaka:
            parts = [p.strip() for p in raw_plaka.split("/")]
            plaka = parts[0]
            if len(parts) > 1 and parts[1]:
                dorse = parts[1]
        elif raw_plaka:
            plaka = raw_plaka

        raw_sofor = str(getattr(header, "sofor_ad_soyad", "") or "").strip()
        raw_tc = str(getattr(header, "sofor_tc", "") or "").strip()

        sofor_ad = raw_sofor or "Şoför Yetkilisi"
        sofor_tc = re.sub(r"\D", "", raw_tc)

        # Eğer TC şoför adının içine gömülmüşse: "Mustafa Demir (T.C. 49102837190)"
        tc_in_name = re.search(r"\b(\d{11})\b", raw_sofor)
        if tc_in_name:
            if not sofor_tc or len(sofor_tc) != 11:
                sofor_tc = tc_in_name.group(1)
            sofor_ad = re.sub(r"\([^)]*\)", "", sofor_ad).strip()

        if not sofor_tc or len(sofor_tc) != 11:
            sofor_tc = "10000000146"  # Varsayılan test/taslak TCKN formatı

        return (plaka, dorse, sofor_ad, sofor_tc)

    @classmethod
    def build_payload_from_document(cls, doc: DocumentItem) -> UETDSSeferBildirimResponse:
        """
        DocuLog DocumentItem nesnesinden resmi U-ETDS Yük Sefer Bildirimi oluşturur.
        """
        doc_id = doc.id
        veri: Optional[IrsaliyeData] = doc.veri
        header = veri.header if veri else None
        kalemler = veri.kalemler if veri and veri.kalemler else []

        missing_fields: List[str] = []

        irsaliye_no = str(getattr(header, "irsaliye_no", "") or "").strip()
        if not irsaliye_no:
            irsaliye_no = f"IRS-{doc_id[:8]}"
            missing_fields.append("irsaliye_no")

        # Tarihler
        sevk_tarihi = str(getattr(header, "sevk_tarihi", "") or getattr(header, "duzenleme_tarihi", "") or "").strip()
        if not sevk_tarihi:
            sevk_tarihi = datetime.now().strftime("%d/%m/%Y")
            missing_fields.append("sevk_tarihi")
        else:
            sevk_tarihi = sevk_tarihi.replace(".", "/")

        sevk_saati = str(getattr(header, "sevk_saati", "") or "09:00").strip()

        # Araç ve Şoför
        plaka, dorse, sofor_ad, sofor_tc = cls.extract_driver_and_plates(header)
        if not getattr(header, "plaka", None):
            missing_fields.append("plaka")
        if not getattr(header, "sofor_tc", None) and "10000000146" in sofor_tc:
            missing_fields.append("sofor_tc")

        # Taraflar (Gönderici / Alıcı)
        gonderici_unvan = str(getattr(header, "gonderici_unvan", "") or "").strip()
        if not gonderici_unvan:
            gonderici_unvan = "GÖNDERİCİ TİCARET A.Ş."
            missing_fields.append("gonderici_unvan")

        gonderici_vkn = re.sub(r"\D", "", str(getattr(header, "gonderici_vkn", "") or ""))
        if len(gonderici_vkn) not in (10, 11):
            gonderici_vkn = "1111111111"
            missing_fields.append("gonderici_vkn")

        alici_unvan = str(getattr(header, "alici_unvan", "") or "").strip()
        if not alici_unvan:
            alici_unvan = "ALICI LOJİSTİK LTD. ŞTİ."
            missing_fields.append("alici_unvan")

        alici_vkn = re.sub(r"\D", "", str(getattr(header, "alici_vkn", "") or ""))
        if len(alici_vkn) not in (10, 11):
            alici_vkn = "2222222222"
            missing_fields.append("alici_vkn")

        # Çıkış ve Varış Lokasyonları
        cikis_il, cikis_ilce = cls.parse_city_and_district(
            getattr(header, "gonderici_adres", None),
            getattr(header, "gonderici_vergi_dairesi", None)
        )
        varis_il, varis_ilce = cls.parse_city_and_district(
            getattr(header, "teslim_adresi", None),
            getattr(header, "alici_vergi_dairesi", None)
        )

        # Yük Açıklaması ve Toplam Miktar
        toplam_miktar = 0.0
        kalem_aciklamalari: List[str] = []
        predominant_unit = "KG"

        for k in kalemler:
            if not k:
                continue
            qty = float(k.miktar) if k.miktar is not None else 1.0
            toplam_miktar += qty
            if k.mal_hizmet:
                kalem_aciklamalari.append(k.mal_hizmet.strip())
            if k.birim:
                predominant_unit = k.birim.upper()

        if veri and veri.genel_toplam_miktar:
            toplam_miktar = float(veri.genel_toplam_miktar)

        if toplam_miktar <= 0:
            toplam_miktar = 1000.0
            missing_fields.append("yuk_miktari")

        yuk_tanimi = ", ".join(kalem_aciklamalari[:4]) if kalem_aciklamalari else "Genel Ticari Emtia"
        if len(yuk_tanimi) > 120:
            yuk_tanimi = yuk_tanimi[:117] + "..."

        # Birim Eşleme (U-ETDS Standartları: KG, TON, ADET, KOLI, PALET)
        unit_map = {
            "ADET": "ADET", "KOLİ": "KOLI", "KOLI": "KOLI",
            "TON": "TON", "KG": "KG", "PALET": "PALET", "ÇUVAL": "CUVAL"
        }
        uetds_birim = unit_map.get(predominant_unit, "KG")

        # Sefer Bilgileri Nesnesi
        sefer_obj = UETDSSeferBilgisi(
            plaka=plaka,
            dorse_plaka=dorse,
            sofor1_tc=sofor_tc,
            sofor1_ad_soyad=sofor_ad,
            sefer_baslangic_tarihi=sevk_tarihi,
            sefer_baslangic_saati=sevk_saati,
            sefer_bitis_tarihi=sevk_tarihi,
            sefer_bitis_saati="19:00"
        )

        # Yük Kalemi Nesnesi
        yuk_obj = UETDSYukBilgisi(
            irsaliye_no=irsaliye_no,
            irsaliye_tarihi=sevk_tarihi,
            gonderen_unvan=gonderici_unvan,
            gonderen_vergi_no=gonderici_vkn,
            yukleme_ulke="TR",
            yukleme_il=cikis_il,
            yukleme_ilce=cikis_ilce,
            alici_unvan=alici_unvan,
            alici_vergi_no=alici_vkn,
            bosaltma_ulke="TR",
            bosaltma_il=varis_il,
            bosaltma_ilce=varis_ilce,
            tasima_turu_kodu=1,
            yuk_cinsi_kodu="GENEL_KARGO",
            yuk_cinsi_aciklama=yuk_tanimi,
            yuk_miktari=round(toplam_miktar, 2),
            yuk_miktari_birimi=uetds_birim
        )

        # 1. UAB REST JSON Payload
        json_payload = {
            "seferBildirim": {
                "plaka": sefer_obj.plaka,
                "dorsePlaka": sefer_obj.dorse_plaka,
                "sofor1Tc": sefer_obj.sofor1_tc,
                "sofor1AdSoyad": sefer_obj.sofor1_ad_soyad,
                "seferBaslangicTarihi": sefer_obj.sefer_baslangic_tarihi,
                "seferBaslangicSaati": sefer_obj.sefer_baslangic_saati,
                "seferBitisTarihi": sefer_obj.sefer_bitis_tarihi,
                "seferBitisSaati": sefer_obj.sefer_bitis_saati,
                "yukListesi": [
                    {
                        "irsaliyeNo": yuk_obj.irsaliye_no,
                        "irsaliyeTarihi": yuk_obj.irsaliye_tarihi,
                        "gonderenVergiNo": yuk_obj.gonderen_vergi_no,
                        "gonderenUnvan": yuk_obj.gonderen_unvan,
                        "aliciVergiNo": yuk_obj.alici_vergi_no,
                        "aliciUnvan": yuk_obj.alici_unvan,
                        "yuklemeUlke": yuk_obj.yukleme_ulke,
                        "yuklemeIl": yuk_obj.yukleme_il,
                        "yuklemeIlce": yuk_obj.yukleme_ilce,
                        "bosaltmaUlke": yuk_obj.bosaltma_ulke,
                        "bosaltmaIl": yuk_obj.bosaltma_il,
                        "bosaltmaIlce": yuk_obj.bosaltma_ilce,
                        "tasimaTuruKodu": yuk_obj.tasima_turu_kodu,
                        "yukCinsiKodu": yuk_obj.yuk_cinsi_kodu,
                        "yukCinsiAciklama": yuk_obj.yuk_cinsi_aciklama,
                        "yukMiktari": yuk_obj.yuk_miktari,
                        "yukMiktariBirimi": yuk_obj.yuk_miktari_birimi
                    }
                ]
            }
        }

        # 2. UAB SOAP XML (uetdsEsyaSeferBildir) Payload
        soap_xml_payload = f"""<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:uet="http://uetds.uab.gov.tr">
  <soapenv:Header/>
  <soapenv:Body>
    <uet:uetdsEsyaSeferBildir>
      <uet:wsuser>DOCULOG_WS_USER</uet:wsuser>
      <uet:wsuserSifre>********</uet:wsuserSifre>
      <uet:seferBilgileri>
        <uet:plaka>{sefer_obj.plaka}</uet:plaka>
        <uet:dorsePlaka>{sefer_obj.dorse_plaka or ''}</uet:dorsePlaka>
        <uet:sofor1Tc>{sefer_obj.sofor1_tc}</uet:sofor1Tc>
        <uet:sofor1AdSoyad>{sefer_obj.sofor1_ad_soyad}</uet:sofor1AdSoyad>
        <uet:seferBaslangicTarihi>{sefer_obj.sefer_baslangic_tarihi}</uet:seferBaslangicTarihi>
        <uet:seferBaslangicSaati>{sefer_obj.sefer_baslangic_saati}</uet:seferBaslangicSaati>
        <uet:seferBitisTarihi>{sefer_obj.sefer_bitis_tarihi}</uet:seferBitisTarihi>
        <uet:seferBitisSaati>{sefer_obj.sefer_bitis_saati}</uet:seferBitisSaati>
      </uet:seferBilgileri>
      <uet:yukBilgileriListesi>
        <uet:yukBilgisi>
          <uet:irsaliyeNo>{yuk_obj.irsaliye_no}</uet:irsaliyeNo>
          <uet:irsaliyeTarihi>{yuk_obj.irsaliye_tarihi}</uet:irsaliyeTarihi>
          <uet:gonderenVergiNo>{yuk_obj.gonderen_vergi_no}</uet:gonderenVergiNo>
          <uet:gonderenUnvan>{yuk_obj.gonderen_unvan}</uet:gonderenUnvan>
          <uet:aliciVergiNo>{yuk_obj.alici_vergi_no}</uet:aliciVergiNo>
          <uet:aliciUnvan>{yuk_obj.alici_unvan}</uet:aliciUnvan>
          <uet:yuklemeIl>{yuk_obj.yukleme_il}</uet:yuklemeIl>
          <uet:yuklemeIlce>{yuk_obj.yukleme_ilce}</uet:yuklemeIlce>
          <uet:bosaltmaIl>{yuk_obj.bosaltma_il}</uet:bosaltmaIl>
          <uet:bosaltmaIlce>{yuk_obj.bosaltma_ilce}</uet:bosaltmaIlce>
          <uet:yukCinsiKodu>{yuk_obj.yuk_cinsi_kodu}</uet:yukCinsiKodu>
          <uet:yukCinsiAciklama>{yuk_obj.yuk_cinsi_aciklama}</uet:yukCinsiAciklama>
          <uet:yukMiktari>{yuk_obj.yuk_miktari}</uet:yukMiktari>
          <uet:yukMiktariBirimi>{yuk_obj.yuk_miktari_birimi}</uet:yukMiktariBirimi>
        </uet:yukBilgisi>
      </uet:yukBilgileriListesi>
    </uet:uetdsEsyaSeferBildir>
  </soapenv:Body>
</soapenv:Envelope>"""

        is_ready = len(missing_fields) == 0

        return UETDSSeferBildirimResponse(
            document_id=doc_id,
            irsaliye_no=irsaliye_no,
            uetds_bildirim_hazir=is_ready,
            eksik_alanlar=missing_fields,
            sefer_bilgileri=sefer_obj,
            yuk_bilgileri=[yuk_obj],
            json_payload=json_payload,
            soap_xml_payload=soap_xml_payload
        )


uetds_builder = UETDSBuilder()


def map_to_uetds_unit(unit_str: str) -> str:
    """Helper to map raw unit string to U-ETDS standard unit code"""
    u = (unit_str or "").upper().strip()
    if "KOLİ" in u or "KOLI" in u or "PK" in u or "PAKET" in u or "KUTU" in u:
        return "KUTU"
    elif "KG" in u or "KİLO" in u or "KILOGRAM" in u:
        return "KG"
    elif "TON" in u:
        return "TON"
    elif "LT" in u or "LİTRE" in u or "LITRE" in u:
        return "LITRE"
    elif "M" in u or "METRE" in u:
        return "METRE"
    elif "PALET" in u:
        return "PALET"
    else:
        return "ADET"


def generate_uetds_payload(header: Dict[str, Any], kalemler: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Helper function to generate U-ETDS JSON payload from header and kalemler dicts"""
    from ..models.irsaliye import DocumentItem, IrsaliyeData, IrsaliyeHeader, LineItem
    
    h_dict = dict(header or {})
    if "arac_plaka" in h_dict and "plaka" not in h_dict:
        h_dict["plaka"] = h_dict["arac_plaka"]
    if "dorse_plaka" in h_dict and h_dict.get("plaka") and "/" not in h_dict["plaka"] and h_dict["dorse_plaka"]:
        h_dict["plaka"] = f"{h_dict['plaka']} / {h_dict['dorse_plaka']}"

    try:
        h_obj = IrsaliyeHeader(**h_dict)
    except Exception:
        h_obj = IrsaliyeHeader()

    k_objs: List[LineItem] = []
    if kalemler:
        for k in kalemler:
            try:
                k_copy = dict(k)
                if "miktar" in k_copy and isinstance(k_copy["miktar"], str):
                    try:
                        k_copy["miktar"] = float(k_copy["miktar"])
                    except ValueError:
                        pass
                k_objs.append(LineItem(**k_copy))
            except Exception:
                pass

    doc = DocumentItem(
        id="mock_uetds_doc",
        dosya_adi="",
        dosya_yolu="",
        dosya_url="",
        mime_type="image/jpeg",
        boyut_bytes=0,
        yuklenme_tarihi="",
        veri=IrsaliyeData(header=h_obj, kalemler=k_objs)
    )
    res = uetds_builder.build_payload_from_document(doc)
    result = dict(res.json_payload or {})
    result["uetds_bildirim_hazir"] = res.uetds_bildirim_hazir
    result["eksik_alanlar"] = res.eksik_alanlar
    return result


def generate_uetds_xml(header: Dict[str, Any], kalemler: List[Dict[str, Any]]) -> str:
    """Helper function to generate U-ETDS SOAP XML string from header and kalemler dicts"""
    plaka = (header.get("arac_plaka") or header.get("plaka") or "34ABC123").replace(" ", "")
    sofor_tc = header.get("sofor_tc") or "10000000146"
    sevk_tarihi = header.get("sevk_tarihi") or datetime.now().strftime("%Y-%m-%d")
    sevk_saati = header.get("sevk_saati") or "10:00"

    first_kalem = kalemler[0] if kalemler else {}
    mal_hizmet = first_kalem.get("mal_hizmet", "Genel Kargo")
    try:
        miktar = float(first_kalem.get("miktar", 1.0))
    except (ValueError, TypeError):
        miktar = 1.0
    birim = map_to_uetds_unit(first_kalem.get("birim", "ADET"))

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:uet="http://uetds.uab.gov.tr">
  <soapenv:Header/>
  <soapenv:Body>
    <uet:uetdsEsyaSeferBildir>
      <uet:esyaSeferBildirimiInput>
        <uet:plaka>{plaka}</uet:plaka>
        <uet:sofor1Tc>{sofor_tc}</uet:sofor1Tc>
        <uet:seferBaslangicTarihi>{sevk_tarihi}</uet:seferBaslangicTarihi>
        <uet:seferBaslangicSaati>{sevk_saati}</uet:seferBaslangicSaati>
        <uet:yukBilgisi>
          <uet:yukCinsi>{mal_hizmet}</uet:yukCinsi>
          <uet:miktar>{miktar:.1f}</uet:miktar>
          <uet:birim>{birim}</uet:birim>
        </uet:yukBilgisi>
      </uet:esyaSeferBildirimiInput>
    </uet:uetdsEsyaSeferBildir>
  </soapenv:Body>
</soapenv:Envelope>"""
    return xml

