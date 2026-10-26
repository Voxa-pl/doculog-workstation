import re
import difflib
import logging
from typing import List, Dict, Optional, Tuple, Pattern
from threading import Lock
from collections import OrderedDict
from sqlalchemy.orm import Session

from ..models.irsaliye import LineItem
from ..models.db import SessionLocal, ProductAliasModel
from .validation import vkn_memory_cache

logger = logging.getLogger(__name__)

# Türkçe karakter duyarlı küçük harfe dönüştürme tablosu
TR_LOWER_MAP = str.maketrans({
    "I": "ı", "İ": "i", "Ş": "ş", "Ğ": "ğ", "Ü": "ü", "Ö": "ö", "Ç": "ç"
})

def to_tr_lower(text: str) -> str:
    if not text:
        return ""
    return text.translate(TR_LOWER_MAP).lower().strip()

def clean_raw_key(text: str) -> str:
    """Metni arama ve eşleştirme için standartlaştırır."""
    if not text:
        return ""
    # Mükerrer tildeler, şapka ve çoklu alt çizgileri temizle
    t = re.sub(r'[\~^]+', ' ', text)
    t = re.sub(r'_{2,}', ' ', t)
    t = re.sub(r'\s{2,}', ' ', t).strip()
    return to_tr_lower(t)

# Yaygın nokta vuruşlu yazıcı harf bozulmaları ve FMCG master sözlüğü
DEFAULT_BUILTIN_ALIASES: Dict[str, str] = {
    # Petibör ve bisküvi türevleri (özellikle 'b' -> 'k' ve 'et' -> 'üs' bozulması)
    "püskür": "Petibör",
    "puskur": "Petibör",
    "püsküt": "Petibör",
    "puskut": "Petibör",
    "petıbor": "Petibör",
    "petibor": "Petibör",
    "petibor bisk": "Petibör Bisküvi",
    "bıskrem": "Biskrem",
    "biskrem": "Biskrem",
    "bıskirem": "Biskrem",
    "burcak": "Burçak",
    "burçak": "Burçak",
    "tutku": "Tutku",
    "hosbes": "Hoşbeş",
    "hoşbeş": "Hoşbeş",
    "probis": "Probis",
    "albeni": "Albeni",
    "halley": "Halley",
    "dankek": "Dankek",
    "benimo": "Benimo",
    "cicibebe": "Cici Bebe",
    "cici bebe": "Cici Bebe",
    "rondo": "Rondo",
    "negro": "Nero",
    "eti cin": "Eti Cin",
    "eticin": "Eti Cin",
    "eti crax": "Eti Crax",
    "crax": "Crax",
    "hanimeller": "Hanımeller",
    "hanımeller": "Hanımeller",
    "saklikoy": "Saklıköy",
    "saklıköy": "Saklıköy",
    "canpare": "Canpare",
    "popkek": "Popkek",
    "olala": "O'lala",
    "bisküvi": "Bisküvi",
    "biskuvi": "Bisküvi",
    
    # Süt ve İçecek FMCG
    "pinar sut": "Pınar Süt",
    "pınar süt": "Pınar Süt",
    "sutas ayran": "Sütaş Ayran",
    "sütaş ayran": "Sütaş Ayran",
    "sutas sut": "Sütaş Süt",
    "sütaş süt": "Sütaş Süt",
    "caykur rize": "Çaykur Rize",
    "çaykur rize": "Çaykur Rize",
    "torku sut": "Torku Süt",
    "torku süt": "Torku Süt",
    "torku seker": "Torku Şeker",
    "torku şeker": "Torku Şeker",
    
    # Ambalaj & Lojistik malzemeleri dot-matrix bozulmaları
    "ahsap palet": "Ahşap Palet",
    "ahşap palet": "Ahşap Palet",
    "euro palet": "Euro Palet",
    "karton kolı": "Karton Koli",
    "karton koli": "Karton Koli",
    "streç film": "Streç Film",
    "strec film": "Streç Film",
}

