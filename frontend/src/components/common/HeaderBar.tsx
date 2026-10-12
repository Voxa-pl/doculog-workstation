import React, { useState, useRef, useEffect } from 'react';
import { 
  Truck, 
  FileSpreadsheet, 
  FileCode,
  FileJson,
  ChevronDown,
  Sparkles, 
  Settings, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Layers,
  LayoutDashboard,
  Palette,
  Check,
  QrCode
} from 'lucide-react';
import { BatchSummary, ApiKeyStatus, AppTheme, AppView } from '../../types/irsaliye';
import { documentApi } from '../../services/api';

interface HeaderBarProps {
  summary: BatchSummary;
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
  onExportBatchExcel,
  isProcessingBatch,
  activeView = 'station',
  onViewChange,
  theme = 'koyu-kurumsal',
  onThemeChange,
}) => {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const totalCompleted = summary.tamamlanan + summary.onaylanan;

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
    <header className="h-14 bg-theme-surface border-b border-theme-subtle px-4 flex items-center justify-between select-none shrink-0 shadow-sm transition-colors duration-200">
      {/* Sol Kısım: Logo, Başlık ve Görünüm Değiştirici */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-theme-primary">
              DocuLog Workstation
            </h1>
          </div>
        </div>

        {/* Görünüm Seçici Segmented Toggle */}
        <div className="flex items-center bg-theme-card p-0.5 rounded-lg border border-theme-subtle text-xs font-medium">
          <button
            type="button"
            data-testid="view-switcher-station"
            onClick={() => onViewChange?.('station')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-all ${
              activeView === 'station'
                ? 'bg-blue-600 text-white shadow-sm font-semibold'
                : 'text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>İrsaliye İstasyonu</span>
          </button>
          <button
            type="button"
            data-testid="view-switcher-cockpit"
            onClick={() => onViewChange?.('dashboard')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-all ${
              activeView === 'dashboard'
                ? 'bg-blue-600 text-white shadow-sm font-semibold'
                : 'text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Yönetici Kokpiti</span>
          </button>
        </div>
      </div>

      {/* Orta Kısım: Operasyonel İrsaliye Sayaçları */}
      <div className="hidden xl:flex items-center space-x-3 bg-theme-card/60 border border-theme-subtle px-3 py-1.5 rounded-lg text-xs">
        <div className="flex items-center space-x-1.5 text-theme-secondary">
          <Layers className="w-3.5 h-3.5 text-theme-muted" />
          <span>Toplam:</span>
          <span className="font-semibold text-theme-primary">{summary.toplam_belge}</span>
        </div>
        <div className="w-px h-3.5 bg-theme-subtle" />
        <div className="flex items-center space-x-1.5 text-amber-500">
          <Clock className="w-3.5 h-3.5" />
          <span>Kuyrukta:</span>
          <span className="font-semibold">{summary.kuyrukta}</span>
        </div>
        <div className="w-px h-3.5 bg-theme-subtle" />
        <div className="flex items-center space-x-1.5 text-emerald-500">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Tamamlanan:</span>
          <span className="font-semibold">{totalCompleted}</span>
        </div>
      </div>

      {/* Sağ Kısım: Aksiyonlar, Tema Seçici ve Ayarlar */}
      <div className="flex items-center space-x-2">
        {/* Telefondan Canlı Yükleme (Mobile QR Bridge) */}
        {onOpenQrBridgeModal && (
          <button
            type="button"
            onClick={onOpenQrBridgeModal}
            className="hidden sm:flex items-center space-x-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary px-2.5 py-1.5 rounded-md text-xs font-medium border border-theme-subtle shadow-sm transition-all"
            title="Telefondan Canlı Yükleme (Mobile QR Bridge)"
          >
            <QrCode className="w-3.5 h-3.5 text-blue-500" />
            <span>Telefondan Tara (QR)</span>
          </button>
        )}

        {/* Tümünü İşle */}
        <button
          type="button"
          onClick={onProcessAll}
          disabled={isProcessingBatch || summary.kuyrukta === 0}
          className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all"
        >
          {isProcessingBatch ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>İşleniyor...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tümünü İşle</span>
            </>
          )}
        </button>

        {/* Çoklu Format Toplu Dışa Aktar */}
        <div className="relative" ref={exportRef}>
          <button
            type="button"
            onClick={() => {
              if (totalCompleted > 0) {
                setIsExportOpen((prev) => !prev);
              }
            }}
            disabled={totalCompleted === 0}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel İndir (.xlsx)</span>
            <ChevronDown className="w-3 h-3 text-emerald-200" />
          </button>

          {isExportOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-theme-surface border border-theme-strong rounded-lg shadow-2xl z-40 p-1 space-y-0.5">
              <a
                href={documentApi.getBatchExcelUrl()}
                download
                onClick={() => setIsExportOpen(false)}
                className="flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-theme-primary hover:bg-theme-card-hover transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <span>Toplu Excel (.xlsx)</span>
              </a>
              <a
                href={documentApi.getBatchLogoXmlUrl()}
                download
                onClick={() => setIsExportOpen(false)}
                className="flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-theme-primary hover:bg-theme-card-hover transition-colors"
              >
                <FileCode className="w-3.5 h-3.5 text-blue-500" />
                <span>Logo XML (.xml)</span>
              </a>
              <a
                href={documentApi.getBatchJsonUrl()}
                download
                onClick={() => setIsExportOpen(false)}
                className="flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-theme-primary hover:bg-theme-card-hover transition-colors"
              >
                <FileJson className="w-3.5 h-3.5 text-amber-500" />
                <span>Standart JSON (.json)</span>
              </a>
            </div>
          )}
        </div>

        {summary.toplam_belge > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="p-1.5 text-theme-muted hover:text-rose-400 hover:bg-theme-card rounded-md transition-colors"
            title="Kuyruğu Temizle"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <div className="w-px h-4 bg-theme-subtle mx-1" />

        {/* Tema Seçici Dropdown */}
        <div className="relative" ref={themeRef}>
          <button
            type="button"
            data-testid="theme-switcher-button"
            onClick={() => setIsThemeMenuOpen((prev) => !prev)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium text-theme-secondary hover:text-theme-primary bg-theme-card hover:bg-theme-card-hover border border-theme-subtle rounded-md transition-all shadow-sm"
            title="Görünüm Teması Değiştir"
            aria-label="Görünüm Teması"
          >
            <Palette className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden md:inline">
              {theme === 'gece-vardiyasi' ? 'Gece Vardiyası' : theme === 'acik-ofis' ? 'Açık Ofis' : 'Koyu Kurumsal'}
            </span>
            <ChevronDown className="w-3 h-3 text-theme-muted" />
          </button>

          {isThemeMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-theme-surface border border-theme-strong rounded-lg shadow-2xl z-50 p-1 space-y-0.5">
              <button
                type="button"
                data-testid="theme-option-koyu-kurumsal"
                onClick={() => {
                  onThemeChange?.('koyu-kurumsal');
                  setIsThemeMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                  theme === 'koyu-kurumsal'
                    ? 'bg-blue-600/20 text-blue-500 font-semibold'
                    : 'text-theme-primary hover:bg-theme-card-hover'
                }`}
              >
                <span className="flex items-center space-x-2">
                  <span>🌙</span>
                  <span>Koyu Kurumsal</span>
                </span>
                {theme === 'koyu-kurumsal' && <Check className="w-3.5 h-3.5 text-blue-500" />}
              </button>

              <button
                type="button"
                data-testid="theme-option-gece-vardiyasi"
                onClick={() => {
                  onThemeChange?.('gece-vardiyasi');
                  setIsThemeMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                  theme === 'gece-vardiyasi'
                    ? 'bg-amber-500/20 text-amber-500 font-semibold'
                    : 'text-theme-primary hover:bg-theme-card-hover'
                }`}
              >
                <span className="flex items-center space-x-2">
                  <span>⚡</span>
                  <span>Gece Vardiyası</span>
                </span>
                {theme === 'gece-vardiyasi' && <Check className="w-3.5 h-3.5 text-amber-500" />}
              </button>

              <button
                type="button"
                data-testid="theme-option-acik-ofis"
                onClick={() => {
                  onThemeChange?.('acik-ofis');
                  setIsThemeMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                  theme === 'acik-ofis'
                    ? 'bg-blue-600/20 text-blue-500 font-semibold'
                    : 'text-theme-primary hover:bg-theme-card-hover'
                }`}
              >
                <span className="flex items-center space-x-2">
                  <span>☀️</span>
                  <span>Açık Ofis</span>
                </span>
                {theme === 'acik-ofis' && <Check className="w-3.5 h-3.5 text-blue-500" />}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenApiKeyModal}
          className={`p-2 rounded-md transition-all ${
            apiKeyStatus?.is_configured
              ? 'text-theme-muted hover:text-theme-primary hover:bg-theme-card'
              : 'text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
          }`}
          title="Ayarlar"
          aria-label="Ayarlar"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
