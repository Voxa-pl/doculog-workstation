import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DocumentItem } from '../../types/irsaliye';
import { ViewerToolbar } from './ViewerToolbar';
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
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fitZoomRef = useRef<number>(1);
  const rotationRef = useRef<number>(0);
  rotationRef.current = rotation;

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

    // Mobile safe paddings: 16px horizontal, 64px vertical to clear toolbar/pill
    const isMobile = rect.width < 640;
    const paddingX = isMobile ? 16 : 40;
    const paddingY = isMobile ? 64 : 56;

    const containerWidth = Math.max(rect.width - paddingX, 40);
    const containerHeight = Math.max(rect.height - paddingY, 40);

    const imgNaturalWidth = imageRef.current.naturalWidth || 800;
    const imgNaturalHeight = imageRef.current.naturalHeight || 1100;

    const currentRot = overrideRotation !== undefined ? overrideRotation : rotationRef.current;
    const isRotated90 = (Math.abs(currentRot) % 180) !== 0;
    const effectiveWidth = isRotated90 ? imgNaturalHeight : imgNaturalWidth;
    const effectiveHeight = isRotated90 ? imgNaturalWidth : imgNaturalHeight;

    const scaleX = effectiveWidth > 0 ? containerWidth / effectiveWidth : 1;
    const scaleY = effectiveHeight > 0 ? containerHeight / effectiveHeight : 1;
    // Fit image cleanly within the container bounds without premature clamping
    const rawFit = Math.min(scaleX, scaleY);
    const fitScale = Number.isFinite(rawFit) && rawFit > 0 ? rawFit : 1;

    fitZoomRef.current = fitScale;
    setZoom(fitScale);
    setPan({ x: 0, y: 0 });
  }, []);

  // Recalculate fit on container resize or orientation change
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      handleFitToScreen();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [handleFitToScreen]);

  useEffect(() => {
    if (document) {
      setRotation(0);
      rotationRef.current = 0;
      setActivePageIndex(0);
      setPan({ x: 0, y: 0 });
      if (document.guncellenme_ts) {
        setImageVersion(document.guncellenme_ts);
      } else {
        setImageVersion(Date.now());
      }
      if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
        handleFitToScreen(0);
      }
    }
  }, [document?.id, document?.guncellenme_ts, handleFitToScreen]);

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

  const handleRotate = async (deltaDegrees: number) => {
    if (!document || isSavingRotation) return;

    setIsSavingRotation(true);

    // 1. Optimistic CSS rotasyonu: Anında dönme ve ekran sığdırma
    const newCssRotation = (rotation + deltaDegrees + 360) % 360;
    setRotation(newCssRotation);
    rotationRef.current = newCssRotation;
    handleFitToScreen(newCssRotation);

    try {
      // 2. Backend Pillow ile diske kaydetme
      await onRotatePersist(deltaDegrees, activePageIndex);

      // 3. Cache-buster zaman damgalı URL
      const nextVersion = Date.now();
      const baseRawUrl = pages[activePageIndex] || document.dosya_url;
      const sep = baseRawUrl.includes('?') ? '&' : '?';
      const cacheBustedUrl = `${baseRawUrl}${sep}t=${nextVersion}`;

      // 4. Görseli arkaplanda önbelleğe al (Flash/Snap-back engelleme)
      await new Promise<void>((resolve) => {
        const preloadImg = new window.Image();
        preloadImg.onload = () => resolve();
        preloadImg.onerror = () => resolve();
        preloadImg.src = cacheBustedUrl;
      });

      // 5. Kesintisiz geçiş (Handoff):
      // Yeni fiziksel görsel zaten diske döndürülmüş olduğundan, CSS açısını sıfırlarken
      // transition animasyonunu anlık olarak kapatıp görseli takas ediyoruz.
      setIsHandingOff(true);
      const normalizedRotation = (newCssRotation - deltaDegrees + 360) % 360;
      setRotation(normalizedRotation);
      rotationRef.current = normalizedRotation;
      setImageVersion(nextVersion);

      // 6. Yeni boyutlara göre ekran sığdırmayı otomatik güncelle
      requestAnimationFrame(() => {
        setIsHandingOff(false);
        handleFitToScreen(normalizedRotation);
      });
    } catch (err) {
      console.error('Döndürme hatası:', err);
      // Hata durumunda optimistik rotasyonu geri al
      const reverted = (rotation - deltaDegrees + 360) % 360;
      setRotation(reverted);
      rotationRef.current = reverted;
      handleFitToScreen(reverted);
    } finally {
      setIsSavingRotation(false);
    }
  };

  const handleRotateClockwise = () => handleRotate(90);
  const handleRotateCounterClockwise = () => handleRotate(-90);

  const handleDeskew = async () => {
    if (!document || isDeskewing) return;
    setIsDeskewing(true);
    try {
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
  }, [handleFitToScreen, rotation, isSavingRotation]);

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
          onPrevPage={() => setActivePageIndex((p) => Math.max(0, p - 1))}
          onNextPage={() => setActivePageIndex((p) => Math.min(pages.length - 1, p + 1))}
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
                isHandingOff || isDragging ? 'viewer-canvas-direct' : 'viewer-canvas-smooth'
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
              {/* Doğal ve minimalist cam filtre (İşlem esnasında hafif sükunet) */}
              {isProcessing && (
                <div className="absolute inset-0 pointer-events-none rounded bg-slate-950/15 backdrop-blur-[0.5px] transition-opacity duration-300" />
              )}
            </div>
          </div>
        )}

        {/* Minimal Linear Üst İlerleme Çizgisi (Discrete & Quiet) */}
        {isProcessing && (
          <div className="linear-progress-track">
            <div className="linear-progress-rail" />
          </div>
        )}

        {/* Sade & Rafine Durum Rozeti (Apple/Linear Minimal) */}
        {isProcessing && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-full px-3.5 py-1.5 flex items-center space-x-2 shadow-tactile z-30 select-none pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse shrink-0" />
            <span className="text-xs font-medium text-zinc-300 tracking-tight">
              Ayrıştırılıyor...
            </span>
          </div>
        )}
      </div>
    </main>
  );
};

