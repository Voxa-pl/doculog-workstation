import socket
import io
import base64
import qrcode
from typing import Tuple

def get_lan_ip() -> str:
    """
    Bilgisayarın yerel ağdaki (LAN / Wi-Fi) gerçek IP adresini tespit eder.
    İnternet bağlantısı olmasa bile harici bir soket açma girişimi ile
    en uygun ağ bağdaştırıcısının IP'sini (192.168.x.x, 10.x.x.x vb.) döndürür.
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # 8.8.8.8 adresine aslında paket göndermez, sadece yönlendirici arayüzünü belirler
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith('127.'):
            return ip
    except Exception:
        pass

    try:
        # Alternatif: Hostname üzerinden IP çözümleme
        hostname = socket.gethostname()
        host_ip = socket.gethostbyname(hostname)
        if host_ip and not host_ip.startswith('127.'):
            return host_ip
    except Exception:
        pass

    return '127.0.0.1'

def generate_qr_base64(url: str) -> str:
    """
    Verilen URL için yüksek kaliteli, taranması kolay bir QR kod üretir
    ve data:image/png;base64,... Data URL formatında döndürür.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"
