import os
import sys
import json
import random
import requests
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

INVOICES_DIR = Path("/root/LojistikGirisimleri/doculog/test_data/invoices")
NON_INVOICES_DIR = Path("/root/LojistikGirisimleri/doculog/test_data/non_invoices")
INVOICES_DIR.mkdir(parents=True, exist_ok=True)
NON_INVOICES_DIR.mkdir(parents=True, exist_ok=True)

# -------------------------------------------------------------
# 1. 15 ADET İRSALİYE DIŞI NESNE (TELEFON, ŞİŞE, KAHVE vb.)
# -------------------------------------------------------------
NON_INVOICE_OBJECTS = [
    {
        "name": "01_akilli_telefon_iphone.jpg",
        "label": "Masa Üzerinde Akıllı Telefon",
        "url": "https://images.pexels.com/photos/699122/pexels-photo-699122.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/160/800/1000",
        "color": (30, 30, 35),
        "desc": "Akıllı Telefon (iPhone / Cihaz)"
    },
    {
        "name": "02_plastik_su_sisesi.jpg",
        "label": "Plastik Su Şişesi 0.5L",
        "url": "https://images.pexels.com/photos/1000084/pexels-photo-1000084.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/400/800/1000",
        "color": (50, 120, 180),
        "desc": "Pet Su Şişesi"
    },
    {
        "name": "03_cam_su_sisesi.jpg",
        "label": "Masa Üstü Cam Su Şişesi",
        "url": "https://images.pexels.com/photos/1346086/pexels-photo-1346086.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/401/800/1000",
        "color": (40, 90, 110),
        "desc": "Cam Şişe"
    },
    {
        "name": "04_seramik_kahve_kupasi.jpg",
        "label": "Sıcak Kahve Fincanı & Kupa",
        "url": "https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/30/800/1000",
        "color": (80, 50, 35),
        "desc": "Kahve Kupası"
    },
    {
        "name": "05_dizustu_bilgisayar_laptop.jpg",
        "label": "Çalışma Masasında Dizüstü Bilgisayar",
        "url": "https://images.pexels.com/photos/18105/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/0/800/1000",
        "color": (45, 50, 55),
        "desc": "Laptop / Bilgisayar"
    },
    {
        "name": "06_kablosuz_fare_mouse.jpg",
        "label": "Ofis Bilgisayar Faresi",
        "url": "https://images.pexels.com/photos/2115256/pexels-photo-2115256.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/2/800/1000",
        "color": (25, 25, 28),
        "desc": "Kablosuz Mouse"
    },
    {
        "name": "07_ofis_koltugu_sandalye.jpg",
        "label": "Ergonomik Ofis Çalışma Koltuğu",
        "url": "https://images.pexels.com/photos/1957478/pexels-photo-1957478.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/60/800/1000",
        "color": (35, 40, 45),
        "desc": "Ofis Koltuğu"
    },
    {
        "name": "08_gunes_gozlugu.jpg",
        "label": "Siyah Güneş Gözlüğü",
        "url": "https://images.pexels.com/photos/701877/pexels-photo-701877.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/26/800/1000",
        "color": (20, 20, 20),
        "desc": "Güneş Gözlüğü"
    },
    {
        "name": "09_kulak_ustu_kulaklik.jpg",
        "label": "Kablosuz Müzik Kulaklığı",
        "url": "https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/250/800/1000",
        "color": (15, 15, 20),
        "desc": "Kulaklık (Headphone)"
    },
    {
        "name": "10_kol_saati_klasik.jpg",
        "label": "Deri Kordonlu Erkek Kol Saati",
        "url": "https://images.pexels.com/photos/277390/pexels-photo-277390.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/175/800/1000",
        "color": (60, 45, 30),
        "desc": "Kol Saati"
    },
    {
        "name": "11_sakside_cicek_bitki.jpg",
        "label": "Masa Üstü Sukulent / Saksı Bitkisi",
        "url": "https://images.pexels.com/photos/1005058/pexels-photo-1005058.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/152/800/1000",
        "color": (30, 80, 45),
        "desc": "Saksı Çiçeği"
    },
    {
        "name": "12_sirt_cantasi.jpg",
        "label": "Günlük Seyahat Sırt Çantası",
        "url": "https://images.pexels.com/photos/2905238/pexels-photo-2905238.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/180/800/1000",
        "color": (40, 50, 70),
        "desc": "Sırt Çantası"
    },
    {
        "name": "13_otomobil_anahtari.jpg",
        "label": "Araç Uzaktan Kumanda Anahtarı",
        "url": "https://images.pexels.com/photos/3802510/pexels-photo-3802510.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/111/800/1000",
        "color": (25, 25, 25),
        "desc": "Araba Anahtarı"
    },
    {
        "name": "14_masa_lambasi.jpg",
        "label": "Modern Ayarlanabilir Masa Lambası",
        "url": "https://images.pexels.com/photos/1112598/pexels-photo-1112598.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/145/800/1000",
        "color": (200, 180, 120),
        "desc": "Masa Lambası"
    },
    {
        "name": "15_cizgili_bos_defter_ve_kalem.jpg",
        "label": "Yazısız Boş Not Defteri ve Tükenmez Kalem",
        "url": "https://images.pexels.com/photos/733856/pexels-photo-733856.jpeg?auto=compress&cs=tinysrgb&w=800",
        "backup_picsum": "https://picsum.photos/id/24/800/1000",
        "color": (240, 235, 220),
        "desc": "Boş Defter ve Kalem"
    }
]

