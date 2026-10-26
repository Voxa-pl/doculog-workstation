import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DocumentItem } from '../../types/irsaliye';
import { ViewerToolbar } from './ViewerToolbar';
import { ProgressiveTileRender } from './ProgressiveTileRender';
import { documentApi } from '../../services/api';
import { 
  FileQuestion, 
  Sparkles, 
  Layers, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';

interface DocumentViewerProps {
  document: DocumentItem | null;
  onRotatePersist: (derece: number, sayfaIndeksi?: number) => Promise<void>;
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
  const [isDeskewing, setIsDeskewing] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fitZoomRef = useRef<number>(1);
  const zoomRef = useRef<number>(1);
  zoomRef.current = zoom;
  const rotationRef = useRef<number>(0);
  rotationRef.current = rotation;

  const prevDocIdRef = useRef<string | null>(null);
  const pendingDeltaRef = useRef<number>(0);
  const persistTimeoutRef = useRef<number | null>(null);

  // Multi-touch gestures ref
  const touchStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    initialDistance: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    centerClient: { x: number; y: number };
  } | null>(null);

  // Double tap detection ref
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const [imageVersion, setImageVersion] = useState(() => Date.now());

  const pages = document?.sayfalar && document.sayfalar.length > 0 
    ? document.sayfalar 
    : (document ? [document.dosya_url] : []);
  const rawImageUrl = pages[activePageIndex] || document?.dosya_url;
  const currentImageUrl = rawImageUrl ? `${rawImageUrl}${rawImageUrl.includes('?') ? '&' : '?'}t=${imageVersion}` : '';

  const handleFitToScreen = useCallback((overrideRotation?: number) => {
    if (!containerRef.current || !imageRef.current) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const isMobile = rect.width < 640;
    const paddingX = isMobile ? 16 : 40;
    const paddingY = isMobile ? 40 : 40;

    const containerWidth = Math.max(rect.width - paddingX, 40);
    const containerHeight = Math.max(rect.height - paddingY, 40);

    const imgNaturalWidth = imageRef.current.naturalWidth || 800;
    const imgNaturalHeight = imageRef.current.naturalHeight || 1100;

    const currentRot = overrideRotation !== undefined ? overrideRotation : rotationRef.current;
    const normalizedRot = ((Math.round(currentRot) % 360) + 360) % 360;
    const isRotated90 = normalizedRot === 90 || normalizedRot === 270;
    const effectiveWidth = isRotated90 ? imgNaturalHeight : imgNaturalWidth;
    const effectiveHeight = isRotated90 ? imgNaturalWidth : imgNaturalHeight;

    const scaleX = effectiveWidth > 0 ? containerWidth / effectiveWidth : 1;
    const scaleY = effectiveHeight > 0 ? containerHeight / effectiveHeight : 1;
    const rawFit = Math.min(scaleX, scaleY);
    const fitScale = Number.isFinite(rawFit) && rawFit > 0 ? rawFit : 1;

    fitZoomRef.current = fitScale;
    setZoom(fitScale);
    setPan({ x: 0, y: 0 });
  }, []);

  // Recalculate fit on container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      // Sadece kullanıcı zaten yaklaşık varsayılan sığdırma (fit) modundaysa yeniden hesapla;
      // operatörün manuel zoom odağını koru
      const isAtDefaultFit = Math.abs(zoomRef.current - fitZoomRef.current) < 0.08;
      if (isAtDefaultFit) {
        handleFitToScreen();
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [handleFitToScreen]);

  // Flush pending rotation to backend disk
  const flushPendingRotation = useCallback(async () => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }

    const delta = pendingDeltaRef.current;
    if (!delta || delta % 360 === 0) {
      pendingDeltaRef.current = 0;
      return;
    }

    let netDelta = ((delta % 360) + 360) % 360;
    if (netDelta === 270) netDelta = -90;
    if (netDelta === 0) {
      pendingDeltaRef.current = 0;
      return;
    }

    pendingDeltaRef.current = 0;
    setIsSavingRotation(true);
    try {
      await onRotatePersist(netDelta, activePageIndex);
    } catch (err) {
      console.error('Rotasyon kaydetme hatası:', err);
      pendingDeltaRef.current += netDelta;
    } finally {
      setIsSavingRotation(false);
    }
  }, [onRotatePersist, activePageIndex]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, []);

  // Belge değişimi denetimi: Yalnızca farklı bir belgeye geçildiğinde görünümü sıfırla
  useEffect(() => {
    if (document) {
      const isNewDoc = document.id !== prevDocIdRef.current;
      if (isNewDoc) {
        if (pendingDeltaRef.current && pendingDeltaRef.current % 360 !== 0) {
          flushPendingRotation();
        }
        prevDocIdRef.current = document.id;
        setRotation(0);
        rotationRef.current = 0;
        setActivePageIndex(0);
        setPan({ x: 0, y: 0 });
        pendingDeltaRef.current = 0;
        setImageVersion(document.guncellenme_ts || Date.now());
        if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
          handleFitToScreen(0);
        }
      }
    }
  }, [document?.id, flushPendingRotation, handleFitToScreen]);

  // Sayfa değiştirme işleyicisi (Çok sayfalı irsaliyeler için)
  const handlePageChange = async (newPageIndex: number) => {
    if (newPageIndex === activePageIndex) return;
    await flushPendingRotation();
    setActivePageIndex(newPageIndex);
    setRotation(0);
    rotationRef.current = 0;
    setPan({ x: 0, y: 0 });
    setTimeout(() => handleFitToScreen(0), 40);
  };

  useEffect(() => {
    if (onZoomChange) {
      onZoomChange(zoom);
    }
  }, [zoom, onZoomChange]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + Math.max(prev * 0.25, 0.05), 5));
  };

  const handleZoomOut = () => {
    const minAllowed = Math.min(fitZoomRef.current * 0.3, 0.05);
    setZoom((prev) => Math.max(prev - Math.max(prev * 0.25, 0.05), minAllowed));
  };

  const handleResetZoom = () => {
    if (Math.abs(zoom - 1) < 0.02) {
      handleFitToScreen();
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  const handleRotate = (deltaDegrees: number) => {
    if (!document) return;

    // 1. Sürekli ve kesintisiz ileri rotasyon (asla geriye sarmaz, zıplamaz)
    const nextRotation = rotation + deltaDegrees;
    setRotation(nextRotation);
    rotationRef.current = nextRotation;

    // 2. Yeni yönelime göre ekran sığdırmayı eşzamanlı dönüştür (tek GPU transform animasyonu)
    handleFitToScreen(nextRotation);

    // 3. Arka plan disk kaydı için açıyı biriktir
    pendingDeltaRef.current += deltaDegrees;

    // 4. 600ms debounce ile kullanıcı döndürmeyi bitirince diske yaz
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }
    persistTimeoutRef.current = window.setTimeout(() => {
      flushPendingRotation();
    }, 600);
  };

  const handleRotateClockwise = () => handleRotate(90);
  const handleRotateCounterClockwise = () => handleRotate(-90);

  const handleDeskew = async () => {
    if (!document || isDeskewing) return;
    setIsDeskewing(true);
    try {
      await flushPendingRotation();
      await documentApi.deskewDocument(document.id);
      const nextVersion = Date.now();
      setImageVersion(nextVersion);
      setRotation(0);
      rotationRef.current = 0;
      handleFitToScreen(0);
    } catch (err) {
      console.error('Deskew failed:', err);
    } finally {
      setIsDeskewing(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    const minAllowed = Math.min(fitZoomRef.current * 0.3, 0.05);
    setZoom((prev) => Math.min(Math.max(prev * factor, minAllowed), 5));
  };

  const handleDoubleTap = useCallback((clientX?: number, clientY?: number) => {
    const fit = fitZoomRef.current;
    if (zoom <= fit * 1.35) {
      const targetZoom = Math.min(Math.max(fit * 2.5, 1.2), 4.5);
      if (clientX !== undefined && clientY !== undefined && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const tapX = clientX - rect.left - rect.width / 2;
        const tapY = clientY - rect.top - rect.height / 2;
        const ratio = targetZoom / zoom;
        const targetPanX = tapX - (tapX - pan.x) * ratio;
        const targetPanY = tapY - (tapY - pan.y) * ratio;
        setZoom(targetZoom);
        setPan({ x: targetPanX, y: targetPanY });
      } else {
        setZoom(targetZoom);
      }
    } else {
      handleFitToScreen();
    }
  }, [zoom, pan, handleFitToScreen]);

  // Touch gesture handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();
      const timeDiff = now - lastTapRef.current.time;
      const dist = Math.hypot(
        touch.clientX - lastTapRef.current.x,
        touch.clientY - lastTapRef.current.y
      );

      if (timeDiff < 300 && dist < 35) {
        e.preventDefault();
        handleDoubleTap(touch.clientX, touch.clientY);
        lastTapRef.current = { time: 0, x: 0, y: 0 };
        touchStartRef.current = null;
        return;
      }

      lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        panX: pan.x,
        panY: pan.y,
        initialDistance: 0,
        initialZoom: zoom,
        initialPan: { ...pan },
        centerClient: { x: touch.clientX, y: touch.clientY },
      };
      setIsDragging(true);
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const initialDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const centerClient = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };

      touchStartRef.current = {
        x: centerClient.x,
        y: centerClient.y,
        panX: pan.x,
        panY: pan.y,
        initialDistance,
        initialZoom: zoom,
        initialPan: { ...pan },
        centerClient,
      };
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    if (e.touches.length === 1 && touchStartRef.current.initialDistance === 0) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      setPan({
        x: touchStartRef.current.panX + dx,
        y: touchStartRef.current.panY + dy,
      });
    } else if (e.touches.length === 2 && touchStartRef.current.initialDistance > 0) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (currentDistance <= 0) return;

      const scaleFactor = currentDistance / touchStartRef.current.initialDistance;
      const baseZoom = touchStartRef.current.initialZoom;
      const minAllowed = Math.min(fitZoomRef.current * 0.3, 0.05);
      const maxAllowed = 5;
      const newZoom = Math.min(Math.max(baseZoom * scaleFactor, minAllowed), maxAllowed);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const pinchCenterX = touchStartRef.current.centerClient.x - rect.left - rect.width / 2;
        const pinchCenterY = touchStartRef.current.centerClient.y - rect.top - rect.height / 2;
        const zoomRatio = newZoom / baseZoom;
        const newPanX = pinchCenterX - (pinchCenterX - touchStartRef.current.initialPan.x) * zoomRatio;
        const newPanY = pinchCenterY - (pinchCenterY - touchStartRef.current.initialPan.y) * zoomRatio;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      } else {
        setZoom(newZoom);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      touchStartRef.current = null;
      setIsDragging(false);
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        panX: pan.x,
        panY: pan.y,
        initialDistance: 0,
        initialZoom: zoom,
        initialPan: { ...pan },
        centerClient: { x: touch.clientX, y: touch.clientY },
      };
    }
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
        e.preventDefault();
        handleRotate(90);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleFitToScreen();
      } else if (e.key === '+') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFitToScreen, rotation]);

  const safePanX = Number.isFinite(pan.x) ? pan.x : 0;
  const safePanY = Number.isFinite(pan.y) ? pan.y : 0;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const safeRotation = Number.isFinite(rotation) ? rotation : 0;

  return (
    <main className="flex-1 h-full bg-theme-app flex flex-col min-w-0 select-none relative overflow-hidden">
      {document ? (
        <ViewerToolbar
          fileName={document.dosya_adi}
          activePageIndex={activePageIndex}
          totalPages={pages.length}
          onPrevPage={() => handlePageChange(Math.max(0, activePageIndex - 1))}
          onNextPage={() => handlePageChange(Math.min(pages.length - 1, activePageIndex + 1))}
          zoom={safeZoom}
          rotation={safeRotation}
          contrastBoost={contrastBoost}
          isSavingRotation={isSavingRotation}
          isDeskewing={isDeskewing}
          onDeskew={handleDeskew}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitToScreen={() => handleFitToScreen()}
          onResetZoom={handleResetZoom}
          onRotateClockwise={handleRotateClockwise}
          onRotateCounterClockwise={handleRotateCounterClockwise}
          onToggleContrast={() => setContrastBoost((p) => !p)}
        />
      ) : (
        <header className="h-12 border-b border-theme-subtle bg-theme-surface/95 px-4 flex items-center shrink-0 select-none">
          <span className="text-xs font-semibold text-theme-muted uppercase tracking-wider">
            Evrak Önizleme Masası
          </span>
        </header>
      )}

      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={(e) => handleDoubleTap(e.clientX, e.clientY)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`flex-1 w-full h-full relative overflow-hidden flex items-center justify-center touch-none select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ touchAction: 'none' }}
      >
        {!document ? (
          <div className="flex flex-col items-center justify-center text-center p-8 select-none">
            <FileQuestion className="w-10 h-10 stroke-[1.2] mb-2 text-theme-muted/40" />
            <p className="text-xs font-medium text-theme-muted">Belge Bekleniyor</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`select-none will-change-transform flex items-center justify-center pointer-events-auto relative ${
                isDragging ? 'viewer-canvas-direct' : 'viewer-canvas-smooth'
              }`}
              style={{
                transform: `translate3d(${safePanX}px, ${safePanY}px, 0) scale(${safeZoom}) rotate(${safeRotation}deg)`,
                transformOrigin: 'center center',
              }}
            >
              <img
                ref={imageRef}
                src={currentImageUrl}
                alt={document.dosya_adi}
                onLoad={() => handleFitToScreen()}
                className={`max-w-none shadow-2xl rounded border border-slate-800/80 transition-all ${
                  contrastBoost
                    ? 'contrast-[140%] brightness-[105%] filter saturate-[90%]'
                    : ''
                } ${isProcessing ? 'viewer-doc-processing' : ''}`}
                style={{ pointerEvents: 'none' }}
                draggable={false}
              />
              {/* Progressive Tile Render (Kare Kare V-Ray / Cycles stili netleşme) */}
              <ProgressiveTileRender isActive={isProcessing} />
            </div>
          </div>
        )}

        {/* Minimal Linear Üst İlerleme Çizgisi (Discrete & Quiet) */}
        {isProcessing && (
          <div className="linear-progress-track">
            <div className="linear-progress-rail" />
          </div>
        )}
      </div>
    </main>
  );
};

