import os
import tarfile
import hashlib
import json
import logging
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy import text

from ..core.config import settings
from ..models.db import engine
from ..services.document_repo import doc_repo

logger = logging.getLogger(__name__)

BACKUP_DIR = settings.BACKEND_DIR / "backups"

def compute_sha256(file_path: Path) -> str:
    """Dosyanın SHA-256 özet değerini hesaplar"""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()

class BackupService:
    @staticmethod
    def _ensure_backup_dir() -> Path:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        return BACKUP_DIR

    @classmethod
    def create_system_backup(cls) -> Dict[str, Any]:
        """
        Disaster Recovery:
        1. SQLite WAL checkpoint (TRUNCATE) ile tüm bekleyen işlemleri diske yazar.
        2. doculog.db veritabanını ve uploads/ dizinini arşivler.
        3. manifest.json oluşturur (belge sayısı, dosya boyutları, sha256).
        4. .tar.gz formatında sıkıştırır ve .sha256 sağlama dosyasını oluşturur.
        5. Eski yedekleri (en fazla 10 adet tutulur) temizler.
        """
        cls._ensure_backup_dir()
        db_path = settings.BACKEND_DIR / "doculog.db"

        # 1. SQLite WAL Checkpoint
        try:
            with engine.connect() as conn:
                conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE);"))
                conn.commit()
                logger.info("SQLite WAL checkpoint (TRUNCATE) başarıyla tamamlandı.")
        except Exception as e:
            logger.warning(f"WAL checkpoint yürütülürken hata: {e}")

        # 2. İstatistikleri topla
        docs = doc_repo.get_all()
        doc_count = len(docs)
        
        upload_files = list(settings.UPLOAD_DIR.glob("*")) if settings.UPLOAD_DIR.exists() else []
        upload_file_count = len([f for f in upload_files if f.is_file()])

        db_sha256 = compute_sha256(db_path) if db_path.exists() else "DB_NOT_FOUND"
        db_size_bytes = db_path.stat().st_size if db_path.exists() else 0

        now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"doculog_backup_{now_str}.tar.gz"
        backup_path = BACKUP_DIR / backup_filename

        # 3. Manifest hazırla
        manifest_data = {
            "backup_version": "1.0",
            "system_name": settings.PROJECT_NAME,
            "created_at": datetime.now().isoformat(),
            "document_count": doc_count,
            "upload_files_count": upload_file_count,
            "database_size_bytes": db_size_bytes,
            "database_sha256": db_sha256,
            "environment": settings.ENVIRONMENT
        }

        manifest_temp_path = BACKUP_DIR / f"manifest_{now_str}.json"
        with open(manifest_temp_path, "w", encoding="utf-8") as mf:
            json.dump(manifest_data, mf, indent=2, ensure_ascii=False)

        # 4. .tar.gz arşivi oluştur
        try:
            with tarfile.open(backup_path, "w:gz") as tar:
                # Manifest dosyasını ekle
                tar.add(manifest_temp_path, arcname="manifest.json")

                # doculog.db dosyasını ekle
                if db_path.exists():
                    tar.add(db_path, arcname="data/doculog.db")

                # uploads klasörünü ekle
                if settings.UPLOAD_DIR.exists():
                    for file_item in settings.UPLOAD_DIR.iterdir():
                        if file_item.is_file():
                            tar.add(file_item, arcname=f"uploads/{file_item.name}")
        finally:
            if manifest_temp_path.exists():
                manifest_temp_path.unlink()

        # 5. Arşivin SHA-256 özetini çıkar ve .sha256 dosyasına yaz
        archive_sha256 = compute_sha256(backup_path)
        sha256_path = BACKUP_DIR / f"{backup_filename}.sha256"
        with open(sha256_path, "w", encoding="utf-8") as sf:
            sf.write(f"{archive_sha256}  {backup_filename}\n")

        # 6. Eski yedekleri rotasyona sok (Maksimum 10 adet yedek sakla)
        cls._prune_old_backups(keep_count=10)

        backup_size = backup_path.stat().st_size
        logger.info(f"Disaster Recovery yedeği başarıyla oluşturuldu: {backup_filename} ({backup_size} bytes)")

        return {
            "success": True,
            "filename": backup_filename,
            "path": str(backup_path),
            "size_bytes": backup_size,
            "sha256": archive_sha256,
            "created_at": manifest_data["created_at"],
            "document_count": doc_count,
            "upload_files_count": upload_file_count
        }

    @classmethod
    def _prune_old_backups(cls, keep_count: int = 10) -> None:
        """En son keep_count adet yedeği saklar, eskileri siler"""
        try:
            cls._ensure_backup_dir()
            archives = sorted(BACKUP_DIR.glob("doculog_backup_*.tar.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
            if len(archives) > keep_count:
                for old_arch in archives[keep_count:]:
                    try:
                        old_arch.unlink(missing_ok=True)
                        sha_file = Path(f"{old_arch}.sha256")
                        sha_file.unlink(missing_ok=True)
                        logger.info(f"Eski sistem yedeği temizlendi: {old_arch.name}")
                    except Exception as e:
                        logger.warning(f"Eski yedek silinemedi ({old_arch.name}): {e}")
        except Exception as e:
            logger.warning(f"Yedek rotasyon hatası: {e}")

    @classmethod
    def get_backup_status(cls) -> Dict[str, Any]:
        """Mevcut yedekleme durumunu ve mevcut arşivleri listeler"""
        cls._ensure_backup_dir()
        db_path = settings.BACKEND_DIR / "doculog.db"

        backups_list: List[Dict[str, Any]] = []
        archives = sorted(BACKUP_DIR.glob("doculog_backup_*.tar.gz"), key=lambda p: p.stat().st_mtime, reverse=True)

        for arch in archives:
            sha_file = Path(f"{arch}.sha256")
            sha_val = ""
            if sha_file.exists():
                try:
                    sha_val = sha_file.read_text(encoding="utf-8").split()[0]
                except Exception:
                    pass
            
            backups_list.append({
                "filename": arch.name,
                "size_bytes": arch.stat().st_size,
                "modified_ts": int(arch.stat().st_mtime * 1000),
                "created_at": datetime.fromtimestamp(arch.stat().st_mtime).isoformat(),
                "sha256": sha_val
            })

        db_size = db_path.stat().st_size if db_path.exists() else 0
        upload_size = sum(f.stat().st_size for f in settings.UPLOAD_DIR.glob("*") if f.is_file()) if settings.UPLOAD_DIR.exists() else 0

        docs = doc_repo.get_all()
        last_backup = backups_list[0] if backups_list else None

        return {
            "total_backups_count": len(backups_list),
            "database_size_bytes": db_size,
            "uploads_size_bytes": upload_size,
            "total_documents": len(docs),
            "last_backup": last_backup,
            "backups": backups_list,
            "retention_policy": "Maksimum 10 arşiv (Otomatik rotasyon)",
            "health": "HEALTHY" if backups_list else "NO_BACKUP_YET"
        }

    @classmethod
    def get_backup_path_by_name(cls, filename: str) -> Optional[Path]:
        """Güvenli şekilde yedek dosya yolunu döner (Path traversal engelli)"""
        clean_name = Path(filename).name
        target = BACKUP_DIR / clean_name
        if target.exists() and target.is_file() and target.name.startswith("doculog_backup_"):
            return target
        return None

backup_service = BackupService()