def download_or_generate_non_invoice_images():
    print("--- 15 Adet İrsaliye Dışı Nesne Görseli İndiriliyor / Üretiliyor ---")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    for item in NON_INVOICE_OBJECTS:
        file_path = NON_INVOICES_DIR / item["name"]
        downloaded = False

        # Önce picsum doğrudan görsel deneriz (en hızlı ve güvenilir)
        for target_url in [item["backup_picsum"], item["url"]]:
            try:
                res = requests.get(target_url, headers=headers, timeout=8)
                if res.status_code == 200 and len(res.content) > 5000 and res.content[:4] in (b'\xff\xd8\xff\xe0', b'\xff\xd8\xff\xe1', b'\x89PNG', b'RIFF'):
                    with open(file_path, "wb") as f:
                        f.write(res.content)
                    print(f"[OK] İndirildi: {item['name']} ({len(res.content)//1024} KB)")
                    downloaded = True
                    break
            except Exception as e:
                continue

        # Eğer network erişilemezse yüksek kaliteli foto-grafik nesne üret
        if not downloaded:
            img = Image.new("RGB", (800, 1000), item["color"])
            draw = ImageDraw.Draw(img)
            # Kart / Nesne çerçevesi
            draw.rectangle([60, 60, 740, 940], outline=(255, 255, 255), width=4)
            # Nesne etiketi ve uyarısı
            draw.text((80, 120), item["label"], fill=(255, 255, 255))
            draw.text((80, 160), f"Nesne Türü: {item['desc']}", fill=(220, 220, 220))
            draw.text((80, 220), "BU BIR SEVK IRSALIYESI DEGILDIR.", fill=(255, 120, 120))
            draw.text((80, 260), "Optik Kontrol Test Nesnesi (Kamera Çekimi)", fill=(180, 180, 180))
            img.save(file_path, "JPEG", quality=90)
            print(f"[GEN] Üretildi: {item['name']}")


