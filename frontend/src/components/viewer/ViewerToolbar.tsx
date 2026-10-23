import React from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCw, 
  RotateCcw, 
  Contrast, 
  RefreshCw 
} from 'lucide-react';

interface ViewerToolbarProps {
  zoom: number;
  rotation: number;
  contrastBoost: boolean;
  isSavingRotation: boolean;
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
    <div className="absolute top-2.5 sm:top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-full px-2 sm:px-3 py-1.5 flex items-center space-x-1 sm:space-x-2 text-xs select-none shadow-2xl z-20 hover:bg-slate-900/95 hover:border-slate-600 transition-all max-w-[calc(100vw-16px)] sm:max-w-fit overflow-x-auto no-scrollbar touch-pan-x">
      <div className="flex items-center space-x-0.5 sm:space-x-1 shrink-0">
        <button
          type="button"
          onClick={onZoomOut}
          className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-full tactile-icon"
          title="Uzaklaştır (-)"
          aria-label="Uzaklaştır"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="px-2 py-1.5 min-h-[40px] min-w-[48px] flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg font-mono text-[11px] text-center tactile-btn"
          title="Orijinal Boyut (%100)"
          aria-label="Orijinal Boyut"
        >
          %{Math.round(safeZoom * 100)}
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-full tactile-icon"
          title="Yakınlaştır (+)"
          aria-label="Yakınlaştır"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-800 mx-0.5 sm:mx-1 shrink-0" />

        <button
          type="button"
          onClick={onFitToScreen}
          className="flex items-center space-x-1 px-2.5 py-1.5 min-h-[40px] min-w-[40px] justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg tactile-btn"
          title="Ekrana Sığdır (F)"
          aria-label="Ekrana Sığdır"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden sm:inline font-medium">Sığdır</span>
        </button>
      </div>

      <div className="flex items-center space-x-0.5 sm:space-x-1 bg-slate-950/60 border border-slate-800 px-1 py-0.5 rounded-lg shrink-0">
        <button
          type="button"
          onClick={onRotateCounterClockwise}
          disabled={isSavingRotation}
          className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-50 rounded tactile-icon"
          title="Sola 90° Döndür"
          aria-label="Sola 90° Döndür"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <span className="font-mono text-[11px] text-slate-400 px-1 min-w-[36px] text-center whitespace-nowrap flex items-center justify-center">
          {isSavingRotation ? (
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          ) : (
            `${safeRotation}°`
          )}
        </span>

        <button
          type="button"
          onClick={onRotateClockwise}
          disabled={isSavingRotation}
          className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-50 rounded tactile-icon"
          title="Sağa 90° Döndür (R)"
          aria-label="Sağa 90° Döndür"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center space-x-1 shrink-0">
        <button
          type="button"
          onClick={onToggleContrast}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 min-h-[40px] min-w-[40px] justify-center rounded-lg tactile-btn ${
            contrastBoost
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="Görüntü Kontrastı"
          aria-label="Görüntü Kontrastı"
        >
          <Contrast className="w-4 h-4" />
          <span className="hidden sm:inline font-medium">Kontrast {contrastBoost ? 'Açık' : ''}</span>
        </button>
      </div>
    </div>
  );
};

