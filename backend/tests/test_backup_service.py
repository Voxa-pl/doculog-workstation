import pytest
import tarfile
import json
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.backup_service import backup_service, compute_sha256, BACKUP_DIR
from backend.app.core.config import settings

client = TestClient(app)

class TestBackupService:
    @pytest.fixture(autouse=True)
    def setup_and_teardown(self):
        self.created_backups = []
        yield
        for b in self.created_backups:
            try:
                p = Path(b)
                if p.exists():
                    p.unlink()
                sha_p = Path(f"{b}.sha256")
                if sha_p.exists():
                    sha_p.unlink()
            except Exception:
                pass

    def test_create_system_backup_structure(self):
        """Disaster recovery arşivinin oluşturulması ve manifest içeriği"""
        res = backup_service.create_system_backup()
        assert res["success"] is True
        assert "filename" in res
        assert "sha256" in res
        
        backup_path = Path(res["path"])
        self.created_backups.append(str(backup_path))

        assert backup_path.exists()
        assert backup_path.stat().st_size > 0

        # Arşiv içeriğini doğrula (manifest.json var mı)
        with tarfile.open(backup_path, "r:gz") as tar:
            names = tar.getnames()
            assert "manifest.json" in names
            # Manifest dosyasını oku ve doğrula
            f = tar.extractfile("manifest.json")
            assert f is not None
            manifest = json.loads(f.read().decode("utf-8"))
            assert "created_at" in manifest
            assert "document_count" in manifest
            assert "database_sha256" in manifest

        # SHA-256 doğrulama dosyasını test et
        sha256_file = Path(f"{backup_path}.sha256")
        assert sha256_file.exists()
        actual_sha = compute_sha256(backup_path)
        assert res["sha256"] == actual_sha
        assert actual_sha in sha256_file.read_text(encoding="utf-8")

    def test_backup_status_and_health(self):
        """Yedekleme durum raporunun ve metriklerin kontrolü"""
        status = backup_service.get_backup_status()
        assert "total_backups_count" in status
        assert "database_size_bytes" in status
        assert "uploads_size_bytes" in status
        assert "backups" in status
        assert status["health"] in ["HEALTHY", "NO_BACKUP_YET"]

    def test_api_backup_create_and_status(self):
        """API üzerinden yedek alma ve durum sorgulama uçtan uca testi"""
        # 1. Durum sorgula
        resp_status = client.get("/api/system/backup/status")
        assert resp_status.status_code == 200
        data_status = resp_status.json()
        assert "total_backups_count" in data_status

        # 2. Yeni yedek oluştur
        resp_create = client.post("/api/system/backup/create")
        assert resp_create.status_code == 200
        data_create = resp_create.json()
        assert data_create["success"] is True
        filename = data_create["filename"]
        self.created_backups.append(str(BACKUP_DIR / filename))

        # 3. Yedeği indir
        resp_dl = client.get(f"/api/system/backup/download/{filename}")
        assert resp_dl.status_code == 200
        assert resp_dl.headers["content-type"] == "application/gzip"
        assert len(resp_dl.content) > 0

    def test_download_security_path_traversal(self):
        """Path traversal girişiminin engellenmesi"""
        resp = client.get("/api/system/backup/download/../../etc/passwd")
        assert resp.status_code in [404, 400]
