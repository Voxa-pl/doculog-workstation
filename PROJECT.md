# Project: DocuLog Workstation — Executive Dashboard & Acceptance Reporting

## Architecture
DocuLog Workstation is a hybrid desktop-web logistics application combining a FastAPI backend (Python 3.13) and a React 19 + TypeScript + Vite + Tailwind CSS frontend served statically from `/`.

### Component Architecture & Data Flow
1. **Data Store**:
   - In-memory `DOCUMENT_STORE` in `backend/app/api/routes.py` tracks incoming, processing, completed, and approved waybills.
   - Physical attachments and thumbnails reside in `backend/uploads/`.
2. **Backend Analytics Engine (`backend/app/services/analytics_service.py`)**:
   - Aggregates waybill headers, company titles, items, and statuses.
   - Computes core KPIs: Total volume, approval rate %, line item counts/quantities, digitization speed.
   - Computes distributions: Time series trend, top suppliers by volume, top products by quantity/frequency, status & operational discrepancies.
   - Serviced via `GET /api/analytics`.
3. **Official Reporting Engine (`backend/app/services/excel_exporter.py`)**:
   - Produces corporate-styled, multi-sheet `.xlsx` reports (`Resmi_Mal_Kabul_Yonetici_Raporu.xlsx`) using `openpyxl`.
   - Serviced via `GET /api/analytics/export-report`.
4. **Frontend Executive Cockpit (`frontend/src/components/dashboard/`)**:
   - `ExecutiveDashboard.tsx`: Full-page view container with live filter controls, KPI cards, and chart grids.
   - `HeaderBar.tsx`: Segmented view toggle (`İrsaliye İstasyonu` <-> `Yönetici Kokpiti`) and theme selector dropdown (`Koyu Kurumsal`, `Gece Vardiyası`, `Açık Ofis`).
   - `App.tsx`: Preserves workstation state in DOM (`hidden` CSS toggle), retaining active document selection, queue filters, and zoom level across switches.
   - Interactive SVG Charts: Custom responsive SVG charts with hover tooltips and dynamic CSS variables matching all 3 themes.
5. **Testing Architecture**:
   - Backend unit tests via `python -m unittest discover -s backend/tests`.
   - Headless Brave CDP automated UI tests (`tests/test_ui_cockpit_cdp.py`) verifying DOM rendering, view switching, state preservation, charts, and theme contrast.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Backend Analytics Models & Calculation Service | Pydantic response models, mathematical aggregation of KPIs, time series, suppliers, top items, and discrepancy rates | M1 | ORIGINAL_REQUEST R3 |
| 2 | Backend Analytics & Export REST Endpoints | `GET /api/analytics` and `GET /api/analytics/export-report` with fast JSON and formatted Excel download | M1 | ORIGINAL_REQUEST R3, R4 |
| 3 | Executive Excel Multi-Sheet Report Exporter | Styled Excel export using `openpyxl` with KPI summary, supplier breakdown, top items, and audit ledger | M1 | ORIGINAL_REQUEST R4 |
| 4 | Backend Unit Test Suite | Automated `unittest` verifying calculation formulas, zero division guard, and API response validity | M1 | ORIGINAL_REQUEST A4, A5 |
| 5 | View Switcher with State Preservation | Top-bar segmented navigation toggle between Station and Cockpit preserving document queue and editor state | M2 | ORIGINAL_REQUEST R1, A1 |
| 6 | 4+ Core Logistic KPI Cards | Total Waybill Volume, Approval %, Total Processed Items, Average Digitization Speed with real values & progress/trends | M2 | ORIGINAL_REQUEST R1, A2 |
| 7 | Interactive Time Series Volume Trend Chart | Interactive SVG chart for daily/weekly document flow and received quantities with hover tooltips | M2 | ORIGINAL_REQUEST R2, A2 |
| 8 | Supplier / Vendor Delivery Distribution Chart | Interactive horizontal bar/distribution chart ranking top delivery companies with percentages | M2 | ORIGINAL_REQUEST R2, A2 |
| 9 | Top Product Items Ranking Chart | Interactive ranking chart displaying top received line items, units, and frequencies | M2 | ORIGINAL_REQUEST R2, A2 |
| 10 | Operational Status & Discrepancy Breakdown | Donut/distribution chart showing approval status and damaged/claimed delivery indicators | M2 | ORIGINAL_REQUEST R2 |
| 11 | Triple Theme System Integration | Seamless contrast and reactive styling across Koyu Kurumsal, Gece Vardiyası, and Açık Ofis themes | M2 | ORIGINAL_REQUEST R2, A3 |
| 12 | Empty State & Extreme Value Handling | Elegant zero-data placeholders and resilient rendering when queue is empty or has a single document | M2 | ORIGINAL_REQUEST A2 |
| 13 | One-Click Report Download UI Action | Header button triggering executive report download with feedback | M2 | ORIGINAL_REQUEST R4, A4 |
| 14 | E2E Test Infrastructure & Runner | Unified runner executing test suites and headless Brave CDP automation | E2E_TEST | ORIGINAL_REQUEST A5 |
| 15 | Headless CDP Browser UI Automation Suite | Automated browser tests validating view switching, state preservation, charts rendering, and theme switching | E2E_TEST | ORIGINAL_REQUEST A1-A5 |
| 16 | Full Acceptance & Adversarial Hardening | Comprehensive pass across Tier 1-4 tests followed by Tier 5 adversarial stress testing | M3 | ORIGINAL_REQUEST A1-A5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven test harness, Python API tests, and Headless Brave CDP UI test suite | none | IN_PROGRESS |
| M1 | Backend Analytics & Export Service | Pydantic models, analytics service, Excel executive report generator, routes, and unit tests | none | DONE |
| M2 | Executive Dashboard Frontend & Themes | React dashboard view, view switcher, KPI cards, 4 SVG charts, theme engine, and Vite build | none | DONE |
| M3 | Final E2E Pass & Adversarial Hardening | 100% pass of E2E test suite (Tiers 1-4) and Tier 5 adversarial coverage hardening | E2E, M1, M2 | PLANNED |

