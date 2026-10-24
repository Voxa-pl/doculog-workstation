# DOCULOG WORKSTATION — MASAÜSTÜ (DESKTOP) GELİŞTİRME VE KURUMSAL B2B YOL HARİTASI
**Belge Kodu:** STRAT-2026-DESKTOP-01  
**Hedef Kitle:** Masaüstü Geliştirme Zirvesi, Organizatör Ajanlar Heyeti, Çözüm Mimarları  
**Yazar:** Kıdemli Kurumsal Stratejist & Çözüm Mimarı (Enterprise B2B Logistics Strategist)  
**Tarih:** 25 Ekim 2026  

---

## 1. YÜRÜTME ÖZETİ: MASAÜSTÜ WORKSTATION'IN TİCARİ VE OPERASYONEL ROLÜ

Lojistik operasyonlarında mobil arayüz sahada mal kabul yapan şoför veya rampa işçisi için ne kadar kritikse; **Masaüstü İş İstasyonu (Desktop Workstation)** da rampa amiri, faturalama şefi ve lojistik operasyon direktörü için bir o kadar vazgeçilmez bir **"Komuta Kontrol Merkezi"**dir.

1440p ve 4K endüstriyel monitörlerde çalışan bir veri giriş uzmanı veya ambar şefi, günde 200 ila 600 arasında irsaliyenin kabulünü yönetir. Burada her saniye, her klavye vuruşu (keystroke) ve her mutabakat kararı doğrudan operasyon maliyetini belirler. 

10.000$ - 25.000$+ değerinde bir kurumsal satış kapatabilmek için masaüstü istasyonunun "öğrenci projesi veya prototip" algısından tamamen arındırılması, endüstri standardı ERP entegrasyonu ve kurumsal mutabakat derinliğine kavuşturulması şarttır.

---

## 2. AMBAR YÖNETİCİSİ VE FATURALAMA UZMANI İÇİN EN DEĞERLİ MASAÜSTÜ YETENEKLERİ

### 2.1 1440p Monitör Ergonomisi ve Kesintisiz Akış (Keystroke-Driven Speed)
- **Problem:** Operatörün her evrakta fareyi arayıp butonlara tıklaması, günde binlerce gereksiz mouse hareketi ve yavaşlama demektir.
- **Çözüm:** Klavye tabanlı seri operasyon modu:
  - `Ctrl + Enter`: Onayla ve sıradaki belgeye geç.
  - `Ctrl + K`: Smart Quarantine'e (Karantinaya) gönder.
  - `Alt + C`: Logo Tiger / ERP panoya kopyala.
  - `Tab / Shift+Tab`: Tablo satırları arasında düzenleme odağı.
- **Bölünmüş Ekran (Split-View) Zanaatkarlığı:** 
  - Sol taraftaki yüksek çözünürlüklü belge önizlemesi ile sağ taraftaki form alanları senkronize olmalıdır. Operatör sağdaki tabloda "Kalem 3"e odaklandığında, sol taraftaki görsel otomatik olarak o kalemin bulunduğu koordinata kaymalı ve zoom yapmalıdır (`Auto-Focus Bounding Box`).

### 2.2 Kısmi Mal Kabul (Hasarlı / Eksik / Sağlam Miktar) — Masanın En Değerli Özelliği
- **Operasyonel Gerçek:** İrsaliyede 100 koli yazar. Araç açıldığında 92 koli sağlamdır, 5 koli ıslak/yırtıktır, 3 koli hiç çıkmamıştır.
- **Mevcut Açık:** Veri modelinde tek bir `miktar` alanı olduğunda operatör ikilemde kalır: 92 yazarsa irsaliye dip toplam mutabakatı çöker (evrakta 100 yazmaktadır). 100 yazarsa depoya hasarlı/olmayan mal girmiş olur, sayım farkı ve hukuki ihtilaf doğar.
- **Kurumsal Model:** Her kalem için 4'lü ayrıştırma:
  1. `irsaliye_miktar` (Evrakta beyan edilen: 100)
  2. `kabul_miktar` (Depoya fiilen sağlam giren: 92)
  3. `hasarli_miktar` (Hasarlı teslim alınan/bloke: 5)
  4. `eksik_miktar` (Araçtan çıkmayan tedarikçi firesi: 3)
  5. `ihtirazi_kayit_notu` ("5 koli ıslak, 3 koli eksik teslim alındı")
