import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.models.irsaliye import LineItem, DocumentUpdateRequest, DocumentItem, ProcessingStatus, IrsaliyeData
from backend.app.services.product_normalizer import product_normalizer, to_tr_lower
from backend.app.services.document_repo import doc_repo
from backend.app.models.db import SessionLocal, ProductAliasModel

client = TestClient(app)

def test_to_tr_lower():
    assert to_tr_lower("PÜSKÜR") == "püskür"
    assert to_tr_lower("İRSALİYE") == "irsaliye"
    assert to_tr_lower("IŞIK") == "ışık"
    assert to_tr_lower("Çikolatalı") == "çikolatalı"

def test_builtin_normalization():
    # Dot-matrix bozulmaları testi: "püskür" -> "Petibör"
    assert "Petibör" in product_normalizer.normalize_text("Ülker Püskür 175gr")
    assert "Petibör" in product_normalizer.normalize_text("PÜSKÜR BİSKÜVİ")
    assert "Petibör" in product_normalizer.normalize_text("ülker puskur")
    assert "Petibör" in product_normalizer.normalize_text("petibor")
    assert "Burçak" in product_normalizer.normalize_text("Eti burcak")
    assert "Biskrem" in product_normalizer.normalize_text("bıskrem")
    assert "Cici Bebe" in product_normalizer.normalize_text("cicibebe")

def test_line_items_normalization():
    items = [
        LineItem(sira_no=1, mal_hizmet="Ülker Püskür Bisküvi 175g", miktar=50.0, birim="Koli"),
        LineItem(sira_no=2, mal_hizmet="Eti burcak sutlu", miktar=20.0, birim="Koli"),
        LineItem(sira_no=3, mal_hizmet="100x120 ahsap palet", miktar=5.0, birim="Adet"),
    ]
    normalized = product_normalizer.normalize_items(items)
    assert "Petibör" in normalized[0].mal_hizmet
    assert "Burçak" in normalized[1].mal_hizmet
    assert "Ahşap Palet" in normalized[2].mal_hizmet

def test_self_learning_alias_memory():
    raw_bad = "deforme_test_urunu_99"
    corrected = "Özel Lojistik Çemberi 16mm"

    # İlk başta bilinmiyor
    res_before = product_normalizer.normalize_text(raw_bad)
    assert res_before == raw_bad

    # Kullanıcı düzeltmesi kaydet
    product_normalizer.record_user_correction(raw_bad, corrected)

    # Artık hemen tanımalı
    res_after = product_normalizer.normalize_text(f"Depo {raw_bad} Sevk")
    assert corrected in res_after

    # Veritabanında kayıtlı olduğunu doğrula
    db = SessionLocal()
    try:
        rec = db.query(ProductAliasModel).filter(ProductAliasModel.raw_pattern == raw_bad).first()
        assert rec is not None
        assert rec.normalized_name == corrected
        assert rec.usage_count >= 1
    finally:
        db.close()

def test_catalog_api_endpoints():
    # 1. Alias listeleme
    resp = client.get("/api/catalog/aliases")
    assert resp.status_code == 200
    aliases = resp.json()
    assert isinstance(aliases, list)
    assert len(aliases) > 0
    assert any(a.get("raw_pattern") == "püskür" for a in aliases)

    # 2. Yeni kural ekleme
    new_alias = {
        "raw_pattern": "api_test_bozuk_kod",
        "normalized_name": "API Test Düzgün Ürün",
        "kategori": "test"
    }
    post_resp = client.post("/api/catalog/aliases", json=new_alias)
    assert post_resp.status_code == 200
    assert post_resp.json()["mesaj"] == "Ürün eşleştirmesi hafızaya kaydedildi"

    # 3. Eklenen kuralın normalize etmesi
    assert "API Test Düzgün Ürün" in product_normalizer.normalize_text("api_test_bozuk_kod")

def test_operator_inline_edit_learning():
    # Bir evrak oluşturup mocklayalım
    doc_id = "test-doc-learning-001"
    doc = DocumentItem(
        id=doc_id,
        dosya_adi="test_irsaliye.jpg",
        dosya_yolu="/tmp/test.jpg",
        dosya_url="/uploads/test.jpg",
        mime_type="image/jpeg",
        boyut_bytes=1000,
        yuklenme_tarihi="26.10.2026 22:00",
        donus_acisi=0,
        durum=ProcessingStatus.TAMAMLANDI,
        veri=IrsaliyeData(
            kalemler=[
                LineItem(sira_no=1, mal_hizmet="BozukDotMatrixAd42", miktar=10.0, birim="Adet")
            ]
        )
    )
    doc_repo.save(doc)

    # Operatör PUT /documents/{doc_id} ile kalem adını düzeltiyor
    update_payload = {
        "kalemler": [
            {"sira_no": 1, "mal_hizmet": "Doğru Ülker Çikolatalı Gofret", "miktar": 10.0, "birim": "Adet"}
        ]
    }
    put_resp = client.put(f"/api/documents/{doc_id}", json=update_payload)
    assert put_resp.status_code == 200

    # Sistemin "BozukDotMatrixAd42"yi öğrendiğini test et
    learned_result = product_normalizer.normalize_text("BozukDotMatrixAd42")
    assert learned_result == "Doğru Ülker Çikolatalı Gofret"

    # Temizlik
    doc_repo.delete(doc_id, delete_files=False)