class ProductNormalizer:
    """
    Nokta vuruşlu (dot-matrix) ve silik şeritli irsaliyelerdeki optik okuma deformasyonlarını
    düzelten, in-memory LRU cache ve önceden derlenmiş regex kuralları ile mikro saniyelerde
    yanıt veren, operatör düzeltmelerinden dinamik öğrenen kurumsal ürün normalizasyon servisi.
    """

    def __init__(self):
        self._lock = Lock()
        self._dynamic_aliases: Dict[str, str] = {}
        self._hot_aliases: Dict[str, str] = {}
        self._compiled_rules: List[Tuple[Pattern, str]] = []
        self._normalize_lru_cache: OrderedDict[str, str] = OrderedDict()
        self.CACHE_CAPACITY: int = 10000
        self._initialized = False

    def _rebuild_compiled_rules_locked(self):
        """Önceden derlenmiş regex kurallarını ve hot alias haritasını thread-safe olarak yeniler."""
        combined: Dict[str, str] = {}
        combined.update(DEFAULT_BUILTIN_ALIASES)
        combined.update(self._dynamic_aliases)
        self._hot_aliases = dict(combined)

        sorted_patterns = sorted(combined.keys(), key=lambda k: len(k), reverse=True)
        rules: List[Tuple[Pattern, str]] = []
        for pat in sorted_patterns:
            esc = re.escape(pat)
            regex = re.compile(rf'(?<!\w){esc}(?!\w)', re.IGNORECASE)
            rules.append((regex, combined[pat]))

        self._compiled_rules = rules
        self._normalize_lru_cache.clear()

    def _ensure_loaded(self):
        if self._initialized:
            return
        with self._lock:
            if self._initialized:
                return
            try:
                db: Session = SessionLocal()
                try:
                    records = db.query(ProductAliasModel).all()
                    for r in records:
                        clean_key = to_tr_lower(r.raw_pattern)
                        if clean_key:
                            self._dynamic_aliases[clean_key] = r.normalized_name
                    logger.info(f"ProductNormalizer: SQLite'tan {len(records)} dinamik ürün eşleştirmesi yüklendi.")
                finally:
                    db.close()
            except Exception as e:
                logger.warning(f"ProductNormalizer: Veritabanından alias yüklenirken istisna: {e}")
            self._rebuild_compiled_rules_locked()
            self._initialized = True

    def normalize_text(self, text: str) -> str:
        """
        Verilen mal/hizmet açıklamasını hem yerleşik kurallar hem de öğrenilmiş alias'lar ile temizler.
        In-memory LRU önbellek ve önceden derlenmiş kural motoru kullanır.
        """
        if not text:
            return ""

        self._ensure_loaded()
        cleaned = text.strip()

        # Dot-matrix satır sonu gürültülerini temizle (~, ^, mükerrer tire/nokta vb.)
        cleaned = re.sub(r'[\~^]+', ' ', cleaned)
        cleaned = re.sub(r'_{2,}', ' ', cleaned)
        cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()

        # 0. In-Memory LRU Cache Denetimi (Hit -> < 0.001 ms)
        with self._lock:
            if cleaned in self._normalize_lru_cache:
                self._normalize_lru_cache.move_to_end(cleaned)
                return self._normalize_lru_cache[cleaned]

        lower_full = to_tr_lower(cleaned)

        # 1. Hızlı Tam Eşleşme Kontrolü (O(1) Hot Cache)
        with self._lock:
            hot_match = self._hot_aliases.get(lower_full)
            if hot_match:
                self._cache_put_locked(cleaned, hot_match)
                return hot_match
            rules_copy = list(self._compiled_rules)
            combined_aliases = dict(self._hot_aliases)

        # 2. Önceden Derlenmiş Regex Pipeline (Dinamik Regex Derleme Yükünü Kaldırır)
        result_text = cleaned
        for regex, target_val in rules_copy:
            new_text, count = regex.subn(target_val, result_text)
            if count > 0:
                result_text = new_text

        # 3. Fuzzy Eşleşme (Eğer belirgin bir kelime benzerliği varsa ve token >= 4 harf ise)
        tokens = result_text.split()
        modified = False
        new_tokens = []
        for tok in tokens:
            tok_clean = re.sub(r'^[^\w]+|[^\w]+$', '', tok)
            tok_lower = to_tr_lower(tok_clean)
            if len(tok_lower) >= 4 and tok_lower not in combined_aliases:
                best_match = None
                best_ratio = 0.0
                for candidate_key, correct_val in combined_aliases.items():
                    if " " not in candidate_key and len(candidate_key) >= 4:
                        ratio = difflib.SequenceMatcher(None, tok_lower, candidate_key).ratio()
                        if ratio > 0.84 and ratio > best_ratio:
                            best_ratio = ratio
                            best_match = correct_val
                if best_match and best_ratio > 0.84:
                    new_tokens.append(best_match)
                    modified = True
                    continue
            new_tokens.append(tok)

        if modified:
            result_text = " ".join(new_tokens)

        # Fazla boşlukları temizle
        result_text = re.sub(r'\s+', ' ', result_text).strip()

        # Sonucu LRU Cache'e kaydet
        with self._lock:
            self._cache_put_locked(cleaned, result_text)

        return result_text

    def _cache_put_locked(self, key: str, value: str):
        self._normalize_lru_cache[key] = value
        self._normalize_lru_cache.move_to_end(key)
        if len(self._normalize_lru_cache) > self.CACHE_CAPACITY:
            self._normalize_lru_cache.popitem(last=False)

    def normalize_items(self, items: Optional[List[LineItem]]) -> List[LineItem]:
        """
        İrsaliye kalemlerindeki ürün adlarını normalleştirir.
        """
        if not items:
            return []

        for item in items:
            if item.mal_hizmet:
                normalized = self.normalize_text(item.mal_hizmet)
                if normalized and normalized != item.mal_hizmet:
                    logger.debug(f"Normalizasyon: '{item.mal_hizmet}' -> '{normalized}'")
                    item.mal_hizmet = normalized

        return items

    def record_user_correction(self, raw_name: str, corrected_name: str, category: str = "fmcg_gida"):
        """
        Operatörün el ile düzelttiği bir ürün adını kalıcı hafızaya kaydeder.
        Gelecekte aynı bozulma algılandığında doğrudan bu düzeltme uygulanır.
        """
        if not raw_name or not corrected_name:
            return

        clean_raw = clean_raw_key(raw_name)
        clean_corrected = corrected_name.strip()

        if not clean_raw or not clean_corrected or clean_raw == to_tr_lower(clean_corrected):
            return

        with self._lock:
            self._dynamic_aliases[clean_raw] = clean_corrected
            self._rebuild_compiled_rules_locked()

        try:
            db: Session = SessionLocal()
            try:
                record = db.query(ProductAliasModel).filter(ProductAliasModel.raw_pattern == clean_raw).first()
                if record:
                    record.normalized_name = clean_corrected
                    record.usage_count = (record.usage_count or 1) + 1
                    record.kategori = category
                else:
                    new_record = ProductAliasModel(
                        raw_pattern=clean_raw,
                        normalized_name=clean_corrected,
                        kategori=category,
                        confidence=1.0,
                        usage_count=1
                    )
                    db.add(new_record)
                db.commit()
                logger.info(f"ProductNormalizer: Yeni kural öğrenildi: '{clean_raw}' -> '{clean_corrected}'")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"ProductNormalizer: Kural kaydedilirken DB hatası: {e}")

    # VKN Memory Cache Kolay Erişim Yöntemleri
    @staticmethod
    def record_vkn_title(vkn: str, unvan: str):
        vkn_memory_cache.record_vkn_unvan(vkn, unvan)

    @staticmethod
    def get_vkn_title(vkn: str) -> Optional[str]:
        return vkn_memory_cache.get_unvan(vkn)

    def get_all_aliases(self) -> List[Dict]:
        """Tüm kayıtlı ve yerleşik eşleştirmeleri listeler."""
        self._ensure_loaded()
        results = []
        # Builtin
        for raw, norm in DEFAULT_BUILTIN_ALIASES.items():
            results.append({
                "raw_pattern": raw,
                "normalized_name": norm,
                "kaynak": "yerlesik_sözlük",
                "usage_count": 1
            })
        # Dynamic DB
        try:
            db: Session = SessionLocal()
            try:
                records = db.query(ProductAliasModel).all()
                for r in records:
                    results.append({
                        "id": r.id,
                        "raw_pattern": r.raw_pattern,
                        "normalized_name": r.normalized_name,
                        "kategori": r.kategori,
                        "usage_count": r.usage_count,
                        "kaynak": "ogrenilmis_hafiza"
                    })
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Alias listesi alınırken hata: {e}")
        return results

product_normalizer = ProductNormalizer()
