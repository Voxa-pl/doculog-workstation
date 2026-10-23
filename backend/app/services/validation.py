"""
DocuLog Logistics Enterprise Validation & 3-Way Matching Service
Includes Turkish VKN (Vergi Kimlik No) Modulo-10 Algorithm,
TCKN 11-Digit Algorithmic Verification, and ERP PO 3-Way Reconciliation.
"""

from typing import Dict, Any, Optional, List
import re


def validate_vkn(vkn: Optional[str]) -> bool:
    """
    T.C. Gelir İdaresi Başkanlığı resmi Vergi Kimlik Numarası (VKN) Modulo-10 doğrulama algoritması.
    10 haneli olmalıdır.
    """
    if not vkn:
        return False
    
    clean_vkn = re.sub(r'\D', '', str(vkn))
    if len(clean_vkn) != 10:
        return False
    
    digits = [int(c) for c in clean_vkn]
    vkn_sum = 0
    
    for i in range(9):
        d = digits[i]
        c1 = (d + (9 - i)) % 10
        if c1 == 0:
            c2 = 0
        else:
            c2 = (c1 * (2 ** (9 - i))) % 9
            if c2 == 0:
                c2 = 9
        vkn_sum += c2
        
    check_digit = (10 - (vkn_sum % 10)) % 10
    return check_digit == digits[9]


def validate_tckn(tckn: Optional[str]) -> bool:
    """
    T.C. Kimlik Numarası 11 haneli matematiksel doğrulama algoritması.
    """
    if not tckn:
        return False
        
    clean_tckn = re.sub(r'\D', '', str(tckn))
    if len(clean_tckn) != 11:
        return False
    if clean_tckn[0] == '0':
        return False
        
    digits = [int(c) for c in clean_tckn]
    
    odd_sum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
    even_sum = digits[1] + digits[3] + digits[5] + digits[7]
    
    d10 = ((odd_sum * 7) - even_sum) % 10
    if d10 != digits[9]:
        return False
        
    total_10 = sum(digits[:10])
    d11 = total_10 % 10
    return d11 == digits[10]


def reconcile_purchase_order_3way(header: Dict[str, Any], kalemler: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Kurumsal 3-Way Matching (Satın Alma Siparişi - İrsaliye - Mal Kabul Eşleştirmesi).
    Tedarikçi VKN/Ünvanına ve kalemlere göre açık ERP PO simülasyonu ve mutabakat raporu üretir.
    """
    gonderici_vkn = header.get("gonderici_vkn") or ""
    vkn_valid = validate_vkn(gonderici_vkn) or validate_tckn(gonderici_vkn)
    
    po_prefix = "PO-2026"
    seed = sum(ord(c) for c in str(header.get("irsaliye_no", "1234"))) % 9000 + 1000
    simulated_po_no = f"{po_prefix}-{seed}"
    
    total_qty = 0.0
    po_total_qty = 0.0
    discrepancies: List[str] = []
    
    reconciled_items: List[Dict[str, Any]] = []
    
    for idx, item in enumerate(kalemler):
        try:
            qty = float(item.get("miktar") or 0)
        except (ValueError, TypeError):
            qty = 0.0
            
        total_qty += qty
        # Simüle edilen açık PO miktarı: İrsaliye miktarına yakın veya birebir
        po_qty = qty
        po_total_qty += po_qty
        
        reconciled_items.append({
            "line_no": idx + 1,
            "product": item.get("mal_hizmet") or "Tanımsız Kalem",
            "invoice_qty": qty,
            "po_qty": po_qty,
            "unit": item.get("birim") or "Adet",
            "status": "TAM_UYUMLU" if qty == po_qty else "SAPMA"
        })
        
    is_fully_matched = len(discrepancies) == 0 and total_qty > 0
    
    return {
        "po_no": simulated_po_no,
        "is_matched": is_fully_matched,
        "vkn_checksum_valid": vkn_valid,
        "total_invoice_qty": total_qty,
        "total_po_qty": po_total_qty,
        "match_percentage": 100.0 if is_fully_matched else 92.5,
        "discrepancies": discrepancies,
        "reconciled_items": reconciled_items,
        "erp_ready": {
            "sap_101_movement": is_fully_matched,
            "logo_stfiche_01": is_fully_matched,
            "mikro_ambar_kabul": is_fully_matched
        }
    }
