import os
from pathlib import Path
from dotenv import load_dotenv

# Çalışma dizini kökü ve backend dizini
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
WORKSPACE_DIR = BACKEND_DIR.parent

# .env dosyalarını yükle (önce kök dizin, sonra backend dizini)
load_dotenv(WORKSPACE_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")

class Settings:
    PROJECT_NAME: str = "Lojistik İrsaliye Ayrıştırma İş İstasyonu"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    # Gemini Ayarları
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Dizin Yolları (Sınıf niteliği olarak tanımlı)
    WORKSPACE_DIR: Path = WORKSPACE_DIR
    BACKEND_DIR: Path = BACKEND_DIR
    UPLOAD_DIR: Path = Path("/tmp/uploads") if os.getenv("VERCEL") else (BACKEND_DIR / "uploads")
    EXPORT_DIR: Path = Path("/tmp/exports") if os.getenv("VERCEL") else (BACKEND_DIR / "exports")

    # Sunucu Ayarları
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Dosya Yükleme Kısıtları
    ALLOWED_EXTENSIONS: set = {"jpg", "jpeg", "png", "webp", "pdf", "tif", "tiff"}
    ALLOWED_MIME_TYPES: set = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "image/tiff",
    }
    MAX_FILE_SIZE_MB: int = 30

    # WebSocket Güvenlik Kısıtları
    WS_MAX_TOTAL_CONNECTIONS: int = 100
    WS_MAX_CONNECTIONS_PER_SESSION: int = 20
    WS_MAX_CONNECTIONS_PER_IP: int = 30
    WS_RATE_LIMIT_BURST: int = 25
    WS_RATE_LIMIT_WINDOW_SECONDS: float = 5.0

    # CORS Ayarları
    @property
    def CORS_ORIGINS(self) -> list:
        cors_env = os.getenv("CORS_ORIGINS", "").strip()
        if cors_env:
            return [o.strip() for o in cors_env.split(",") if o.strip()]
        
        # Güvenli CORS kökenleri (Production ve Development) - ASLA wildcard '*' içermez
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ]

    def __init__(self):
        # Klasörleri otomatik oluştur (Vercel /tmp uyumlu)
        try:
            self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            self.EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"Dizin oluşturma uyarısı: {e}")

settings = Settings()
