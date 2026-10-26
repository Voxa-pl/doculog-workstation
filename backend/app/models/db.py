from sqlalchemy import Column, String, Integer, Float, Text, JSON, DateTime, create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
from pathlib import Path
from ..core.config import settings

Base = declarative_base()

class DocumentModel(Base):
    __tablename__ = "documents"

    id = Column(String(64), primary_key=True, index=True)
    dosya_adi = Column(String(255), nullable=False)
    dosya_yolu = Column(String(512), nullable=False)
    dosya_url = Column(String(512), nullable=False)
    mime_type = Column(String(64), default="image/jpeg")
    boyut_bytes = Column(Integer, default=0)
    yuklenme_tarihi = Column(String(64), nullable=False)
    donus_acisi = Column(Integer, default=0)
    durum = Column(String(32), default="kuyrukta", index=True)
    hata_mesaji = Column(Text, nullable=True)
    veri = Column(JSON, nullable=True)
    sayfalar = Column(JSON, nullable=True)
    guncellenme_ts = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class ProductAliasModel(Base):
    """
    Kullanıcı / Operatör düzeltmelerinden öğrenen dinamik ürün ve terim hafızası.
    Nokta vuruşlu yazıcı bozulmalarını (Örn: 'püskür' -> 'Petibör') ve sektörel varyantları saklar.
    """
    __tablename__ = "product_aliases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    raw_pattern = Column(String(255), unique=True, index=True, nullable=False)  # Normalize edilmiş ham okuma (küçük harf)
    normalized_name = Column(String(255), nullable=False)                       # Doğrulanmış kurumsal ürün adı
    kategori = Column(String(64), nullable=True, default="fmcg_gida")            # Kategori etiketi
    confidence = Column(Float, default=1.0)                                     # Güven katsayısı
    usage_count = Column(Integer, default=1, index=True)                         # Düzeltilme / kullanılma sıklığı
    created_at = Column(DateTime, default=datetime.utcnow)

from sqlalchemy.pool import QueuePool

DB_PATH = settings.BACKEND_DIR / "doculog.db"
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False, "timeout": 30},
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """
    SQLite WAL Modu ve Connection Pool Performans Mimarisi:
    - journal_mode=WAL: Okuma ve yazmaların birbirini kilitlemesini engeller (Readers don't block Writers).
    - busy_timeout=10000: Yoğun eşzamanlı yazmalarda kilitlenmeyi önler, 10s kuyrukta bekler.
    - synchronous=NORMAL: WAL modunda maksimum I/O performansı ve veri güvenliği dengesi.
    - foreign_keys=ON: İlişkisel veri bütünlüğü.
    - cache_size=-64000: 64MB bellek sayfası önbelleği (Varsayılan 2MB yerine 32 kat artış).
    - mmap_size=268435456: 256MB bellek eşlemeli I/O (OS page cache üzerinden sıfır syscall okuma).
    - temp_store=MEMORY: Geçici tablolar ve sıralamalar RAM'de saklanır (Disk I/O darboğazı kalkar).
    - wal_autocheckpoint=1000: WAL dosyasının optimum boyutta tutulmasını sağlar.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA busy_timeout=10000;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.execute("PRAGMA cache_size=-64000;")
    cursor.execute("PRAGMA mmap_size=268435456;")
    cursor.execute("PRAGMA temp_store=MEMORY;")
    cursor.execute("PRAGMA wal_autocheckpoint=1000;")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    # WAL modunun hemen devreye girdiğini garanti et ve eksik sütunları/indeksleri migrate et
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
        conn.exec_driver_sql("PRAGMA busy_timeout=10000;")
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(documents);").fetchall()
            existing_cols = [r[1] for r in res]
            if "guncellenme_ts" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN guncellenme_ts INTEGER DEFAULT NULL;")
                conn.commit()
        except Exception:
            pass

        # Performans İndeksleri
        try:
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS idx_documents_durum ON documents(durum);")
            conn.commit()
        except Exception:
            pass

