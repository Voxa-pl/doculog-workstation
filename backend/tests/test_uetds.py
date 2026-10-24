import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.irsaliye import DocumentItem, IrsaliyeData, IrsaliyeHeader, LineItem, ProcessingStatus
from backend.app.services.document_repo import doc_repo
from backend.app.services.uetds import (
    uetds_builder,
    generate_uetds_payload,
    generate_uetds_xml
)
from backend.app.core.config import settings


class TestUETDSIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    def test_city_and_district_parsing(self):
        """Türk lojistik adreslerinden İl ve İlçe ayrıştırma testi"""
        cases = [
            ("Hadımköy Yolu Cad. No:45 Çatalca / İSTANBUL", "İSTANBUL", "ÇATALCA"),
            ("Demirtaş Organize Sanayi Bölgesi Nilüfer / BURSA", "BURSA", "NİLÜFER"),
            ("Balçık Mah. Pelitli Yolu No:88 Gebze / KOCAELİ", "KOCAELİ", "GEBZE"),
            ("İvedik Organize Sanayi 1468. Cadde Yenimahalle / ANKARA", "ANKARA", "YENİMAHALLE"),
            ("Organize Sanayi Bölgesi 11. Cadde Odunpazarı / ESKİŞEHİR", "ESKİŞEHİR", "ODUNPAZARI"),
            ("Kemalpaşa OSB 40. Sokak No:15 Kemalpaşa / İZMİR", "İZMİR", "KEMALPAŞA"),
            ("Veliköy OSB 3. Cadde No:12 Çerkezköy / TEKİRDAĞ", "TEKİRDAĞ", "ÇERKEZKÖY")
        ]
        for address, expected_city, expected_dist in cases:
            city, dist = uetds_builder.parse_city_and_district(address)
            self.assertEqual(city, expected_city, f"Hatalı il: {address} -> {city} != {expected_city}")
            self.assertEqual(dist, expected_dist, f"Hatalı ilçe: {address} -> {dist} != {expected_dist}")

    def test_driver_and_plates_extraction(self):
        """Çekici, Dorse plakaları ve gömülü Şoför TCKN ayrıştırma testi"""
        class DummyHeader:
            plaka = "34 EKL 892 / 34 EKL 893"
            sofor_ad_soyad = "Ahmet Yılmaz (T.C. 28491028472)"
            sofor_tc = ""

        plaka, dorse, sofor_ad, sofor_tc = uetds_builder.extract_driver_and_plates(DummyHeader())
        self.assertEqual(plaka, "34 EKL 892")
        self.assertEqual(dorse, "34 EKL 893")
        self.assertEqual(sofor_ad, "Ahmet Yılmaz")
        self.assertEqual(sofor_tc, "28491028472")

    def test_complete_invoice_uetds_generation(self):
        """Eksiksiz bir sevk irsaliyesinden U-ETDS Bakanlık JSON ve SOAP XML paketi üretimi"""
        doc = DocumentItem(
            id="test_uetds_complete_doc",
            dosya_adi="irsaliye_ekol.jpg",
            dosya_yolu=str(settings.UPLOAD_DIR / "dummy.jpg"),
            dosya_url="/uploads/dummy.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1024,
            yuklenme_tarihi="24.10.2026 10:00",
            veri=IrsaliyeData(
                header=IrsaliyeHeader(
                    irsaliye_no="EKL2024000012490",
                    duzenleme_tarihi="22.10.2024",
                    sevk_tarihi="22.10.2024",
                    sevk_saati="09:30",
                    gonderici_unvan="EKOL LOJİSTİK A.Ş.",
                    gonderici_vkn="3340058912",
                    gonderici_adres="Hadımköy Yolu Cad. No:45 Çatalca / İSTANBUL",
                    alici_unvan="TOFAŞ TÜRK OTOMOBİL FABRİKASI A.Ş.",
                    alici_vkn="8460012948",
                    teslim_adresi="Demirtaş Organize Sanayi Bölgesi Nilüfer / BURSA",
                    plaka="34 EKL 892 / 34 EKL 893",
                    sofor_ad_soyad="Ahmet Yılmaz",
                    sofor_tc="28491028472"
                ),
                kalemler=[
                    LineItem(sira_no=1, mal_hizmet="Otomotiv Ön Fren Diski 300mm", miktar=120.0, birim="Adet"),
                    LineItem(sira_no=2, mal_hizmet="Hava ve Yağ Filtre Kiti Seti", miktar=450.0, birim="Takım")
                ],
                genel_toplam_miktar=570.0
            )
        )

        res = uetds_builder.build_payload_from_document(doc)
        self.assertTrue(res.uetds_bildirim_hazir, f"Eksik alanlar var: {res.eksik_alanlar}")
        self.assertEqual(len(res.eksik_alanlar), 0)
        self.assertEqual(res.sefer_bilgileri.plaka, "34 EKL 892")
        self.assertEqual(res.sefer_bilgileri.dorse_plaka, "34 EKL 893")
        self.assertEqual(res.sefer_bilgileri.sofor1_tc, "28491028472")

        # JSON Payload kontrolü
        json_body = res.json_payload
        self.assertIn("seferBildirim", json_body)
        self.assertEqual(json_body["seferBildirim"]["sofor1Tc"], "28491028472")
        self.assertEqual(len(json_body["seferBildirim"]["yukListesi"]), 1)
        yuk = json_body["seferBildirim"]["yukListesi"][0]
        self.assertEqual(yuk["yuklemeIl"], "İSTANBUL")
        self.assertEqual(yuk["yuklemeIlce"], "ÇATALCA")
        self.assertEqual(yuk["bosaltmaIl"], "BURSA")
        self.assertEqual(yuk["bosaltmaIlce"], "NİLÜFER")

        # SOAP XML kontrolü
        soap_str = res.soap_xml_payload
        self.assertIn("<uet:uetdsEsyaSeferBildir>", soap_str)
        self.assertIn("<uet:plaka>34 EKL 892</uet:plaka>", soap_str)
        self.assertIn("<uet:sofor1Tc>28491028472</uet:sofor1Tc>", soap_str)
        self.assertIn("<uet:yuklemeIl>İSTANBUL</uet:yuklemeIl>", soap_str)
        self.assertIn("<uet:bosaltmaIl>BURSA</uet:bosaltmaIl>", soap_str)

    def test_missing_fields_detection(self):
        """Eksik şoför TCKN veya plaka durumunda bildirim hazırlık uyarısı"""
        doc = DocumentItem(
            id="test_uetds_missing_doc",
            dosya_adi="eksik.jpg",
            dosya_yolu="",
            dosya_url="",
            mime_type="image/jpeg",
            boyut_bytes=0,
            yuklenme_tarihi="",
            veri=IrsaliyeData(
                header=IrsaliyeHeader(
                    irsaliye_no="TRS-001"
                    # Plaka, Şoför TC, Gönderici VKN vb. eksik
                )
            )
        )
        res = uetds_builder.build_payload_from_document(doc)
        self.assertFalse(res.uetds_bildirim_hazir)
        self.assertIn("plaka", res.eksik_alanlar)
        self.assertIn("sofor_tc", res.eksik_alanlar)
        self.assertIn("gonderici_vkn", res.eksik_alanlar)

    def test_api_endpoint_uetds_payload(self):
        """GET /api/documents/{id}/uetds-payload API endpoint testi"""
        doc_id = "test_uetds_endpoint_doc"
        doc = DocumentItem(
            id=doc_id,
            dosya_adi="test.jpg",
            dosya_yolu=str(settings.UPLOAD_DIR / "dummy.jpg"),
            dosya_url="/uploads/dummy.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1024,
            yuklenme_tarihi="24.10.2026 10:00",
            veri=IrsaliyeData(
                header=IrsaliyeHeader(
                    irsaliye_no="NET2024000088912",
                    plaka="34 NTL 402",
                    sofor_ad_soyad="Serkan Özkan",
                    sofor_tc="30192847192",
                    gonderici_unvan="NETLOG LOJİSTİK HİZMETLERİ A.Ş.",
                    gonderici_vkn="6310329188",
                    gonderici_adres="Kumcular Yolu Avcılar / İSTANBUL",
                    alici_unvan="MİGROS TİCARET A.Ş.",
                    alici_vkn="6220084511",
                    teslim_adresi="Şekerpınar Mah. Çayırova / KOCAELİ"
                ),
                kalemler=[
                    LineItem(mal_hizmet="Dondurulmuş Gıda", miktar=1200.0, birim="Kg")
                ]
            )
        )
        doc_repo.save(doc)

        response = self.client.get(f"/api/documents/{doc_id}/uetds-payload")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertIn("seferBildirim", data)
        self.assertIn("xml_preview", data)
        self.assertEqual(data["seferBildirim"]["plaka"], "34 NTL 402")
        self.assertEqual(data["seferBildirim"]["sofor1Tc"], "30192847192")

        # Temizlik
        doc_repo.delete(doc_id, delete_files=False)


if __name__ == "__main__":
    unittest.main()
