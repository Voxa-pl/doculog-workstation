# DocuLog Workstation — Test Infrastructure & Quality Methodology (TEST_INFRA)

## 1. Overview & Architecture

DocuLog Workstation is a hybrid desktop-web logistics application combining a FastAPI backend (Python 3.13) and a React 19 + TypeScript + Vite + Tailwind CSS frontend.
The test infrastructure provides independent programmatic verification across backend analytical services, Excel reporting engines, and browser user interfaces.

### Core Testing Pillars
1. **Zero External Test Framework Bloat**:
   - Backend testing relies on Python standard `unittest`, `fastapi.testclient.TestClient`, and `openpyxl`.
   - Frontend UI automation utilizes native Chrome DevTools Protocol (CDP) over WebSocket with Python `websocket-client` and `requests`, driving headless Brave Browser directly without heavy third-party drivers (no Selenium/Playwright dependencies required).
2. **Deterministic & Isolated Execution**:
   - In-memory test states and explicit fixtures isolate tests from system side-effects.
   - Temporary file structures (`tempfile`) and isolated browser user data directories prevent state contamination.
3. **Strict Zero-Tolerance Quality Gate**:
   - 0 uncaught JavaScript runtime/console exceptions.
   - 0 schema or mathematical drift in analytical metrics.
   - 0 Excel workbook corruption or unescaped formula injections.

---

## 2. 4-Tier Test Methodology

The testing strategy is structured into four progressive tiers ensuring complete verification from individual algorithms to end-to-end operational workflows:

```
+--------------------------------------------------------------------------+
| Tier 4: Real-World Logistics Workloads (Multi-doc batch & audit report)   |
+--------------------------------------------------------------------------+
| Tier 3: Cross-Feature Integration (View switching, theme reactivity, sync)|
+--------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (Zero/single doc, extremes, injections)   |
+--------------------------------------------------------------------------+
| Tier 1: Feature Coverage (Core KPIs, 4 SVG charts, JSON schema, Excel)   |
+--------------------------------------------------------------------------+
```

### Tier 1: Feature Coverage (Functional Correctness)
- **Backend Analytics Engine (`GET /api/analytics`)**:
  - Validates `AnalyticsResponse` JSON schema structure: `kpi`, `zaman_serisi`, `tedarikci_dagilimi`, `en_cok_gelen_kalemler`, `durum_dagilimi`.
  - Verifies exact arithmetic calculation of:
    - **Toplam İrsaliye Hacmi** (`toplam_irsaliye_hacmi = len(documents)`).
    - **Mal Kabul Onay Oranı %** (`onaylanan / (onaylanan + tamamlandi + hata) * 100`).
    - **Toplam İşlenen Kalem Adedi** & **Toplam İşlenen Miktar**.
    - **Ortalama Dijitalleştirme Hızı** (saniye / evrak).
  - Chronological time series aggregation (`TimeSeriesPoint`).
  - Supplier delivery volume ranking with percentage share calculation (`pay_yuzde`).
  - Top item frequency and quantity aggregation (`TopItemDistribution`).
  - Operational status distribution & discrepancy metrics (`uyusmazlik_sayisi`, `uyusmazlik_orani_yuzde`, `ortalama_guven_skoru`).
- **Executive Excel Multi-Sheet Report (`GET /api/analytics/export-report`)**:
  - Validates HTTP 200 FileResponse with MIME type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  - Validates multi-sheet workbook generation via `openpyxl`:
    - Sheet 1: `Yonetici_Ozeti`
    - Sheet 2: `Tedarikci_Dagilimi`
    - Sheet 3: `En_Cok_Gelen_Kalemler`
    - Sheet 4: `Evrak_Dokumu`
  - Validates corporate header styling, font specifications, borders, and auto-fit column dimensions.
- **Frontend Cockpit Navigation & Core Visuals**:
  - Top-bar segmented navigation toggle (`[data-testid="view-switcher-station"]` and `[data-testid="view-switcher-cockpit"]`).
  - Verification of 4 KPI cards rendering non-empty numeric data and trend badges.
  - Verification of 4 interactive SVG charts rendering `<svg>` viewports, `<path>`, `<rect>`, or `<circle>` elements:
    - `TimeSeriesChart`
    - `SupplierDistributionChart`
    - `TopItemsChart`
    - `OperationalStatusChart`
  - Interactive tooltips and hover triggers.

### Tier 2: Boundary, Corner & Adversarial Cases
- **Empty State (`DOCUMENT_STORE == {}`)**:
  - Mathematical zero-division prevention (`onay_orani_yuzde: 0.0`, `uyusmazlik_orani_yuzde: 0.0`, `ortalama_dijitallesme_hizi_sn: 0.0`).
  - Flag `empty: true` in API response.
  - UI renders dedicated empty state components (`EmptyChartState`) with Turkish user guidance without throwing null-pointer errors.
- **Single-Document State**:
  - 100% single supplier market share (`pay_yuzde: 100.0`).
  - Single point/bar time series rendering without chart scaling crashes.