- **Ticari Getiri:** Bu ayrım tek tıkla ERP'ye aktarıldığında SAP'de `101 (Sağlam Giriş)` ve `103/122 (Bloke Stok/İade)` hareket kodları otomatik oluşur. Alıcı firma anında tedarikçiye **İade Faturası / Hasar Tutanağı** keser. Ayda onbinlerce liralık cari ihtilaf ve stok kaybı engellenir.

### 2.3 Gerçekçi 3-Way PO (Satınalma Siparişi) Mutabakat Modeli
- **Mevcut Simülasyon Riski:** Mevcut kod rastgele `PO-2026-XXXX` üretip miktar eşitlemektedir. Bir Borusan veya Vestel yöneticisine canlı demoda bu gösterilirse güven anında sıfırlanır.
- **Kurumsal Mimari:**
  1. **Açık Sipariş Havuzu Entegrasyonu:** Müşterinin ERP'sinden aktarılan günlük açık satınalma siparişleri tablosu (`POST /api/erp/open-orders`).
  2. **Tolerans Algoritması:** Gıda ve dökme yükte ±%5, sanayi parçalarında %0 tolerans kontrolü.
  3. **Sapma (Discrepancy) Raporu:** Fazla sevk (Overdelivery), eksik sevk (Underdelivery) veya fiyat uyuşmazlığında otomatik kırmızı uyarı ve ambar şefine karar yetkisi ("Tolerans Dahilinde Kabul Et" / "Reddet").

---

## 3. 10.000$ - 25.000$+ KURUMSAL SATIŞ İÇİN ÖNCELİKLİ MASAÜSTÜ İYİLEŞTİRMELERİ

1. **Çift Yönlü Görsel-Veri Eşleme (Bounding Box Highlighting):**  
   Kalem tablosundaki bir satıra tıklandığında belgedeki taranan alanın yeşil kutu içine alınması. Kofax, ABBYY gibi global kurumsal yazılımların standardıdır.
2. **Toplu İşlemler Araç Çubuğu (Batch Multi-Select Bar):**  
   Kuyruktaki 30 onaylı evrak seçilerek tek tıkla "Toplu Logo XML İndir", "Toplu U-ETDS Bakanlık Bildirimi Yap", "Toplu Excel Raporu Al".
3. **Değişiklik Günlüğü (Audit Trail) ve Operatör İmzası:**  
   Hangi operatörün hangi alanı, ne zaman ve hangi gerekçeyle değiştirdiğinin loglanması (Vergi müfettişleri ve iç denetim için vazgeçilmez gereksinim).
4. **Çoklu Şube ve Ambar Seçimi (Multi-Warehouse Header):**  
   Masaüstü başlığında "Gebze DC - Mal Kabul Rampası 3" şeklinde tesis/rampa bağlamının seçilebilmesi.

---

## 4. API VE GÖRSEL OPTİK OKUMA MOTORU DENETİMİ İÇİN KRİTİK KRİTERLER

En son aşamada yapılacak optik okuma motoru denetiminde şu lojistik gerçekleri test edilmelidir:

1. **Termal ve Silik Yazıcı Dayanıklılığı:**  
   Güneşte solmuş veya matris yazıcı iğnesi eksik basmış irsaliyelerde `0` ile `8`, `1` ile `7` ayrımı; Türkçe karakter (`I/İ`, `O/Ö`, `S/Ş`) kod bozulmalarının önlenmesi.
2. **Çok Satırlı Malzeme Açıklamaları (Multi-line Items):**  
   3 satıra sarkan ürün isimlerinin miktar sütunuyla hizasının bozulmaması.
3. **El Yazısı Şerhlerin Tespiti:**  
   Tükenmez kalemle yazılmış "Hasarlı", "Eksik" şerhlerinin ve şoför kaşelerinin ayrı bir text alanı olarak yakalanması.
4. **Buruşuk Kağıtta QR Kod Çözümü:**  
   Perspektif eğriliği (skew/warp) olan kağıtlarda GİB karekodunun OpenCV deskew adımıyla kurtarılması.
5. **Zero Hallucination (Sıfır Halüsinasyon) Koruması:**  
   Kalemler toplamı ile dip toplam uyuşmadığında modelin asla rakam uydurmaması, mutabakatın kırmızıya düşerek insan kontrolüne zorlanması.