# -------------------------------------------------------------
# 2. 15 ADET GERÇEKÇİ RESMİ TÜRKİYE SEVK İRSALİYESİ (PILLOW)
# -------------------------------------------------------------
INVOICE_TEMPLATES = [
    {
        "id": "EKL2024000012490",
        "firma": "EKOL LOJİSTİK A.Ş.",
        "gonderici_vkn": "3340058912",
        "gonderici_vd": "Büyük Mükellefler",
        "gonderici_adres": "Hadımköy Yolu Cad. No:45 Çatalca / İSTANBUL",
        "alici": "TOFAŞ TÜRK OTOMOBİL FABRİKASI A.Ş.",
        "alici_vkn": "8460012948",
        "alici_vd": "Ertuğrulgazi",
        "teslim_adres": "Demirtaş Organize Sanayi Bölgesi Nilüfer / BURSA",
        "plaka": "34 EKL 892 / 34 EKL 893",
        "sofor": "Ahmet Yılmaz (T.C. 28491028472)",
        "tarih": "22.10.2024",
        "saat": "09:30",
        "kalemler": [
            ("1", "Otomotiv Ön Fren Diski 300mm", "120", "Adet", "Euro Palet No:1-4"),
            ("2", "Hava ve Yağ Filtre Kiti Seti", "450", "Takım", "A Tipi Koliler"),
            ("3", "Arka Amortisör Spiral Yay", "80", "Çift", "Metal Kasa No:2"),
            ("4", "Poliüretan Salıncak Burcu", "600", "Adet", "Karton Kutu")
        ],
        "toplam": "1250 Adet",
        "not": "Sevkiyat irsaliye muhteviyatına uygun eksiksiz teslim alınmıştır."
    },
    {
        "id": "BRS2024000098410",
        "firma": "BORUSAN LOJİSTİK DAĞITIM DEPOLAMA A.Ş.",
        "gonderici_vkn": "1800049211",
        "gonderici_vd": "Marmara Kurumlar",
        "gonderici_adres": "Pürtelaş Hasan Efendi Mah. Meclisi Mebusan Cad. Salıpazarı / İSTANBUL",
        "alici": "ÇİMSAN ÇELİK KONSTRÜKSİYON SAN. TİC. LTD. ŞTİ.",
        "alici_vkn": "2310098412",
        "alici_vd": "Ostim",
        "teslim_adres": "İvedik Organize Sanayi 1468. Cadde No:22 Yenimahalle / ANKARA",
        "plaka": "41 BRS 550 / 41 BRS 551",
        "sofor": "Mustafa Demir (T.C. 49102837190)",
        "tarih": "21.10.2024",
        "saat": "14:15",
        "kalemler": [
            ("1", "Sıcak Haddelenmiş Rulo Sac 2.5mm x 1250mm", "24.5", "Ton", "Rulo No: R-8841"),
            ("2", "Kare Profil 40x40x3mm Boy:6000mm", "400", "Boy", "Bağ No: 12-14"),
            ("3", "NPU 120 Yapısal Çelik Profil Boy:12m", "60", "Adet", "Bağ No: 5"),
            ("4", "Galvanizli Dikişli Çelik Boru 2 inç", "180", "Metre", "Açık Kasa Nakli")
        ],
        "toplam": "24.5 Ton + 640 Parça",
        "not": "Ağır tonajlı sanayi sevkiyatı. Vinç ile indirilecektir."
    },
    {
        "id": "HRZ2024000045120",
        "firma": "HOROZ LOJİSTİK KARGO TİC. A.Ş.",
        "gonderici_vkn": "4630071290",
        "gonderici_vd": "Güneşli",
        "gonderici_adres": "Mahmutbey Mah. Taşocağı Cad. No:19 Bağcılar / İSTANBUL",
        "alici": "TEKNOSA İÇ VE DIŞ TİCARET A.Ş. GEBZE DEPO",
        "alici_vkn": "8360049811",
        "alici_vd": "Anadolu Kurumlar",
        "teslim_adres": "Balçık Mah. Pelitli Yolu No:88 Gebze / KOCAELİ",
        "plaka": "34 HRZ 119",
        "sofor": "Mehmet Kaya (T.C. 19284710928)",
        "tarih": "23.10.2024",
        "saat": "11:00",
        "kalemler": [
            ("1", "65 inç 4K Ultra HD Android TV", "45", "Koli", "Seri No Takip Listeli"),
            ("2", "A+++ Inverter 12000 BTU Duvar Tipi Klima", "30", "Adet", "Dış + İç Ünite"),
            ("3", "No-Frost Çift Kapılı Buzdolabı 480L", "18", "Adet", "Dik Taşıma Zorunlu"),
            ("4", "9 Kg 1400 Devir Çamaşır Makinesi", "24", "Adet", "Paletli Koli")
        ],
        "toplam": "117 Koli / Parça",
        "not": "Kırılabilir hassas elektronik yük. Ambar kabul kaşesi mevcuttur."
    },
    {
        "id": "NTL2024000088912",
        "firma": "NETLOG LOJİSTİK HİZMETLERİ A.Ş.",
        "gonderici_vkn": "6310329188",
        "gonderici_vd": "Avcılar",
        "gonderici_adres": "Ambarlı Liman Tesisleri Arkası Kumcular Yolu No:14 Avcılar / İSTANBUL",
        "alici": "MİGROS TİCARET A.Ş. ŞEKERPINAR DAĞITIM MERKEZİ",
        "alici_vkn": "6220084511",
        "alici_vd": "Kozyatağı",
        "teslim_adres": "Şekerpınar Mah. Fevzi Çakmak Cad. No:12 Çayırova / KOCAELİ",
        "plaka": "34 NTL 402 / 34 FRIGO 01",
        "sofor": "Serkan Özkan (T.C. 30192847192)",
        "tarih": "23.10.2024",
        "saat": "06:45",
        "kalemler": [
            ("1", "Dondurulmuş Dana Kıyma (-18C)", "1200", "Kg", "60 Koli x 20 Kg"),
            ("2", "Geleneksel Tereyağı 1 Kg Vakumlu Paket", "800", "Kg", "40 Koli"),
            ("3", "Taze Kaşar Peyniri Blok 2 Kg", "600", "Kg", "30 Koli"),
            ("4", "Kangal Sucuk Vakumlu Özel Ambalaj", "350", "Kg", "25 Koli")
        ],
        "toplam": "2950 Kg / 155 Koli",
        "not": "Soğuk zincir taşımadır. Araç içi sıcaklık: -18.4 C derece teslim edilmiştir."
    },
    {
        "id": "MRS2024000033190",
        "firma": "MARS HAVA VE DENİZ KARGO TAŞIMACILIĞI A.Ş.",
        "gonderici_vkn": "6120054812",
        "gonderici_vd": "Güneşli",
        "gonderici_adres": "Güneşli Merkez Mah. Yalçın Koreş Cad. No:22 Bağcılar / İSTANBUL",
        "alici": "LC WAIKIKI MAĞAZACILIK HİZMETLERİ TİC. A.Ş.",
        "alici_vkn": "8360098415",
        "alici_vd": "Halkalı",
        "teslim_adres": "Yakuplu Mah. Hürriyet Bulvarı No:14 Beylikdüzü / İSTANBUL",
        "plaka": "34 MARS 99",
        "sofor": "Osman Şahin (T.C. 59182740192)",
        "tarih": "22.10.2024",
        "saat": "16:20",
        "kalemler": [
            ("1", "Erkek Pamuklu Polo Yaka T-Shirt Koli", "140", "Koli", "Koli Başı 36 Adet"),
            ("2", "Kadın Slim Fit Denim Pantolon Koli", "90", "Koli", "Koli Başı 24 Adet"),
            ("3", "Çocuk Polar Sweatshirt Koli", "80", "Koli", "Koli Başı 40 Adet"),
            ("4", "Organik Pamuk İplik Bobini 30/1", "50", "Çuval", "Çuval Başı 25 Kg")
        ],
        "toplam": "310 Koli / 1250 Kg İplik",
        "not": "İhracat fazlası konsinye mağaza dağıtım sevkiyatıdır."
    },
    {
        "id": "STS2024000076123",
        "firma": "SÜTAŞ SÜT ÜRÜNLERİ A.Ş.",
        "gonderici_vkn": "7840019283",
        "gonderici_vd": "Karacabey",
        "gonderici_adres": "Uluabat Mah. Sütaş Tesisleri Karacabey / BURSA",
        "alici": "BİM BİRLEŞİK MAĞAZALAR A.Ş. SAMANDIRA DEPO",
        "alici_vkn": "1750051289",
        "alici_vd": "Sultanbeyli",
        "teslim_adres": "Eyüp Sultan Mah. İbni Sina Cad. Samandıra / İSTANBUL",
        "plaka": "16 SUT 01 / 16 SUT 02",
        "sofor": "Murat Aydın (T.C. 10293847561)",
        "tarih": "23.10.2024",
        "saat": "05:30",
        "kalemler": [
            ("1", "Tam Yağlı Pastörize Süt 1L Kutu", "2400", "Adet", "200 Koli x 12"),
            ("2", "Doğal Süzme Yoğurt 900g Kova", "720", "Adet", "120 Koli x 6"),
            ("3", "Klasik Beyaz Peynir 500g Vakumlu", "960", "Adet", "80 Koli x 12"),
            ("4", "Ayran 200ml Tombul Şişe", "3600", "Adet", "180 Koli x 20")
        ],
        "toplam": "7680 Adet / 580 Koli",
        "not": "+4 C derecede Frigorifik araç ile teslim edilmiştir."
    },
    {
        "id": "ETI2024000055198",
        "firma": "ETİ GIDA SANAYİ VE TİCARET A.Ş.",
        "gonderici_vkn": "3810029381",
        "gonderici_vd": "Eskişehir Vergi Dairesi",
        "gonderici_adres": "Organize Sanayi Bölgesi 11. Cadde No:8 Odunpazarı / ESKİŞEHİR",
        "alici": "A101 YENİ MAĞAZACILIK A.Ş. ANKARA LOJİSTİK MERKEZİ",
        "alici_vkn": "0010541982",
        "alici_vd": "Sincan",
        "teslim_adres": "Başkent OSB 19. Cadde No:4 Temelli / ANKARA",
        "plaka": "26 ETI 78",
        "sofor": "Ali Çetin (T.C. 48192038471)",
        "tarih": "22.10.2024",
        "saat": "13:40",
        "kalemler": [
            ("1", "Eti Negro Kakaolu Kremalı Bisküvi 100g", "3600", "Adet", "150 Koli x 24"),
            ("2", "Eti Browni İntense Çikolatalı Kek 50g", "4800", "Adet", "200 Koli x 24"),
            ("3", "Eti Crax Acılı Baharatlı Çubuk Kraker", "2400", "Adet", "100 Koli x 24"),
            ("4", "Eti Lifalif Yulaf Ezmesi 500g", "1200", "Adet", "100 Koli x 12")
        ],
        "toplam": "12000 Adet / 550 Koli",
        "not": "Kuru gıda sevkiyatıdır. Isı ve nemden korunarak teslim edilmiştir."
    },
    {
        "id": "VST2024000099182",
        "firma": "VESTEL BEYAZ EŞYA SANAYİ VE TİC. A.Ş.",
        "gonderici_vkn": "9250019284",
        "gonderici_vd": "Manisa Kurumlar",
        "gonderici_adres": "Organize Sanayi Bölgesi Vestel City Yunusemre / MANİSA",
        "alici": "VATAN BİLGİSAYAR SAN. VE TİC. A.Ş.",
        "alici_vkn": "9240058192",
        "alici_vd": "Güneşli",
        "teslim_adres": "Hadımköy Yolu Cad. No:63 Kıraç / İSTANBUL",
        "plaka": "45 VST 202",
        "sofor": "İsmail Karaca (T.C. 39182049182)",
        "tarih": "23.10.2024",
        "saat": "10:15",
        "kalemler": [
            ("1", "Vestel 55 inç QLED Smart TV", "60", "Adet", "Barkod: 86974129845"),
            ("2", "Vestel 4 Programlı Solo Bulaşık Makinesi", "35", "Adet", "Paletli Koli"),
            ("3", "Vestel Retro Bordo Mikrodalga Fırın", "80", "Koli", "Koli İçi 1 Adet"),
            ("4", "Vestel V-Press Buharlı Jeneratörlü Ütü", "120", "Adet", "Karton Kutu")
        ],
        "toplam": "295 Parça / Paletli",
        "not": "Fabrika orijinal bandrollü çıkışıdır. Hasarsız teslim alınmıştır."
    },
    {
        "id": "KAS2024000014892",
        "firma": "KASTAMONU ENTEGRE AĞAÇ SANAYİ VE TİC. A.Ş.",
        "gonderici_vkn": "5280018491",
        "gonderici_vd": "Üsküdar",
        "gonderici_adres": "Altunizade Mah. Kısıklı Cad. No:33 Üsküdar / İSTANBUL",
        "alici": "MODOKO MOBİLYACILAR SİTESİ - ÇAĞDAŞ DEKOR LTD.",
        "alici_vkn": "2190048192",
        "alici_vd": "Ümraniye",
        "teslim_adres": "Modoko Sanayi Sitesi 4. Blok No:18 Ümraniye / İSTANBUL",
        "plaka": "37 KAS 45 / 37 KAS 46",
        "sofor": "Halil İbrahim Kurt (T.C. 19284710293)",
        "tarih": "21.10.2024",
        "saat": "15:00",
        "kalemler": [
            ("1", "MDF Lam Beyaz Gövde 18mm x 2100mm x 2800mm", "120", "Plaka", "6 Palet x 20"),
            ("2", "Laminat Parke 8mm Meşe Ağacı", "850", "m2", "340 Paket x 2.5m2"),
            ("3", "Akrilik Parlak Panel Antrasit 18mm", "40", "Plaka", "2 Palet x 20"),
            ("4", "PVC Kenar Bandı 0.80mm x 22mm Rulo", "30", "Rulo", "Rulo: 150m")
        ],
        "toplam": "160 Plaka + 850 m2 + 30 Rulo",
        "not": "Forklift ile kapalı ambar sahasına indirilmiştir."
    },
    {
        "id": "SIS2024000078129",
        "firma": "TÜRKİYE ŞİŞE VE CAM FABRİKALARI A.Ş.",
        "gonderici_vkn": "8790019284",
        "gonderici_vd": "Tuzla",
        "gonderici_adres": "İçmeler Mah. D-100 Karayolu Cad. No:44 Tuzla / İSTANBUL",
        "alici": "DİMES GIDA SANAYİ VE TİCARET A.Ş.",
        "alici_vkn": "2980049182",
        "alici_vd": "Tokat",
        "teslim_adres": "Organize Sanayi Bölgesi Dimes Tesisleri / TOKAT",
        "plaka": "34 CAM 81 / 34 CAM 82",
        "sofor": "Engin Çelik (T.C. 20194829104)",
        "tarih": "22.10.2024",
        "saat": "08:15",
        "kalemler": [
            ("1", "250ml Cam Meyve Suyu Şişesi (Crown Ağız)", "24000", "Adet", "20 Palet x 1200"),
            ("2", "1000ml Cam Şişe Twist-Off Kapak Uyumlu", "12000", "Adet", "15 Palet x 800"),
            ("3", "Vidalı Metal Kavanoz Kapağı 82mm Altın Sarısı", "36000", "Adet", "36 Koli x 1000"),
            ("4", "Taşıma Ayırıcı Karton Seperatör", "1500", "Adet", "10 Paket")
        ],
        "toplam": "72000 Parça / 35 Palet",
        "not": "Paletli şilinkli ambalaj. Kırık / çatlak kontrolü yapılmıştır."
    },
    {
        "id": "AKC2024000091820",
        "firma": "AKÇANSA ÇİMENTO SANAYİ VE TİCARET A.Ş.",
        "gonderici_vkn": "0230019284",
        "gonderici_vd": "Büyük Mükellefler",
        "gonderici_adres": "Kısıklı Cad. Sarkuysan Ak İş Merkezi No:4 Üsküdar / İSTANBUL",
        "alici": "KALYON İNŞAAT SANAYİ VE TİCARET A.Ş.",
        "alici_vkn": "4930058192",
        "alici_vd": "Zincirlikuyu",
        "teslim_adres": "Kuzey Marmara Otoyolu Şantiye Sahası Çatalca / İSTANBUL",
        "plaka": "34 AKC 901",
        "sofor": "Kemal Polat (T.C. 40192847192)",
        "tarih": "23.10.2024",
        "saat": "07:30",
        "kalemler": [
            ("1", "Portland Çimento CEM I 42.5 R (50 Kg Torba)", "540", "Torba", "27 Ton (10 Palet)"),
            ("2", "Harç Çimentosu Süper Dayanımlı", "200", "Torba", "10 Ton"),
            ("3", "Su Geçirimsizlik Harç Katkısı Sıvı 20 Kg", "50", "Bidon", "1000 Kg"),
            ("4", "Polipropilen Beton Donatı Elyafı", "40", "Koli", "Koli: 10 Kg")
        ],
        "toplam": "38 Ton / 790 Kap",
        "not": "Şantiye kantar fişi ile tartılarak teslim edilmiştir."
    },
    {
        "id": "SNP2024000062190",
        "firma": "ŞENPİLİÇ GIDA SANAYİ A.Ş.",
        "gonderici_vkn": "8030018491",
        "gonderici_vd": "Adapazarı",
        "gonderici_adres": "Güllük Mah. Sağlık Cad. No:24 Adapazarı / SAKARYA",
        "alici": "KÖFTECİ YUSUF HAZIR YEMEK TEMİZLİK CANLI HAYVAN A.Ş.",
        "alici_vkn": "5860391823",
        "alici_vd": "İznik",
        "teslim_adres": "Merkez Entegre Et İşleme Tesisleri Yenişehir / BURSA",
        "plaka": "54 SEN 18 / 54 SEN 19",
        "sofor": "Fatih Güler (T.C. 39102948192)",
        "tarih": "23.10.2024",
        "saat": "04:00",
        "kalemler": [
            ("1", "Taze Bütün Piliç Poşetli (+4C)", "3500", "Kg", "175 Plastik Kasa x 20"),
            ("2", "Piliç Bonfile Göğüs Eti Tabaklı", "1800", "Kg", "90 Plastik Kasa x 20"),
            ("3", "Piliç Kelebek Pirzola Soslu", "1200", "Kg", "60 Plastik Kasa x 20"),
            ("4", "Piliç Kasap Köfte Şarküteri Tipi", "600", "Kg", "30 Kasa")
        ],
        "toplam": "7100 Kg / 355 Kasa",
        "not": "Veteriner sağlık raporu sevk irsaliyesi ekindedir."
    },
    {
        "id": "ARS2024000084912",
        "firma": "ARAS KARGO YURT İÇİ YURT DIŞI TAŞIMACILIK A.Ş.",
        "gonderici_vkn": "0720048192",
        "gonderici_vd": "Boğaziçi Kurumlar",
        "gonderici_adres": "Rüzgarlıbahçe Mah. Yavuz Sultan Selim Cad. No:2 Beykoz / İSTANBUL",
        "alici": "HEPSİBURADA - D-MARKET ELEKTRONİK HİZMETLER A.Ş.",
        "alici_vkn": "2650179910",
        "alici_vd": "Şişli",
        "teslim_adres": "Akçaburgaz Mah. 3026. Sokak No:12 Esenyurt / İSTANBUL",
        "plaka": "34 ARS 442",
        "sofor": "Erkan Taş (T.C. 18294019283)",
        "tarih": "23.10.2024",
        "saat": "12:30",
        "kalemler": [
            ("1", "E-Ticaret Konsolide Küçük Paket Kolisi", "420", "Paket", "Desi Toplamı: 840"),
            ("2", "Elektronik Aksesuar & Kablo Kolisi", "85", "Koli", "Desi: 210"),
            ("3", "Kitap & Kırtasiye Sevkiyat Kolisi", "110", "Koli", "Ağır Koli"),
            ("4", "Kozmetik & Kişisel Bakım Özel Poşet", "250", "Poşet", "Barkodlu")
        ],
        "toplam": "865 Parça",
        "not": "Ambar transfer aktarma merkezleri arası dahili sevk irsaliyesidir."
    },
    {
        "id": "ULK2024000019284",
        "firma": "ÜLKER BİSKÜVİ SANAYİİ A.Ş.",
        "gonderici_vkn": "9150018491",
        "gonderici_vd": "Marmara Kurumlar",
        "gonderici_adres": "Kısıklı Mah. Ferah Cad. No:1 Büyük Çamlıca Üsküdar / İSTANBUL",
        "alici": "BİZİM TOPTAN SATIŞ MAĞAZALARI A.Ş. İZMİR DEPO",
        "alici_vkn": "1780049182",
        "alici_vd": "Kemalpaşa",
        "teslim_adres": "Kemalpaşa OSB 40. Sokak No:15 Kemalpaşa / İZMİR",
        "plaka": "34 ULK 01 / 34 ULK 02",
        "sofor": "Recep Yavuz (T.C. 49102948192)",
        "tarih": "22.10.2024",
        "saat": "17:00",
        "kalemler": [
            ("1", "Ülker Pötibör Bisküvi 1000g Aile Paketi", "1800", "Koli", "Koli: 10 Paket"),
            ("2", "Ülker Çikolatalı Gofret 36g Multipack", "2400", "Koli", "Koli: 36 Adet"),
            ("3", "Ülker Biskrem Kakaolu Bisküvi 150g", "1200", "Koli", "Koli: 18 Paket"),
            ("4", "Ülker Çokokrem Kakaolu Fındık Kreması 650g", "600", "Koli", "Koli: 12 Kavanoz")
        ],
        "toplam": "6000 Koli / 48 Palet",
        "not": "Paletli ambalaj. Sıcaklık ve rutubetsiz ortamda saklanmalıdır."
    },
    {
        "id": "HYT2024000049182",
        "firma": "HAYAT KİMYA SANAYİİ A.Ş.",
        "gonderici_vkn": "4600019284",
        "gonderici_vd": "Kocaeli Kurumlar",
        "gonderici_adres": "Sepetlipınar Mah. Arpalık Cad. No:16 Başiskele / KOCAELİ",
        "alici": "CARREFOURSA CARREFOUR SABANCI TİC. MERKEZİ A.Ş.",
        "alici_vkn": "2030018491",
        "alici_vd": "Kozyatağı",
        "teslim_adres": "Gebze Lojistik Merkezi Barış Mah. 1804. Sokak Gebze / KOCAELİ",
        "plaka": "41 HYT 99",
        "sofor": "Gökhan Koç (T.C. 28194019284)",
        "tarih": "23.10.2024",
        "saat": "14:45",
        "kalemler": [
            ("1", "Molfix Bebek Bezi Maxi 4 Numara Fırsat Paketi", "800", "Koli", "Koli: 4 Paket"),
            ("2", "Papia Tuvalet Kağıdı 32li Rulo", "600", "Paket", "Büyük Hacimli"),
            ("3", "Familia Kağıt Havlu 12li Rulo", "450", "Paket", "Şilinkli Paket"),
            ("4", "Bingo Sıvı Çamaşır Deterjanı 4L Konsantre", "500", "Koli", "Koli: 4 Adet")
        ],
        "toplam": "2350 Koli/Paket",
        "not": "Hijyenik ürün sevkiyatı. Koli ezilmeleri kontrol edilmiştir."
    }
]