- **Extreme & Floating-Point Numbers**:
  - High volume quantities (e.g. 1,500,000 Adet) formatted with thousand separators (`1.500.000` or `1.5M`).
  - Fractional decimal precision (`0.001` Ton/Kg) summing accurately without floating-point drift.
- **Missing & Malformed Data Fields**:
  - Documents with `None` or whitespace sender titles falling back to `"Tanımsız Tedarikçi"`.
  - Documents with non-standard or missing dates falling back gracefully to upload date.
  - Line items with missing quantities defaulting to `0.0` without raising `TypeError`.
- **Excel Formula Injection (CSV/XLSX Injection Prevention)**:
  - Sanitization of item names or vendor titles starting with `=`, `+`, `-`, or `@` by prefixing with a single quote (`'`), preventing malicious execution in Excel clients.

### Tier 3: Cross-Feature Integration & State Preservation
- **Workstation State Preservation**:
  - Selecting a specific waybill in the batch queue.
  - Modifying zoom or active form fields in `DocumentEditor`.
  - Switching to `Yönetici Kokpiti` (`[data-testid="view-switcher-cockpit"]`).
  - Switching back to `İrsaliye İstasyonu` (`[data-testid="view-switcher-station"]`).
  - Asserting via DOM query that `selectedDocId`, queue list, and active document form state are 100% preserved (achieved via CSS DOM toggling rather than unmounting).
- **Triple Theme System Dynamic Contrast**:
  - Cycles through all three themes:
    1. `koyu-kurumsal` (Corporate Slate Dark - Default)
    2. `gece-vardiyasi` (High-contrast OLED Black / Warehouse Night Shift)
    3. `acik-ofis` (Clean High-Contrast Bright Office)
  - Asserts `document.documentElement` / root attribute `data-theme` changes.
  - Validates contrast tokens, SVG stroke/fill color definitions, and background readability across all 3 modes.
- **Real-Time Data Propagation**:
  - Updating or approving a waybill reflects immediately in the analytics response without restarting the server.

### Tier 4: Real-World Logistics Workloads
- **Full Operational Mal Kabul Lifecycle**:
  - Ingestion of a realistic heterogeneous batch of waybills (various suppliers, multi-item shipments, damaged goods with warehouse discrepancy notes, low confidence OCR scores).
  - Validation that discrepancy detection correctly flags claim notes (`"ezik"`, `"hasar"`, `"eksik"`, `"iade"`, `"şerh"`).
  - One-click export download (`/api/analytics/export-report`) returning a fully styled, non-corrupted `.xlsx` workbook containing the exact audit figures.

---

## 3. Test Suites & File Structure

```
s:\irsaliye-workstation/
├── TEST_INFRA.md                   # Test architecture and specification (This file)
├── TEST_READY.md                   # Verification and test readiness declaration
├── backend/
│   └── tests/
│       └── test_analytics.py       # Backend unit tests (FastAPI TestClient + unittest)
└── tests/
    ├── test_backend_analytics_e2e.py # End-to-end backend analytics & Excel export test
    ├── test_ui_cockpit_cdp.py      # Headless Brave CDP browser UI automation test
    └── run_all_tests.py            # Master test runner orchestrating all test suites
```

---

## 4. Test Execution Commands & Environment

### Prerequisites
- Python 3.13 (`python.exe` on PATH or Windows Apps path)
- Brave Browser installed at `C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`
- Node.js & Vite build completed (`frontend/dist` compiled)

### Execution Matrix

| Test Suite | Purpose | Execution Command | Target SLA |
|------------|---------|-------------------|------------|
| **Backend Unit Tests** | Component-level validation | `python -m unittest discover -s backend/tests -p "test_*.py"` | < 3s |
| **Backend E2E Analytics** | Full API contract, math, edge cases, Excel audit | `python tests/test_backend_analytics_e2e.py` | < 5s |
| **Headless Brave CDP UI** | End-to-end browser automation, DOM, themes, charts | `python tests/test_ui_cockpit_cdp.py` | < 15s |
| **Unified Master Runner** | Runs all suites sequentially, exits 0 only on 100% pass | `python tests/run_all_tests.py` | < 25s |

---

## 5. Pass/Fail Criteria & Quality Gate

A test run is considered **PASS** if and only if all following criteria are met:
1. **Exit Code**: All test processes terminate with return code `0`.
2. **Assertion Failures**: Exactly `0` assertion errors across all unit and E2E test cases.
3. **Browser Console Health**: Exactly `0` uncaught JavaScript runtime exceptions logged during the CDP test session.
4. **Excel Integrity**: Generated `.xlsx` files parse cleanly through `openpyxl.load_workbook()` with all 4 expected sheets, non-empty header rows, and zero formula execution corruption.
5. **State Preservation**: The workstation DOM state (`selectedDocId` and form contents) matches pre-switch values verbatim after roundtrip navigation.
