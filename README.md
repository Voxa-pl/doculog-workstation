# Lojistik Evrak & İrsaliye Ayrıştırma İş İstasyonu
### Logistics Document Intelligence Workstation (Gemini 3.8 Flash)

Türkiye ambar ve lojistik sektöründe şoförlerin teslimat sonrası WhatsApp üzerinden gönderdiği yüzlerce buruşuk, eğri veya el yazılı sevk irsaliyesini tek ekranda inceleyip, **Gemini 3.8 Flash Vision** modeliyle anında yapılandırılmış JSON verilerine dönüştüren ve kurumsal **Excel (.xlsx)** tablolarına aktaran 3 sütunlu masaüstü iş istasyonu.

---

## 🖥️ 3 Sütunlu Masaüstü Bölünmüş Ekran (Split-Screen) Mimarisi

1. **Sol Sütun (Evrak Kuyruğu & Sürükle-Bırak):**
   - Şoförlerden gelen fotoğrafları toplu sürükleyip bırakma (Drag & Drop).
   - Otomatik küçük resim (Thumbnail) üretimi ile 60 FPS akıcı liste.
   - İrsaliye durum rozetleri (`Kuyrukta`, `Ayrıştırıldı`, `Onaylandı`, `Hata`).
   - Tek tıkla "Tümünü Ayrıştır" ve arama/filtreleme.

2. **Orta Sütun (Net Belge Görüntüleyici):**
   - Fare tekerleği ile serbest yakınlaştırma/uzaklaştırma (Zoom in / out / fit).
   - Fare sürüklemesi ile serbest kaydırma (Pan).
   - **90° Döndürme Araçları:** WhatsApp'tan yan veya baş aşağı gelen belgeleri tek tıkla düzeltme ve fiziksel olarak kaydetme.
   - **Kontrast Artırma:** Buruşuk, gölgeli veya karanlık fotoğrafları rahat okumak için görüntü filtreleme.

3. **Sağ Sütun (Tıkla-Düzenle Form ve Excel Izgarası):**
   - **İrsaliye Başlık Bilgileri:** İrsaliye No, Düzenleme Tarihi, Fiili Sevk Tarihi/Saati, Gönderici/Alıcı VKN ve adresleri, Taşıyıcı Ambar, Plaka, Şoför TCKN.
   - **Ürün Kalemleri Tablosu:** Sıra No, Mal/Hizmet Cinsi, Miktar, Birim, Notlar.
   - Hücreye tıkla-düzenle (Inline editing) ve yeni satır ekleme/silme.
   - Otomatik miktar toplamı.
   - El yazısı şoför/ambar teslim kaşe ve imza notları alanı.
   - **"Onayla & Sonraki"** iş akışı ve **Tekil/Toplu Excel (.xlsx)** dışa aktarımı.

---

## 🚀 Hızlı Başlangıç ve Çalıştırma

### 1. Masaüstü Başlatıcı ile (Önerilen)
Kök dizindeki **`run_workstation.bat`** dosyasını çift tıklayarak çalıştırın:
- İş istasyonu tek portta (Port: 8000) FastAPI üzerinden hazır React arayüzü ile başlar.
- Microsoft Edge veya Chrome uygulama penceresinde (`--app`) tam ekran masaüstü görünümünde otomatik açılır.
- Adres: `http://127.0.0.1:8000`

### 2. Konsoldan Başlatma
```powershell
cd s:\irsaliye-workstation\backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Tarayıcınızda açın:
- **İş İstasyonu Masaüstü Arayüzü:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **API Swagger Dokümantasyonu:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Geliştirici Modunda Çalıştırma (İsteğe Bağlı)
Frontend kaynak kodlarını anlık hot-reload ile geliştirmek isterseniz:
```powershell
cd s:\irsaliye-workstation\frontend
npm run dev
```
Geliştirici Arayüzü: `http://127.0.0.1:5173`