def generate_official_invoice_image(doc: dict, output_path: Path):
    """
    Türkiye Gelir İdaresi Başkanlığı standartlarında, çizgili tablolu,
    kaşe/imzalı, resmi sevk irsaliyesi görseli oluşturur (1200 x 1700 px).
    """
    img = Image.new("RGB", (1200, 1700), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # 1. Dış Çerçeve ve Arka Plan Tonu
    draw.rectangle([30, 30, 1170, 1670], outline=(40, 40, 40), width=2)
    draw.rectangle([36, 36, 1164, 1664], outline=(180, 180, 180), width=1)

    # 2. Üst Resmi Başlık (Maliye & Seri No)
    draw.text((50, 50), "T.C. MALİYE BAKANLIĞI", fill=(0, 0, 0))
    draw.text((50, 72), "GELİR İDARESİ BAŞKANLIĞI", fill=(80, 80, 80))
    draw.text((50, 94), "RESMİ SEVK İRSALİYESİ", fill=(180, 0, 0))

    # Sağ Üst: İrsaliye Seri-Sıra No & Tarihler
    draw.rectangle([800, 45, 1150, 150], outline=(0, 0, 0), width=2)
    draw.text((815, 55), f"İRSALİYE NO: {doc['id']}", fill=(180, 0, 0))
    draw.text((815, 80), f"Düzenleme Tarihi: {doc['tarih']}", fill=(0, 0, 0))
    draw.text((815, 102), f"Fiili Sevk Tarihi: {doc['tarih']}", fill=(0, 0, 0))
    draw.text((815, 124), f"Fiili Sevk Saati: {doc['saat']}", fill=(0, 0, 0))

    # 3. Gönderici & Alıcı Firma Kutuları
    # Sol Kutu: Gönderici
    draw.rectangle([50, 170, 580, 370], outline=(100, 100, 100), width=1)
    draw.rectangle([50, 170, 580, 200], fill=(235, 240, 245), outline=(100, 100, 100), width=1)
    draw.text((60, 178), "GÖNDERİCİ (SEVK EDEN FİRMA)", fill=(20, 40, 80))
    draw.text((60, 210), f"Ünvan: {doc['firma']}", fill=(0, 0, 0))
    draw.text((60, 235), f"Adres: {doc['gonderici_adres'][:45]}", fill=(50, 50, 50))
    if len(doc['gonderici_adres']) > 45:
        draw.text((60, 255), f"{doc['gonderici_adres'][45:90]}", fill=(50, 50, 50))
    draw.text((60, 290), f"Vergi Dairesi: {doc['gonderici_vd']}", fill=(0, 0, 0))
    draw.text((60, 315), f"VKN / TCKN: {doc['gonderici_vkn']}", fill=(0, 0, 0))
    draw.text((60, 340), "Mersis No: 0" + doc['gonderici_vkn'] + "00016", fill=(100, 100, 100))

    # Sağ Kutu: Alıcı
    draw.rectangle([610, 170, 1150, 370], outline=(100, 100, 100), width=1)
    draw.rectangle([610, 170, 1150, 200], fill=(235, 240, 245), outline=(100, 100, 100), width=1)
    draw.text((620, 178), "ALICI (TESLİM ALACAK CARİ)", fill=(20, 40, 80))
    draw.text((620, 210), f"Ünvan: {doc['alici'][:42]}", fill=(0, 0, 0))
    draw.text((620, 235), f"Teslim Adresi: {doc['teslim_adres'][:45]}", fill=(50, 50, 50))
    if len(doc['teslim_adres']) > 45:
        draw.text((620, 255), f"{doc['teslim_adres'][45:90]}", fill=(50, 50, 50))
    draw.text((620, 290), f"Vergi Dairesi: {doc['alici_vd']}", fill=(0, 0, 0))
    draw.text((620, 315), f"VKN / TCKN: {doc['alici_vkn']}", fill=(0, 0, 0))
    draw.text((620, 340), "Ödeme Türü: Cari Hesap Sevk İrsaliyesi", fill=(100, 100, 100))

    # 4. Nakliye ve Lojistik Bilgileri Çubuğu
    draw.rectangle([50, 385, 1150, 445], fill=(248, 250, 252), outline=(120, 120, 120), width=1)
    draw.text((65, 395), f"Çekici / Kamyon Plakası: {doc['plaka']}", fill=(0, 0, 0))
    draw.text((550, 395), f"Taşıyıcı Şoför: {doc['sofor']}", fill=(0, 0, 0))
    draw.text((65, 420), "Taşıma Türü: Karayolu Yurtiçi Nakliye", fill=(80, 80, 80))
    draw.text((550, 420), f"Dorse / Römork No: 34 DR {random.randint(100,999)}", fill=(80, 80, 80))

    # 5. Kalemler Tablosu
    table_top = 460
    table_bottom = 1150
    draw.rectangle([50, table_top, 1150, table_bottom], outline=(60, 60, 60), width=2)
    # Tablo Başlığı
    header_h = 35
    draw.rectangle([50, table_top, 1150, table_top + header_h], fill=(225, 235, 245), outline=(60, 60, 60), width=1)
    
    # Sütun Çizgileri
    col_x = [50, 110, 650, 800, 920, 1150]
    draw.text((65, table_top + 10), "S.NO", fill=(0, 0, 0))
    draw.text((130, table_top + 10), "MALIN / HİZMETİN CİNSİ VE DETAYLI AÇIKLAMASI", fill=(0, 0, 0))
    draw.text((670, table_top + 10), "MİKTAR", fill=(0, 0, 0))
    draw.text((825, table_top + 10), "BİRİM", fill=(0, 0, 0))
    draw.text((945, table_top + 10), "AMBAR / LOT NOTLARI", fill=(0, 0, 0))

    for x in col_x:
        draw.line([(x, table_top), (x, table_bottom)], fill=(120, 120, 120), width=1)

    # Satırlar
    row_y = table_top + header_h
    row_height = 55
    for item in doc['kalemler']:
        sno, cinsi, miktar, birim, notlar = item
        draw.line([(50, row_y), (1150, row_y)], fill=(180, 180, 180), width=1)
        draw.text((70, row_y + 15), sno, fill=(0, 0, 0))
        draw.text((130, row_y + 15), cinsi, fill=(0, 0, 0))
        draw.text((680, row_y + 15), miktar, fill=(0, 0, 0))
        draw.text((830, row_y + 15), birim, fill=(0, 0, 0))
        draw.text((935, row_y + 15), notlar, fill=(70, 70, 70))
        row_y += row_height

    # Boş satır çizgileri (klasik matbu irsaliye görünümü)
    while row_y < table_bottom:
        draw.line([(50, row_y), (1150, row_y)], fill=(230, 230, 230), width=1)
        row_y += row_height

    # 6. Genel Toplam ve Notlar
    draw.rectangle([50, 1165, 1150, 1260], fill=(248, 248, 248), outline=(100, 100, 100), width=1)
    draw.text((65, 1175), f"GENEL TOPLAM SEVKİYAT MİKTARI: {doc['toplam']}", fill=(180, 0, 0))
    draw.text((65, 1205), f"GENEL AÇIKLAMALAR & AMBAR NOTU: {doc['not']}", fill=(40, 40, 40))
    draw.text((65, 1230), "Not: Bu sevk irsaliyesi 213 sayılı V.U.K. hükümlerine uygun olarak tanzim edilmiştir.", fill=(100, 100, 100))

    # 7. Teslim Eden & Teslim Alan Kaşe ve İmzalar
    # Sol Kaşe (Teslim Eden)
    draw.rectangle([50, 1280, 580, 1500], outline=(120, 120, 120), width=1)
    draw.text((65, 1290), "TESLİM EDEN (FİRMA YETKİLİSİ / ŞOFÖR)", fill=(0, 0, 0))
    draw.text((65, 1315), f"Adı Soyadı: {doc['sofor'].split('(')[0].strip()}", fill=(60, 60, 60))
    draw.text((65, 1335), "İmza: [ ISLAK İMZA ]", fill=(100, 100, 100))
    # Mavi Kaşe Efekti
    draw.ellipse([320, 1350, 540, 1460], outline=(20, 60, 180), width=3)
    draw.text((345, 1380), doc['firma'][:22], fill=(20, 60, 180))
    draw.text((360, 1405), f"VKN: {doc['gonderici_vkn']}", fill=(20, 60, 180))
    draw.text((370, 1425), "SEVK EDİLDİ", fill=(20, 60, 180))

    # Sağ Kaşe (Teslim Alan)
    draw.rectangle([610, 1280, 1150, 1500], outline=(120, 120, 120), width=1)
    draw.text((625, 1290), "TESLİM ALAN (DEPO / AMBAR MEMURU)", fill=(0, 0, 0))
    draw.text((625, 1315), "Adı Soyadı: Ambar Kabul Görevlisi", fill=(60, 60, 60))
    draw.text((625, 1335), "İmza: [ TESLİM ALINDI İMZASI ]", fill=(100, 100, 100))
    # Yeşil Kaşe Efekti
    draw.ellipse([880, 1350, 1110, 1460], outline=(16, 120, 60), width=3)
    draw.text((910, 1380), doc['alici'][:18], fill=(16, 120, 60))
    draw.text((925, 1405), "DEPO GİRİŞİ", fill=(16, 120, 60))
    draw.text((930, 1425), "EKSİKSİZ KABUL", fill=(16, 120, 60))

    # 8. Barkod ve Alt Dipnot
    draw.text((50, 1530), f"BARKOD / DOKÜMAN ID: *{doc['id']}*", fill=(0, 0, 0))
    # Sahte Barkod Çizgileri
    bx = 50
    for i in range(70):
        w = random.choice([2, 3, 5])
        draw.rectangle([bx, 1555, bx + w, 1610], fill=(0, 0, 0))
        bx += w + random.choice([2, 4])

    draw.text((50, 1630), "DocuLog Lojistik Doğrulama İş İstasyonu - Yüksek Çözünürlüklü Test Evrakı", fill=(120, 120, 120))

    img.save(output_path, "JPEG", quality=92)
    print(f"[IRSALIYE OK] {output_path.name}")


def generate_all_invoices():
    print("--- 15 Adet Gerçekçi Türkiye Sevk İrsaliyesi Üretiliyor ---")
    for idx, doc in enumerate(INVOICE_TEMPLATES, start=1):
        filename = f"{idx:02d}_irsaliye_{doc['id']}_{doc['firma'].split()[0].lower()}.jpg"
        file_path = INVOICES_DIR / filename
        generate_official_invoice_image(doc, file_path)


# -------------------------------------------------------------
# 3. TÜM BELGELERİ API ÜZERİNDEN KUYRUĞA YÜKLEME
# -------------------------------------------------------------
def upload_all_to_station():
    print("--- Tüm Belgeler DocuLog Kuyruğuna Yükleniyor (POST /api/upload) ---")
    API_URL = "http://127.0.0.1:8000/api/upload"

    all_files = []
    # 15 İrsaliye
    for p in sorted(INVOICES_DIR.glob("*.jpg")):
        all_files.append(p)
    # 15 İrsaliye Dışı Nesne
    for p in sorted(NON_INVOICES_DIR.glob("*.jpg")):
        all_files.append(p)

    print(f"Toplam Yüklenecek Dosya: {len(all_files)} adet (15 İrsaliye + 15 Nesne)")

    # 5'li partiler halinde yükle
    chunk_size = 5
    uploaded_total = 0
    for i in range(0, len(all_files), chunk_size):
        chunk = all_files[i:i + chunk_size]
        multipart_files = []
        opened_handles = []
        for file_path in chunk:
            h = open(file_path, "rb")
            opened_handles.append(h)
            multipart_files.append(("files", (file_path.name, h, "image/jpeg")))

        try:
            res = requests.post(API_URL, files=multipart_files, timeout=30)
            if res.status_code == 200:
                data = res.json()
                uploaded_total += len(data)
                print(f"[YÜKLENDİ] Parti {i//chunk_size + 1}: {len(data)} dosya aktarıldı.")
            else:
                print(f"[HATA] Parti {i//chunk_size + 1}: HTTP {res.status_code} - {res.text[:100]}")
        except Exception as e:
            print(f"[BAĞLANTI HATASI] {e}")
        finally:
            for h in opened_handles:
                h.close()

    print(f"=== TAMAMLANDI: Toplam {uploaded_total} Belge Başarıyla Kuyruğa Eklendi ===")

if __name__ == "__main__":
    download_or_generate_non_invoice_images()
    generate_all_invoices()
    upload_all_to_station()