## Interface Contracts
### Backend `GET /api/analytics` Response Contract
```json
{
  "kpi": {
    "toplam_irsaliye_hacmi": 12,
    "tamamlanan_belge": 10,
    "onaylanan_belge": 8,
    "onay_orani_yuzde": 80.0,
    "toplam_islenen_kalem_adedi": 45,
    "toplam_islenen_miktar": 1420.5,
    "ortalama_dijitallesme_hizi_sn": 2.4
  },
  "zaman_serisi": [
    {
      "tarih": "12.10.2026",
      "evrak_sayisi": 5,
      "onaylanan_sayisi": 4,
      "toplam_miktar": 650.0,
      "kalem_sayisi": 20
    }
  ],
  "tedarikci_dagilimi": [
    {
      "unvan": "ABC Lojistik A.Ş.",
      "vkn": "1234567890",
      "evrak_sayisi": 4,
      "toplam_miktar": 520.0,
      "kalem_sayisi": 15,
      "pay_yuzde": 42.5
    }
  ],
  "en_cok_gelen_kalemler": [
    {
      "mal_hizmet": "Rulman 6204-2Z",
      "toplam_miktar": 300.0,
      "birim": "Adet",
      "frekans": 3
    }
  ],
  "durum_dagilimi": {
    "onaylandi": 8,
    "tamamlandi": 2,
    "kuyrukta": 2,
    "isleniyor": 0,
    "hata": 0,
    "uyusmazlik_sayisi": 1,
    "uyusmazlik_orani_yuzde": 8.3,
    "ortalama_guven_skoru": 0.94
  },
  "empty": false,
  "son_guncelleme": "12.10.2026 22:00:00"
}
```

### Backend `GET /api/analytics/export-report` Contract
- Headers: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="Resmi_Mal_Kabul_Yonetici_Raporu_<timestamp>.xlsx"`
- Workbook Structure:
  - Sheet 1: `Yonetici_Ozeti` (KPI table, operational statuses)
  - Sheet 2: `Tedarikci_Dagilimi` (Full supplier rankings)
  - Sheet 3: `En_Cok_Gelen_Kalemler` (Top item ranking)
  - Sheet 4: `Evrak_Dokumu` (Detailed document rows)

### Frontend View Navigation Contract
- State in `App.tsx`: `activeView: 'station' | 'dashboard'`
- DOM rendering: `BatchQueue`, `DocumentViewer`, and `DocumentEditor` container wrapped with `${activeView === 'station' ? 'flex' : 'hidden'}`.
- Dashboard rendered when `activeView === 'dashboard'`.
- Theme system: `data-theme="koyu-kurumsal" | "gece-vardiyasi" | "acik-ofis"` attached to `<html>` or `<div id="root">`.

## Code Layout
- Backend files:
  - `backend/app/models/analytics.py` (New)
  - `backend/app/services/analytics_service.py` (New)
  - `backend/app/services/excel_exporter.py` (Modified)
  - `backend/app/api/routes.py` (Modified)
  - `backend/tests/test_analytics.py` (New)
- Frontend files:
  - `frontend/src/types/irsaliye.ts` (Modified)
  - `frontend/src/services/api.ts` (Modified)
  - `frontend/src/index.css` (Modified)
  - `frontend/src/components/common/HeaderBar.tsx` (Modified)
  - `frontend/src/App.tsx` (Modified)
  - `frontend/src/components/dashboard/ExecutiveDashboard.tsx` (New)
  - `frontend/src/components/dashboard/KpiCard.tsx` (New)
  - `frontend/src/components/dashboard/charts/TimeSeriesChart.tsx` (New)
  - `frontend/src/components/dashboard/charts/SupplierDistributionChart.tsx` (New)
  - `frontend/src/components/dashboard/charts/TopItemsChart.tsx` (New)
  - `frontend/src/components/dashboard/charts/OperationalStatusChart.tsx` (New)
  - `frontend/src/components/dashboard/charts/EmptyChartState.tsx` (New)
  - `frontend/dist/*` (Built assets)
- Test files:
  - `tests/test_ui_cockpit_cdp.py` (New)
  - `TEST_INFRA.md` (New)
  - `TEST_READY.md` (New)
