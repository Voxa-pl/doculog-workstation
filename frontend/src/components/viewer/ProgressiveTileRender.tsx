import React, { useState, useEffect, useMemo } from 'react';

interface ProgressiveTileRenderProps {
  isActive: boolean;
  durationMs?: number; // Varsayılan 3200ms (Gerçek OCR modu)
  onComplete?: () => void;
}

/**
 * DocuLog - Progressive Tile Render (V-Ray / Blender Cycles Kova Stili Çözümleme)
 * 
 * - 6 Sütun x 8 Satır = 48 Karo Izgarası
 * - Dual-Bucket Serpentine Traversal (Üst ve alt yarıda çalışan 2 eşzamanlı render kovası)
 * - 160ms cubic-bezier(0.16, 1, 0.3, 1) kadife maske kalkışı
 * - 120ms 1px Beyaz -> Camgöbeği anlık fotonik kilitlenme flaşı
 * - 0 Canvas, 0 Layout Thrashing, 120 FPS GPU Compositor mimarisi
 */
export const ProgressiveTileRender: React.FC<ProgressiveTileRenderProps> = ({
  isActive,
  durationMs = 3200,
  onComplete,
}) => {
  const [resolvedTiles, setResolvedTiles] = useState<Set<number>>(() => new Set());
  const [flashingTiles, setFlashingTiles] = useState<Set<number>>(() => new Set());
  const [activeBuckets, setActiveBuckets] = useState<[number, number]>([-1, -1]);

  // 6x8 = 48 Karo için Dual-Bucket Serpentine Çözülme Dizilimi
  const traversalOrder = useMemo(() => {
    // Kova A: Üst 4 satır (0 - 23 arası) kıvrımlı yılan (serpentine)
    const bucketA: number[] = [];
    for (let r = 0; r < 4; r++) {
      const row = [];
      for (let c = 0; c < 6; c++) row.push(r * 6 + c);
      if (r % 2 === 1) row.reverse();
      bucketA.push(...row);
    }

    // Kova B: Alt 4 satır (24 - 47 arası) kıvrımlı yılan (serpentine)
    const bucketB: number[] = [];
    for (let r = 4; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 6; c++) row.push(r * 6 + c);
      if (r % 2 === 1) row.reverse();
      bucketB.push(...row);
    }

    // İki kovayı eşzamanlı harmanla (Dual-Thread Interleaving)
    const combined: number[] = [];
    for (let i = 0; i < 24; i++) {
      combined.push(bucketA[i]);
      combined.push(bucketB[i]);
    }
    return combined;
  }, []);

  useEffect(() => {
    if (!isActive) {
      setResolvedTiles(new Set());
      setFlashingTiles(new Set());
      setActiveBuckets([-1, -1]);
      return;
    }

    let isMounted = true;
    const intervalTime = Math.max(16, Math.floor(durationMs / 24)); // 24 adımda 48 karo (adım başı 2 karo)
    let step = 0;

    const timer = setInterval(() => {
      if (!isMounted) return;

      if (step >= 24) {
        clearInterval(timer);
        setActiveBuckets([-1, -1]);
        if (onComplete) onComplete();
        return;
      }

      const tileA = traversalOrder[step * 2];
      const tileB = traversalOrder[step * 2 + 1];

      setActiveBuckets([tileA, tileB]);
      setFlashingTiles((prev) => new Set(prev).add(tileA).add(tileB));
      setResolvedTiles((prev) => new Set(prev).add(tileA).add(tileB));

      // 120ms sonra parıltı söner
      setTimeout(() => {
        if (!isMounted) return;
        setFlashingTiles((prev) => {
          const next = new Set(prev);
          next.delete(tileA);
          next.delete(tileB);
          return next;
        });
      }, 120);

      step++;
    }, intervalTime);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isActive, durationMs, traversalOrder, onComplete]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none overflow-hidden rounded">
      {/* 48 Karo CSS Grid Izgarası */}
      <div className="w-full h-full tile-grid-container">
        {Array.from({ length: 48 }).map((_, idx) => {
          const isResolved = resolvedTiles.has(idx);
          const isFlashing = flashingTiles.has(idx);
          const isBucketActive = activeBuckets[0] === idx || activeBuckets[1] === idx;

          return (
            <div
              key={idx}
              className={`render-tile ${isResolved ? 'resolved' : ''} ${
                isFlashing ? 'tile-flash-active' : ''
              }`}
            >
              {/* Aktif Kova Köşe Çerçevesi (Bucket Brackets) */}
              {isBucketActive && !isResolved && (
                <>
                  <div className="bucket-bracket bucket-bracket-tl" />
                  <div className="bucket-bracket-tr" />
                  <div className="bucket-bracket-bl" />
                  <div className="bucket-bracket-br" />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
