import React from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCw, 
  RotateCcw, 
  Contrast, 
  RefreshCw,
  Crop
} from 'lucide-react';

interface ViewerToolbarProps {
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
    <div className="absolute top-2.5 sm:top-3 left-1/2 -translate-x-1/2 bg-theme-surface/90 backdrop-blur-md border border-theme-subtle rounded-full px-2 sm:px-3 py-1 flex items-center space-x-1 sm:space-x-2 text-xs select-none shadow-2xl z-20 hover:bg-theme-surface hover:border-theme-strong transition-all max-w-[calc(100vw-16px)] sm:max-w-fit overflow-x-auto no-scrollbar touch-pan-x">
      <div className="flex items-center space-x-0.5 sm:space-x-1 shrink-0">
        <button
          type="button"
          onClick={onZoomOut}
          className="p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card rounded-full tactile-icon"
          title="Uzaklaştır (-)"
          aria-label="Uzaklaştır"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="px-2 py-1 min-h-[34px] min-w-[44px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card rounded-md font-mono text-[11px] text-center tabular-nums tactile-btn"
          title="Orijinal Boyut (%100)"
          aria-label="Orijinal Boyut"
        >
          %{Math.round(safeZoom * 100)}
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          className="p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card rounded-full tactile-icon"
          title="Yakınlaştır (+)"
          aria-label="Yakınlaştır"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-theme-subtle mx-0.5 sm:mx-1 shrink-0" />

        <button
          type="button"
          onClick={onFitToScreen}
          className="flex items-center space-x-1 px-2 py-1 min-h-[34px] min-w-[34px] justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card rounded-md tactile-btn"
          title="Ekrana Sığdır (F)"
          aria-label="Ekrana Sığdır"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-medium text-[11px]">Sığdır</span>
        </button>
      </div>

      <div className="flex items-center space-x-0.5 sm:space-x-1 bg-theme-card border border-theme-subtle px-1 py-0.5 rounded-md shrink-0">
        <button
          type="button"
          onClick={onRotateCounterClockwise}
          disabled={isSavingRotation}
          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover disabled:opacity-50 rounded tactile-icon"
          title="Sola 90° Döndür"
          aria-label="Sola 90° Döndür"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <span className="font-mono text-[11px] text-theme-secondary px-1 min-w-[34px] text-center whitespace-nowrap flex items-center justify-center tabular-nums">
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
          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover disabled:opacity-50 rounded tactile-icon"
          title="Sağa 90° Döndür (R)"
          aria-label="Sağa 90° Döndür"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center space-x-1 shrink-0">
        <button
          type="button"
          onClick={onToggleContrast}
          className={`flex items-center space-x-1.5 px-2 py-1 min-h-[34px] min-w-[34px] justify-center rounded-md tactile-btn ${
            contrastBoost
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-card'
          }`}
          title="Görüntü Kontrastı"
          aria-label="Görüntü Kontrastı"
        >
          <Contrast className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-medium text-[11px]">Kontrast {contrastBoost ? 'Açık' : ''}</span>
        </button>

        {onDeskew && (
          <button
            type="button"
            onClick={onDeskew}
            disabled={isDeskewing || isSavingRotation}
            className="flex items-center space-x-1 px-2 py-1 min-h-[34px] min-w-[34px] justify-center text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 border border-cyan-800/40 rounded-md tactile-btn disabled:opacity-50"
            title="Evrak Eğikliğini / Perspektifini Düzelt (Auto Deskew)"
            aria-label="Eğikliği Düzelt"
          >
            {isDeskewing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <Crop className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline font-medium text-[11px]">Düzelt</span>
          </button>
        )}
      </div>
    </div>
  );
};

