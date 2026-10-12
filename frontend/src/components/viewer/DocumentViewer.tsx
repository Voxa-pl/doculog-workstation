import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DocumentItem } from '../../types/irsaliye';
import { ViewerToolbar } from './ViewerToolbar';
import { 
  FileQuestion, 
  Sparkles, 
  Loader2, 
  Layers, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';

interface DocumentViewerProps {
  document: DocumentItem | null;
  onRotatePersist: (derece: number) => Promise<void>;
  onProcessDoc: (id: string) => void;
  isProcessing: boolean;
  onZoomChange?: (zoom: number) => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  onRotatePersist,
  onProcessDoc,
  isProcessing,
  onZoomChange,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [contrastBoost, setContrastBoost] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSavingRotation, setIsSavingRotation] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const pages = document?.sayfalar && document.sayfalar.length > 0 
    ? document.sayfalar 
    : (document ? [document.dosya_url] : []);
  const currentImageUrl = pages[activePageIndex] || document?.dosya_url;

  useEffect(() => {
    if (document) {
      setRotation(document.donus_acisi || 0);
      setActivePageIndex(0);
      handleFitToScreen();
    }
  }, [document?.id]);

  useEffect(() => {
    if (onZoomChange) {
      onZoomChange(zoom);
    }
  }, [zoom, onZoomChange]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.2));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current || !imageRef.current) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const containerWidth = containerRef.current.clientWidth - 40;
    const containerHeight = containerRef.current.clientHeight - 40;
    const imgNaturalWidth = imageRef.current.naturalWidth || 800;
    const imgNaturalHeight = imageRef.current.naturalHeight || 1100;

    const isRotated90 = rotation % 180 !== 0;
    const effectiveWidth = isRotated90 ? imgNaturalHeight : imgNaturalWidth;
    const effectiveHeight = isRotated90 ? imgNaturalWidth : imgNaturalHeight;

    const scaleX = containerWidth / effectiveWidth;
    const scaleY = containerHeight / effectiveHeight;
    const fitScale = Math.min(scaleX, scaleY, 1.2);

    setZoom(Math.max(fitScale, 0.3));
    setPan({ x: 0, y: 0 });
  }, [rotation]);

  const handleRotateClockwise = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateCounterClockwise = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };

  const handlePersistRotation = async () => {
    setIsSavingRotation(true);
    try {
      await onRotatePersist(rotation);
    } finally {
      setIsSavingRotation(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom((prev) => Math.min(Math.max(prev + zoomDelta, 0.2), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (window.document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;


      if (e.key === 'r' || e.key === 'R') {
        handleRotateClockwise();
      } else if (e.key === 'f' || e.key === 'F') {
        handleFitToScreen();
      } else if (e.key === '+') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFitToScreen]);

  return (
    <main className="flex-1 h-full bg-slate-950 flex flex-col min-w-0 select-none relative overflow-hidden">
      {document && (
        <ViewerToolbar
          zoom={zoom}
          rotation={rotation}
          contrastBoost={contrastBoost}
          isSavingRotation={isSavingRotation}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitToScreen={handleFitToScreen}
          onResetZoom={handleResetZoom}
          onRotateClockwise={handleRotateClockwise}
          onRotateCounterClockwise={handleRotateCounterClockwise}
          onToggleContrast={() => setContrastBoost((p) => !p)}
          onPersistRotation={handlePersistRotation}
        />
      )}

      {/* Çok Sayfalı İrsaliye Sayfa Gezgini (Yüzen Hap) */}
      {document && pages.length > 1 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md border border-purple-500/40 rounded-full px-3 py-1 flex items-center space-x-2 text-xs select-none z-20 shadow-xl">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-purple-300 font-semibold flex items-center">
              <Layers className="w-3.5 h-3.5 mr-1 text-purple-400" />
              <span>Çok Sayfalı İrsaliye</span>
            </span>
            <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
              <button
                disabled={activePageIndex === 0}
                onClick={() => setActivePageIndex((p) => Math.max(0, p - 1))}
                className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                title="Önceki Sayfa"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] text-slate-200 px-1.5 font-medium">
                Sayfa {activePageIndex + 1} / {pages.length}
              </span>
              <button
                disabled={activePageIndex === pages.length - 1}
                onClick={() => setActivePageIndex((p) => Math.min(pages.length - 1, p + 1))}
                className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                title="Sonraki Sayfa"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {pages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActivePageIndex(idx)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  activePageIndex === idx
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 w-full h-full relative overflow-hidden flex items-center justify-center ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {!document ? (
          <div className="flex flex-col items-center justify-center text-center p-8 select-none">
            <FileQuestion className="w-10 h-10 stroke-[1.2] mb-2 text-slate-700/50" />
            <p className="text-xs font-medium text-slate-500">Belge Bekleniyor</p>
          </div>
        ) : (
          <div
            className="transition-transform duration-75 ease-out select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <img
              ref={imageRef}
              src={currentImageUrl}
              alt={document.dosya_adi}
              onLoad={handleFitToScreen}
              className={`max-w-none shadow-2xl rounded border border-slate-800 transition-all ${
                contrastBoost
                  ? 'contrast-[140%] brightness-[105%] filter saturate-[90%]'
                  : ''
              }`}
              style={{ pointerEvents: 'none' }}
            />
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 z-20">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <div className="flex items-center space-x-2 text-blue-300 text-xs font-medium">
              <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
              <span>İrsaliye Alanları Ayrıştırılıyor...</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
