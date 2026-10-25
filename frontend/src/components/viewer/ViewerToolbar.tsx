import React from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCw, 
  RotateCcw, 
  Contrast, 
  RefreshCw,
  Crop,
  ChevronLeft,
  ChevronRight,
  FileText
} from 'lucide-react';

interface ViewerToolbarProps {
  fileName?: string;
  activePageIndex?: number;
  totalPages?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  zoom: number;
  rotation: number;
  contrastBoost: boolean;
  isSavingRotation: boolean;
  isDeskewing?: boolean;
  onDeskew?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onResetZoom: () => void;
  onRotateClockwise: () => void;
  onRotateCounterClockwise: () => void;
  onToggleContrast: () => void;
  onPersistRotation?: () => void;
}

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  fileName,
  activePageIndex = 0,
  totalPages = 1,
  onPrevPage,
  onNextPage,
  zoom,
  rotation,
  contrastBoost,
  isSavingRotation,
  isDeskewing = false,
  onDeskew,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onResetZoom,
  onRotateClockwise,
  onRotateCounterClockwise,
  onToggleContrast,
}) => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const safeRotation = Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0;

  return (
    <header className="h-12 border-b border-theme-subtle bg-theme-surface/95 px-3 sm:px-4 flex items-center justify-between shrink-0 select-none z-10 min-w-0 gap-2">
      {/* Sol: Evrak Adı ve Çok Sayfalı Gezinti */}
      <div className="flex items-center space-x-2 min-w-0">
        <FileText className="w-4 h-4 text-theme-muted shrink-0" />
        <span 
          className="text-xs font-semibold text-theme-primary truncate max-w-[110px] xs:max-w-[160px] sm:max-w-[200px] md:max-w-[240px]" 
          title={fileName || 'Evrak Önizleme'}
        >
          {fileName || 'Evrak Önizleme'}
        </span>

        {totalPages > 1 && (
          <div className="flex items-center space-x-1 bg-theme-card border border-theme-subtle rounded-md px-1 py-0.5 shrink-0 ml-1">
            <button
              type="button"
              disabled={activePageIndex === 0}
              onClick={onPrevPage}
              className="p-1 min-w-[26px] min-h-[26px] flex items-center justify-center text-theme-muted hover:text-theme-primary disabled:opacity-30 rounded transition-colors active:scale-95"
              title="Önceki Sayfa"
              aria-label="Önceki Sayfa"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[10px] text-theme-secondary font-medium px-1 tabular-nums whitespace-nowrap">
              {activePageIndex + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={activePageIndex === totalPages - 1}
              onClick={onNextPage}
              className="p-1 min-w-[26px] min-h-[26px] flex items-center justify-center text-theme-muted hover:text-theme-primary disabled:opacity-30 rounded transition-colors active:scale-95"
              title="Sonraki Sayfa"
              aria-label="Sonraki Sayfa"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Sağ: Yakınlaştırma, Döndürme, Kontrast ve Düzeltme Kontrolleri */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0 text-xs">
        {/* Yakınlaştırma Grubu */}
        <div className="flex items-center space-x-0.5 shrink-0">
          <button
            type="button"
            onClick={onZoomOut}
            className="p-1 min-w-[28px] min-h-[28px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card rounded transition-colors"
            title="Uzaklaştır (-)"
            aria-label="Uzaklaştır"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onResetZoom}
            className="px-1.5 py-1 min-h-[28px] min-w-[40px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card rounded font-mono text-[11px] text-center tabular-nums transition-colors"
            title="Orijinal Boyut (%100)"
            aria-label="Orijinal Boyut"
          >
            %{Math.round(safeZoom * 100)}
          </button>

          <button
            type="button"
            onClick={onZoomIn}
            className="p-1 min-w-[28px] min-h-[28px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card rounded transition-colors"
            title="Yakınlaştır (+)"
            aria-label="Yakınlaştır"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onFitToScreen}
            className="flex items-center space-x-1 px-2 py-1 min-h-[28px] justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card rounded transition-colors"
            title="Ekrana Sığdır (F)"
            aria-label="Ekrana Sığdır"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium text-[11px]">Sığdır</span>
          </button>
        </div>

        <div className="w-px h-4 bg-theme-subtle mx-0.5 shrink-0" />

        {/* Döndürme Grubu */}
        <div className="flex items-center space-x-0.5 bg-theme-card border border-theme-subtle px-1 py-0.5 rounded shrink-0">
          <button
            type="button"
            onClick={onRotateCounterClockwise}
            disabled={isSavingRotation}
            className="p-1 min-w-[26px] min-h-[26px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover disabled:opacity-50 rounded transition-colors"
            title="Sola 90° Döndür"
            aria-label="Sola 90° Döndür"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono text-[11px] text-theme-secondary px-1 min-w-[32px] text-center whitespace-nowrap flex items-center justify-center tabular-nums">
            {isSavingRotation ? (
              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
            ) : (
              `${safeRotation}°`
            )}
          </span>

          <button
            type="button"
            onClick={onRotateClockwise}
            disabled={isSavingRotation}
            className="p-1 min-w-[26px] min-h-[26px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover disabled:opacity-50 rounded transition-colors"
            title="Sağa 90° Döndür (R)"
            aria-label="Sağa 90° Döndür"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Araçlar: Kontrast & Düzelt */}
        <div className="flex items-center space-x-1 shrink-0">
          <button
            type="button"
            onClick={onToggleContrast}
            className={`flex items-center space-x-1 px-2 py-1 min-h-[28px] justify-center rounded transition-colors ${
              contrastBoost
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-card border border-transparent'
            }`}
            title="Görüntü Kontrastını Güçlendir"
            aria-label="Görüntü Kontrastı"
          >
            <Contrast className="w-3.5 h-3.5" />
            <span className="hidden md:inline font-medium text-[11px]">Kontrast</span>
          </button>

          {onDeskew && (
            <button
              type="button"
              onClick={onDeskew}
              disabled={isDeskewing || isSavingRotation}
              className="flex items-center space-x-1 px-2 py-1 min-h-[28px] justify-center text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 border border-cyan-800/40 rounded transition-colors disabled:opacity-50"
              title="Evrak Eğikliğini / Perspektifini Düzelt (Auto Deskew)"
              aria-label="Eğikliği Düzelt"
            >
              {isDeskewing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <Crop className="w-3.5 h-3.5" />
              )}
              <span className="hidden md:inline font-medium text-[11px]">Düzelt</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
