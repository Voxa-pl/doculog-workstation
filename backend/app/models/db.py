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
    created_at = Column(DateTime, default=datetime.utcnow)

DB_PATH = settings.BACKEND_DIR / "doculog.db"
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False, "timeout": 30}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """
    SQLite eşzamanlı yazma dayanıklılığı:
    - WAL modu: Okuma ve yazmaların birbirini kilitlemesini engeller.
    - busy_timeout=5000: Kilit çakışmalarında 5 saniyeye kadar kuyrukta bekler.
    - foreign_keys=ON: İlişkisel veri bütünlüğünü sağlar.
    - synchronous=NORMAL: WAL modunda maksimum I/O performansı ve veri güvenliği dengesi.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA busy_timeout=5000;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
    # WAL modunun hemen devreye girdiğini garanti et ve eksik sütunları güvenle migrate et
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
        conn.exec_driver_sql("PRAGMA busy_timeout=5000;")
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(documents);").fetchall()
            existing_cols = [r[1] for r in res]
            if "guncellenme_ts" not in existing_cols:
                conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN guncellenme_ts INTEGER DEFAULT NULL;")
                conn.commit()
        except Exception:
            pass

