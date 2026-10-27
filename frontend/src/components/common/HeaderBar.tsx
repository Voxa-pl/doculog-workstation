import React, { useState, useRef, useEffect } from 'react';
import { 
  Truck, 
  FileSpreadsheet, 
  FileCode, 
  FileJson, 
  ChevronDown, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Layers, 
  LayoutDashboard, 
  Menu, 
  X, 
  HardDriveDownload, 
  Download, 
  Settings,
  Play 
} from 'lucide-react';
import { BatchSummary, ApiKeyStatus, AppView } from '../../types/irsaliye';
import { documentApi, systemApi } from '../../services/api';

interface HeaderBarProps {
  summary?: BatchSummary | null;
  apiKeyStatus: ApiKeyStatus | null;
  onOpenSettings: (tab?: 'gorunum' | 'ai' | 'veri' | 'cihazlar') => void;
  onProcessAll: () => void;
  isProcessingBatch: boolean;
  activeView?: AppView;
  onViewChange?: (view: AppView) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  summary,
  apiKeyStatus,
  onOpenSettings,
  onProcessAll,
  isProcessingBatch,
  activeView = 'station',
  onViewChange,
}) => {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

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
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 bg-theme-surface border-b border-theme-subtle px-3 sm:px-4 flex items-center justify-between select-none shrink-0 shadow-sm transition-colors duration-200 relative z-30 min-w-0">
      
      {/* Sol Kısım: Logo ve Görünüm Seçici (İstasyon vs Kokpit) */}
      <div className="flex items-center space-x-2 sm:space-x-3.5 min-w-0">
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

      {/* Orta Kısım: Sadeleştirilmiş Operasyonel Sayaçlar */}
      <div className="hidden md:flex items-center space-x-3 bg-theme-card/60 border border-theme-subtle px-3 py-1 rounded-lg text-xs shrink-0 font-medium">
        <div className="flex items-center space-x-1.5 text-amber-500">
          <Clock className="w-3.5 h-3.5" />
          <span>Kuyruk:</span>
          <span className="font-bold">{safeSummary.kuyrukta ?? 0}</span>
        </div>
        <div className="w-px h-3 bg-theme-subtle" />
        <div className="flex items-center space-x-1.5 text-emerald-500">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Tamamlanan:</span>
          <span className="font-bold">{totalCompleted}</span>
        </div>
      </div>

      {/* Sağ Kısım: Yalınlaştırılmış Aksiyonlar */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        
        {/* Tümünü İşle */}
        <button
          type="button"
          onClick={onProcessAll}
          disabled={isProcessingBatch || (safeSummary.kuyrukta ?? 0) === 0}
          className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm shrink-0 tactile-btn"
        >
          {isProcessingBatch ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="hidden sm:inline">İşleniyor...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Tümünü İşle</span>
            </>
          )}
        </button>

        {/* Çoklu Format Toplu Dışa Aktar / İndir */}
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
            title="Dışa aktarma ve indirme seçenekleri (Excel, XML, JSON, Yedek)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">İndir</span>
            <ChevronDown className="w-3 h-3 text-emerald-200" />
          </button>

          {isExportOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-theme-surface border border-theme-strong rounded-xl shadow-2xl z-40 p-1 space-y-0.5 animate-in fade-in-50 zoom-in-95">
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
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-cyan-400 hover:bg-theme-card-hover transition-colors text-left"
                title="Tek tıkla SQLite veritabanı, evrak görselleri ve SHA-256 sağlama yedeğini .tar.gz olarak indir"
              >
                <HardDriveDownload className={`w-3.5 h-3.5 ${isBackingUp ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
                <span className="font-medium">{isBackingUp ? 'Arşivleniyor...' : 'Veritabanı Yedeği (.tar.gz)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Tek ve Net "Ayarlar" Butonu (Tüm karmaşayı içeride çözer) */}
        <button
          type="button"
          onClick={() => onOpenSettings()}
          className="flex items-center space-x-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-theme-subtle shadow-xs transition-all shrink-0 active:scale-95"
          title="İstasyon & Sistem Ayarları (Çalışma Alanı, Tema, AI, Veri Bakımı, QR)"
        >
          <Settings className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Ayarlar</span>
          {apiKeyStatus && !apiKeyStatus.is_configured && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" title="API Anahtarı Eksik" />
          )}
        </button>

        {/* Mobil Menü Butonu */}
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
        <div className="absolute top-14 left-0 right-0 bg-theme-surface border-b border-theme-subtle p-3 space-y-2 sm:hidden shadow-2xl z-50 animate-in slide-in-from-top-2">
          <div className="grid grid-cols-2 gap-2 text-center text-xs p-2 rounded-lg bg-theme-card border border-theme-subtle">
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
            <button
              onClick={() => {
                onOpenSettings();
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center justify-between w-full p-2.5 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20 text-xs font-semibold"
            >
              <span className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span>İstasyon Ayarları</span>
              </span>
              <span className="text-[10px] text-theme-muted">Düzen, AI, Veri</span>
            </button>

            {totalCompleted > 0 && (
              <a
                href={documentApi.getBatchExcelUrl()}
                download
                className="flex items-center space-x-2 w-full p-2.5 rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Toplu Excel İndir (.xlsx)</span>
              </a>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
