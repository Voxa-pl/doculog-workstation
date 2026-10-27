from sqlalchemy import Column, String, Integer, Float, Text, JSON, DateTime, Index, create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
from pathlib import Path
import logging
from ..core.config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()

class DocumentModel(Base):
    __tablename__ = "documents"

    id = Column(String(64), primary_key=True, index=True)
    dosya_adi = Column(String(255), nullable=False)
    dosya_yolu = Column(String(512), nullable=False)
    dosya_url = Column(String(512), nullable=False)
    mime_type = Column(String(64), default="image/jpeg")
    boyut_bytes = Column(Integer, default=0)
    yuklenme_tarihi = Column(String(64), nullable=False, index=True)
    donus_acisi = Column(Integer, default=0)
    durum = Column(String(32), default="kuyrukta", index=True)
    hata_mesaji = Column(Text, nullable=True)
    veri = Column(JSON, nullable=True)
    sayfalar = Column(JSON, nullable=True)
    guncellenme_ts = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_documents_durum_created_at", "durum", created_at.desc()),
        Index("idx_documents_durum_yuklenme_tarihi", "durum", "yuklenme_tarihi"),
        Index("idx_documents_durum_id", "durum", "id"),
        Index("idx_documents_yuklenme_tarihi", "yuklenme_tarihi"),
    )

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
    pool_size=100,
    max_overflow=200,
    pool_timeout=15,
    pool_recycle=1800,
    pool_pre_ping=True
)

def apply_sqlite_pragmas(dbapi_connection):
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

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    apply_sqlite_pragmas(dbapi_connection)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    # WAL modunun hemen devreye girdiğini garanti et ve eksik sütunları/indeksleri migrate et
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
        conn.exec_driver_sql("PRAGMA busy_timeout=10000;")
        conn.exec_driver_sql("PRAGMA synchronous=NORMAL;")
        conn.exec_driver_sql("PRAGMA cache_size=-64000;")
        conn.exec_driver_sql("PRAGMA mmap_size=268435456;")
        conn.exec_driver_sql("PRAGMA temp_store=MEMORY;")
        conn.exec_driver_sql("PRAGMA wal_autocheckpoint=1000;")
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(documents);").fetchall()
            existing_cols = [r[1] for r in res]
            if "guncellenme_ts" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN guncellenme_ts INTEGER DEFAULT NULL;")
                conn.commit()
        except Exception:
            pass

        # Performans İndeksleri
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_documents_id ON documents(id);",
            "CREATE INDEX IF NOT EXISTS idx_documents_durum ON documents(durum);",
            "CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);",
            "CREATE INDEX IF NOT EXISTS idx_documents_yuklenme_tarihi ON documents(yuklenme_tarihi DESC);",
            "CREATE INDEX IF NOT EXISTS idx_documents_durum_created_at ON documents(durum, created_at DESC);",
            "CREATE INDEX IF NOT EXISTS idx_documents_durum_yuklenme_tarihi ON documents(durum, yuklenme_tarihi DESC);",
            "CREATE INDEX IF NOT EXISTS idx_documents_durum_id ON documents(durum, id);",
        ]
        for idx_sql in indexes:
            try:
                conn.exec_driver_sql(idx_sql)
            except Exception as e:
                logger.warning(f"İndeks oluşturulurken hata ({idx_sql}): {e}")
        conn.commit()

