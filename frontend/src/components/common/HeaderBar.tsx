import React, { useState, useRef, useEffect } from 'react';
import { 
  Truck, 
  FileSpreadsheet, 
  FileCode, 
  FileJson, 
  ChevronDown, 
  Sparkles, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Layers, 
  LayoutDashboard, 
  Palette, 
  Check, 
  QrCode,
  Menu,
  X,
  HardDriveDownload,
  Key,
  Download
} from 'lucide-react';
import { BatchSummary, ApiKeyStatus, AppTheme, AppView } from '../../types/irsaliye';
import { documentApi, systemApi } from '../../services/api';

interface HeaderBarProps {
  summary?: BatchSummary | null;
  apiKeyStatus: ApiKeyStatus | null;
  onOpenApiKeyModal: () => void;
  onOpenQrBridgeModal?: () => void;
  onProcessAll: () => void;
  onClearAll: () => void;
  onExportBatchExcel: () => void;
  isProcessingBatch: boolean;
  activeView?: AppView;
  onViewChange?: (view: AppView) => void;
  theme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  summary,
  apiKeyStatus,
  onOpenApiKeyModal,
  onOpenQrBridgeModal,
  onProcessAll,
  onClearAll,
  isProcessingBatch,
  activeView = 'station',
  onViewChange,
  theme = 'koyu-kurumsal',
  onThemeChange,
}) => {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  const safeSummary: BatchSummary = summary || {
    toplam_belge: 0,
    kuyrukta: 0,
    islenen: 0,
    tamamlanan: 0,
    hatali: 0,
    onaylanan: 0,
  };
  const totalCompleted = (safeSummary.tamamlanan || 0) + (safeSummary.onaylanan || 0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setIsExportOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 bg-theme-surface border-b border-theme-subtle px-3 sm:px-4 flex items-center justify-between select-none shrink-0 shadow-sm transition-colors duration-200 relative z-30 min-w-0">
      {/* Sol Kısım: Logo ve Görünüm Seçici */}
      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
        <div className="flex items-center space-x-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20 shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-xs sm:text-sm tracking-wide text-theme-primary">
              Waybill
            </h1>
          </div>
        </div>

        {/* Görünüm Seçici Segmented Toggle */}
        <div className="flex items-center bg-theme-card p-0.5 rounded-lg border border-theme-subtle text-xs font-medium shrink-0">
          <button
            type="button"
            data-testid="view-switcher-station"
            onClick={() => onViewChange?.('station')}
            className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md tactile-btn ${
              activeView === 'station'
                ? 'bg-blue-600 text-white shadow-sm font-semibold'
                : 'text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">İstasyon</span>
          </button>
          <button
            type="button"
            data-testid="view-switcher-cockpit"
            onClick={() => onViewChange?.('dashboard')}
            className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md tactile-btn ${
              activeView === 'dashboard'
                ? 'bg-blue-600 text-white shadow-sm font-semibold'
                : 'text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Kokpit</span>
          </button>
        </div>
      </div>

      {/* Orta Kısım: Operasyonel İrsaliye Sayaçları (Masaüstü) */}
      <div className="hidden lg:flex items-center space-x-3 bg-theme-card/60 border border-theme-subtle px-3 py-1.5 rounded-lg text-xs shrink-0">
        <div className="flex items-center space-x-1.5 text-theme-secondary">
          <Layers className="w-3.5 h-3.5 text-theme-muted" />
          <span>Toplam:</span>
          <span className="font-semibold text-theme-primary">{safeSummary.toplam_belge ?? 0}</span>
        </div>
        <div className="w-px h-3.5 bg-theme-subtle" />
        <div className="flex items-center space-x-1.5 text-amber-500">
          <Clock className="w-3.5 h-3.5" />
          <span>Kuyruk:</span>
          <span className="font-semibold">{safeSummary.kuyrukta ?? 0}</span>
        </div>
        <div className="w-px h-3.5 bg-theme-subtle" />
        <div className="flex items-center space-x-1.5 text-emerald-500">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Tamamlanan:</span>
          <span className="font-semibold">{totalCompleted}</span>
        </div>
      </div>

      {/* Sağ Kısım: Aksiyonlar & Menü */}
      <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
        {/* Tümünü İşle (Masaüstü & Mobil Hızlı Buton) */}
        <button
          type="button"
          onClick={onProcessAll}
          disabled={isProcessingBatch || (safeSummary.kuyrukta ?? 0) === 0}
          className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm shrink-0 tactile-btn"
        >
          {isProcessingBatch ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="hidden sm:inline">İşleniyor...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tümünü İşle</span>
            </>
          )}
        </button>

        {/* Çoklu Format Toplu Dışa Aktar */}
        <div className="relative hidden sm:block" ref={exportRef}>
          <button
            type="button"
            onClick={() => {
              if (totalCompleted > 0) {
                setIsExportOpen((prev) => !prev);
              }
            }}
            disabled={totalCompleted === 0}
            className="flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm tactile-btn-emerald"
            title="Dışa aktarma ve indirme seçenekleri (Excel, XML, JSON, Veritabanı Yedeği)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">İndir</span>
            <ChevronDown className="w-3 h-3 text-emerald-200" />
          </button>

          {isExportOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-theme-surface border border-theme-strong rounded-xl shadow-2xl z-40 p-1 space-y-0.5">
              <a
                href={documentApi.getBatchExcelUrl()}
                download
                onClick={() => setIsExportOpen(false)}
                className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-theme-primary hover:bg-theme-card-hover transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <span>Toplu Excel (.xlsx)</span>
              </a>
              <a
                href={documentApi.getBatchLogoXmlUrl()}
                download
                onClick={() => setIsExportOpen(false)}
                className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-theme-primary hover:bg-theme-card-hover transition-colors"
              >
                <FileCode className="w-3.5 h-3.5 text-blue-500" />
                <span>Logo XML (.xml)</span>
              </a>
              <a
                href={documentApi.getBatchJsonUrl()}
                download
                onClick={() => setIsExportOpen(false)}
                className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-theme-primary hover:bg-theme-card-hover transition-colors"
              >
                <FileJson className="w-3.5 h-3.5 text-amber-500" />
                <span>Standart JSON (.json)</span>
              </a>

              <div className="w-full h-px bg-theme-subtle my-1" />

              <button
                type="button"
                onClick={async () => {
                  setIsExportOpen(false);
                  setIsBackingUp(true);
                  try {
                    const res = await systemApi.createBackup();
                    if (res && res.filename) {
                      const link = document.createElement('a');
                      link.href = systemApi.getBackupDownloadUrl(res.filename);
                      link.download = res.filename;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                  } catch (e) {
                    console.error("Yedekleme hatası:", e);
                  } finally {
                    setIsBackingUp(false);
                  }
                }}
                disabled={isBackingUp}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-cyan-400 hover:bg-theme-card-hover transition-colors"
                title="Tek tıkla SQLite veritabanı, evrak görselleri ve SHA-256 sağlama yedeğini .tar.gz olarak indir"
              >
                <HardDriveDownload className={`w-3.5 h-3.5 ${isBackingUp ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
                <span className="font-medium">{isBackingUp ? 'Arşivleniyor...' : 'Ambar Veri Tabanı Yedeği (.tar.gz)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Telefondan Canlı Yükleme (Mobile QR Bridge) */}
        {onOpenQrBridgeModal && (
          <button
            type="button"
            onClick={onOpenQrBridgeModal}
            className="hidden md:flex items-center space-x-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary px-2.5 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle shadow-sm transition-all shrink-0"
            title="Telefondan Canlı Yükleme (Mobile QR Bridge)"
          >
            <QrCode className="w-3.5 h-3.5 text-blue-500" />
            <span>QR Bağla</span>
          </button>
        )}

        {/* API Anahtarı Yönetimi */}
        <button
          type="button"
          onClick={onOpenApiKeyModal}
          className="hidden md:flex items-center space-x-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary px-2.5 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle shadow-sm transition-all shrink-0"
          title="Google Gemini API Anahtarı Ayarları"
        >
          <Key className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden xl:inline">API Key</span>
          <span className={`w-1.5 h-1.5 rounded-full ${apiKeyStatus?.is_configured ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
        </button>

        {/* Tema Seçici Dropdown */}
        <div className="relative hidden md:block" ref={themeRef}>
          <button
            type="button"
            data-testid="theme-switcher-button"
            onClick={() => setIsThemeMenuOpen((prev) => !prev)}
            className="flex items-center space-x-1.5 px-2 py-1.5 text-xs font-medium text-theme-secondary hover:text-theme-primary bg-theme-card hover:bg-theme-card-hover border border-theme-subtle rounded-lg transition-all"
            title="Görünüm Teması"
          >
            <Palette className="w-3.5 h-3.5 text-amber-500" />
            <ChevronDown className="w-3 h-3 text-theme-muted" />
          </button>

          {isThemeMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-theme-surface border border-theme-strong rounded-xl shadow-2xl z-40 p-1 space-y-0.5">
              {[
                { id: 'koyu-kurumsal', label: 'Koyu Kurumsal' },
                { id: 'gece-vardiyasi', label: 'Gece Vardiyası' },
                { id: 'acik-ofis', label: 'Açık Ofis' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onThemeChange?.(t.id as AppTheme);
                    setIsThemeMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    theme === t.id
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-theme-primary hover:bg-theme-card-hover'
                  }`}
                >
                  <span>{t.label}</span>
                  {theme === t.id && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mobil Menü Butonu (Hamburger) */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-1.5 text-theme-secondary hover:text-theme-primary bg-theme-card border border-theme-subtle rounded-lg sm:hidden shrink-0"
        >
          {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobil Açılır Menü */}
      {isMobileMenuOpen && (
        <div className="absolute top-14 left-0 right-0 bg-theme-surface border-b border-theme-subtle p-3 space-y-2 sm:hidden shadow-2xl z-50">
          <div className="grid grid-cols-3 gap-2 text-center text-xs p-2 rounded-lg bg-theme-card border border-theme-subtle">
            <div>
              <div className="text-theme-muted text-[10px]">Toplam</div>
              <div className="font-bold text-theme-primary">{safeSummary.toplam_belge ?? 0}</div>
            </div>
            <div>
              <div className="text-amber-500 text-[10px]">Kuyrukta</div>
              <div className="font-bold text-amber-500">{safeSummary.kuyrukta ?? 0}</div>
            </div>
            <div>
              <div className="text-emerald-500 text-[10px]">Tamamlanan</div>
              <div className="font-bold text-emerald-500">{totalCompleted}</div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-1">
            <a
              href={documentApi.getBatchExcelUrl()}
              download
              className="flex items-center space-x-2 w-full p-2 rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Toplu Excel İndir (.xlsx)</span>
            </a>

            <button
              onClick={() => {
                onOpenApiKeyModal();
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center justify-between w-full p-2 rounded-lg bg-theme-card text-theme-primary text-xs font-medium border border-theme-subtle"
            >
              <span className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span>API Anahtarı Ayarları</span>
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${apiKeyStatus?.is_configured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {apiKeyStatus?.is_configured ? 'Tanımlı' : 'Eksik'}
              </span>
            </button>

            <button
              onClick={() => {
                onThemeChange?.(theme === 'koyu-kurumsal' ? 'acik-ofis' : 'koyu-kurumsal');
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center justify-between w-full p-2 rounded-lg bg-theme-card text-theme-primary text-xs font-medium border border-theme-subtle"
            >
              <span className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-amber-500" />
                <span>Tema Değiştir ({theme === 'koyu-kurumsal' ? 'Koyu' : 'Açık'})</span>
              </span>
            </button>

            {(safeSummary.toplam_belge ?? 0) > 0 && (
              <button
                onClick={() => {
                  onClearAll();
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center space-x-2 w-full p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium"
              >
                <Trash2 className="w-4 h-4" />
                <span>Kuyruğu Temizle</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
