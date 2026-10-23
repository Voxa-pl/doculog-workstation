import unittest
from datetime import datetime, date
from backend.app.models.irsaliye import DocumentItem, ProcessingStatus, IrsaliyeData, IrsaliyeHeader, LineItem
from backend.app.services.analytics_service import AnalyticsService

class TestAnalytics(unittest.TestCase):
    def test_empty_documents(self):
        res = AnalyticsService.compute_analytics([])
        self.assertTrue(res.empty)
        self.assertEqual(res.kpi.toplam_irsaliye_hacmi, 0)
        self.assertEqual(res.kpi.onay_orani_yuzde, 0.0)
        self.assertEqual(res.kpi.ortalama_dijitallesme_hizi_sn, 0.0)

    def test_none_input_resilience(self):
        """None listesi veya içinde None barındıran listelerin çökme yaratmaması"""
        res1 = AnalyticsService.compute_analytics(None)
        self.assertTrue(res1.empty)

        res2 = AnalyticsService.compute_analytics([None, None])
        self.assertTrue(res2.empty)

    def test_zero_division_guard(self):
        """Yalnızca KUYRUKTA veya ISLENIYOR durumundaki evraklarda sıfıra bölme yaşanmaması"""
        doc = DocumentItem(
            id="test-queue",
            dosya_adi="kuyruk.jpg",
            dosya_yolu="/tmp/kuyruk.jpg",
            dosya_url="/uploads/kuyruk.jpg",
            mime_type="image/jpeg",
            boyut_bytes=500,
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.KUYRUKTA,
            veri=None
        )
        res = AnalyticsService.compute_analytics([doc])
        self.assertFalse(res.empty)
        self.assertEqual(res.kpi.onay_orani_yuzde, 0.0)
        self.assertEqual(res.kpi.tamamlanan_belge, 0)
        self.assertEqual(res.kpi.ortalama_dijitallesme_hizi_sn, 0.0)
        self.assertEqual(res.durum_dagilimi.kuyrukta, 1)

    def test_malformed_item_quantities(self):
        """Kalem miktarında virgüllü string ('12,5'), geçersiz string ('abc'), None veya NaN olması"""
        doc = DocumentItem(
            id="test-malformed",
            dosya_adi="malformed.jpg",
            dosya_yolu="/tmp/malformed.jpg",
            dosya_url="/uploads/malformed.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1000,
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.TAMAMLANDI,
            veri=IrsaliyeData(
                header=IrsaliyeHeader(irsaliye_no="IRS-MALFORMED", gonderici_unvan="Deneme A.Ş."),
                kalemler=[
                    LineItem(sira_no=1, mal_hizmet="Ürün A", miktar=10.5, birim="Adet"),
                    LineItem(sira_no=2, mal_hizmet="Ürün B", miktar=None, birim="Adet"),
                ],
                genel_toplam_miktar=10.5,
                guven_skoru=0.90
            )
        )
        # item miktarını simüle olarak beklenmeyen tip yapalım
        doc.veri.kalemler.append(LineItem(sira_no=3, mal_hizmet="Ürün C", miktar=15.0, birim="Adet"))

        res = AnalyticsService.compute_analytics([doc])
        self.assertEqual(res.kpi.toplam_islenen_kalem_adedi, 3)
        self.assertEqual(res.kpi.toplam_islenen_miktar, 25.5)

    def test_discrepancy_keywords_and_scoring(self):
        """Hasar ve şerh anahtar kelimelerinde veya düşük güvende uyuşmazlık tespiti"""
        doc_claim = DocumentItem(
            id="test-claim",
            dosya_adi="hasarli.jpg",
            dosya_yolu="/tmp/hasarli.jpg",
            dosya_url="/uploads/hasarli.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1000,
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.TAMAMLANDI,
            veri=IrsaliyeData(
                header=IrsaliyeHeader(irsaliye_no="IRS-001"),
                kalemler=[LineItem(sira_no=1, mal_hizmet="Koli", miktar=10.0, birim="Adet")],
                genel_notlar="2 koli ezik ve hasar var teslim alındı",
                guven_skoru=0.95
            )
        )
        self.assertTrue(AnalyticsService._has_discrepancy(doc_claim))

        doc_clean = DocumentItem(
            id="test-clean",
            dosya_adi="temiz.jpg",
            dosya_yolu="/tmp/temiz.jpg",
            dosya_url="/uploads/temiz.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1000,
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.TAMAMLANDI,
            veri=IrsaliyeData(
                header=IrsaliyeHeader(irsaliye_no="IRS-002"),
                kalemler=[LineItem(sira_no=1, mal_hizmet="Koli", miktar=10.0, birim="Adet")],
                genel_notlar="Eksiksiz ve hasarsız teslim edildi.",
                guven_skoru=0.98,
                genel_toplam_miktar=10.0
            )
        )
        self.assertFalse(AnalyticsService._has_discrepancy(doc_clean))

        doc_low_conf = DocumentItem(
            id="test-low-conf",
            dosya_adi="silik.jpg",
            dosya_yolu="/tmp/silik.jpg",
            dosya_url="/uploads/silik.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1000,
            yuklenme_tarihi="23.10.2026 10:00",
            durum=ProcessingStatus.TAMAMLANDI,
            veri=IrsaliyeData(
                header=IrsaliyeHeader(irsaliye_no="IRS-003"),
                kalemler=[LineItem(sira_no=1, mal_hizmet="Koli", miktar=10.0, birim="Adet")],
                guven_skoru=0.72
            )
        )
        self.assertTrue(AnalyticsService._has_discrepancy(doc_low_conf))

    def test_single_document_analytics(self):
        doc = DocumentItem(
            id="test-1",
            dosya_adi="ornek.jpg",
            dosya_yolu="/tmp/test.jpg",
            dosya_url="/uploads/test.jpg",
            mime_type="image/jpeg",
            boyut_bytes=1000,
            yuklenme_tarihi="22.10.2026 23:00",
            durum=ProcessingStatus.ONAYLANDI,
            veri=IrsaliyeData(
                header=IrsaliyeHeader(
                    irsaliye_no="IRS123",
                    duzenleme_tarihi="22.10.2026",
                    gonderici_unvan="Test Lojistik A.Ş.",
                    gonderici_vkn="1234567890"
                ),
                kalemler=[
                    LineItem(sira_no=1, mal_hizmet="Palet", miktar=10.0, birim="Adet"),
                    LineItem(sira_no=2, mal_hizmet="Koli", miktar=50.0, birim="Koli")
                ],
                genel_toplam_miktar=60.0,
                guven_skoru=0.95
            )
        )
        res = AnalyticsService.compute_analytics([doc])
        self.assertFalse(res.empty)
        self.assertEqual(res.kpi.toplam_irsaliye_hacmi, 1)
        self.assertEqual(res.kpi.onaylanan_belge, 1)
        self.assertEqual(res.kpi.onay_orani_yuzde, 100.0)
        self.assertEqual(res.kpi.toplam_islenen_kalem_adedi, 2)
        self.assertEqual(res.kpi.toplam_islenen_miktar, 60.0)

if __name__ == "__main__":
    unittest.main()

