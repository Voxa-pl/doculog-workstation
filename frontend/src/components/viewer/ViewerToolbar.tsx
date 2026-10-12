import React from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCw, 
  RotateCcw, 
  Contrast, 
  Save, 
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
  onPersistRotation: () => void;
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
  onPersistRotation,
}) => {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-full px-3 py-1 flex items-center space-x-2 text-xs select-none shadow-2xl z-20 hover:bg-slate-900/95 hover:border-slate-600 transition-all">
      <div className="flex items-center space-x-1">
        <button
          onClick={onZoomOut}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="Uzaklaştır (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={onResetZoom}
          className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded font-mono text-[11px] min-w-[50px] text-center transition-colors"
          title="Orijinal Boyut (%100)"
        >
          %{Math.round(zoom * 100)}
        </button>

        <button
          onClick={onZoomIn}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="Yakınlaştır (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-800 mx-1" />

        <button
          onClick={onFitToScreen}
          className="flex items-center space-x-1 px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="Ekrana Sığdır (F)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Sığdır</span>
        </button>
      </div>

      <div className="flex items-center space-x-1 bg-slate-950/60 border border-slate-800 px-1 py-0.5 rounded-lg">
        <button
          onClick={onRotateCounterClockwise}
          className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="Sola 90° Döndür"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <span className="font-mono text-[11px] text-slate-400 px-1.5">
          {rotation}°
        </span>

        <button
          onClick={onRotateClockwise}
          className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="Sağa 90° Döndür (R)"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        {rotation !== 0 && (
          <button
            onClick={onPersistRotation}
            disabled={isSavingRotation}
            className="flex items-center space-x-1 text-[10px] bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white px-1.5 py-0.5 rounded ml-1 transition-all"
            title="Döndürmeyi kalıcı olarak kaydet"
          >
            {isSavingRotation ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            <span>Kaydet</span>
          </button>
        )}
      </div>

      <div className="flex items-center space-x-1">
        <button
          onClick={onToggleContrast}
          className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ${
            contrastBoost
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="Görüntü Kontrastı"
        >
          <Contrast className="w-3.5 h-3.5" />
          <span>Kontrast {contrastBoost ? 'Açık' : ''}</span>
        </button>
      </div>
    </div>
  );
};
