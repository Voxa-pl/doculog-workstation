import React, { useState, useEffect, useRef, useMemo } from 'react';

interface ProgressiveTileRenderProps {
  isActive: boolean;
  onComplete?: () => void;
}

interface BucketPos {
  row: number;
  col: number;
}

/**
 * DocuLog - Roving Bucket Render Mimarisi (V-Ray / Cycles Canlı Kova Motoru)
 * 
 * - Evrak gizlenmez; ham spektral camın arkasında daima görünür kalır.
 * - 2 adet canlı gezen Render Kovası (Bucket 1 & Bucket 2)
 * - 180ms kadife sıçrama fiziği (cubic-bezier(0.16, 1, 0.3, 1))
 * - Asimptotik Organik İlerleme (Sabit sayaç YOK; 1s'de de 10s'de de canlı akar)
 * - 280ms optik fosfor ışıması (Phosphor Bloom & Light Bleed)
 * - Backend yanıtı anında tekil fotonik kristalizasyon dalgası
 */
export const ProgressiveTileRender: React.FC<ProgressiveTileRenderProps> = ({
  isActive,
  onComplete,
}) => {
  const [resolvedTiles, setResolvedTiles] = useState<Set<number>>(() => new Set());
  const [bloomingTiles, setBloomingTiles] = useState<Set<number>>(() => new Set());
  const [bucket1, setBucket1] = useState<BucketPos>({ row: 0, col: 0 });
  const [bucket2, setBucket2] = useState<BucketPos>({ row: 4, col: 0 });
  const [isFinishing, setIsFinishing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // 6x8 = 48 Karo için Serpentine Çözülme Dizilimi
  const { bucketAOrder, bucketBOrder } = useMemo(() => {
    const orderA: number[] = [];
    for (let r = 0; r < 4; r++) {
      const row = [];
      for (let c = 0; c < 6; c++) row.push(r * 6 + c);
      if (r % 2 === 1) row.reverse();
      orderA.push(...row);
    }

    const orderB: number[] = [];
    for (let r = 4; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 6; c++) row.push(r * 6 + c);
      if (r % 2 === 1) row.reverse();
      orderB.push(...row);
    }

    return { bucketAOrder: orderA, bucketBOrder: orderB };
  }, []);

  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const currentStepRef = useRef<number>(0);

  // 1. İşlem Başladığında / Sürdüğünde Asimptotik Fizik Motoru
  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      setIsFinishing(false);
      setResolvedTiles(new Set());
      setBloomingTiles(new Set());
      currentStepRef.current = 0;
      startTimeRef.current = performance.now();

      const tick = (now: number) => {
        const elapsedSec = (now - startTimeRef.current) / 1000;

        // Asimptotik Doğal İlerleme Eğrisi (0 - 1 arası)
        let progress = 0;
        if (elapsedSec <= 1.0) {
          // Faz 1: Hızlı İvmelenme (%0 -> %35)
          progress = 0.35 * (elapsedSec / 1.0);
        } else if (elapsedSec <= 3.5) {
          // Faz 2: Dengeli Gövde Analizi (%35 -> %80)
          progress = 0.35 + 0.45 * ((elapsedSec - 1.0) / 2.5);
        } else {
          // Faz 3: Asimptotik Canlı Kuyruk (%80 -> %96+) - Kovalar asla durmaz!
          progress = 0.80 + 0.17 * (1 - Math.exp(-(elapsedSec - 3.5) / 3.0));
        }

        // 24 çift adımda 48 karo (adım başı 2 karo)
        const targetStep = Math.min(23, Math.floor(progress * 24));

        if (targetStep > currentStepRef.current) {
          const newResolved: number[] = [];
          for (let s = currentStepRef.current; s <= targetStep; s++) {
            const tileA = bucketAOrder[s];
            const tileB = bucketBOrder[s];
            if (tileA !== undefined) newResolved.push(tileA);
            if (tileB !== undefined) newResolved.push(tileB);

            // Kova konumlarını güncelle
            if (tileA !== undefined) {
              setBucket1({ row: Math.floor(tileA / 6), col: tileA % 6 });
            }
            if (tileB !== undefined) {
              setBucket2({ row: Math.floor(tileB / 6), col: tileB % 6 });
            }
          }

          currentStepRef.current = targetStep;

          setBloomingTiles((prev) => {
            const next = new Set(prev);
            newResolved.forEach((t) => next.add(t));
            return next;
          });

          setResolvedTiles((prev) => {
            const next = new Set(prev);
            newResolved.forEach((t) => next.add(t));
            return next;
          });

          // 280ms sonra fosfor ışımasını söndür
          setTimeout(() => {
            setBloomingTiles((prev) => {
              const next = new Set(prev);
              newResolved.forEach((t) => next.delete(t));
              return next;
            });
          }, 280);
        }

        animFrameRef.current = requestAnimationFrame(tick);
      };

      animFrameRef.current = requestAnimationFrame(tick);

      return () => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
      };
    } else if (isVisible && !isFinishing) {
      // 2. Backend Yanıt Verdiği An: Hızlı Kristalizasyon Dalgası
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      setIsFinishing(true);

      // Kalan tüm karoları 180ms'de çöz
      const allTiles = new Set<number>();
      for (let i = 0; i < 48; i++) allTiles.add(i);
      setResolvedTiles(allTiles);

      const finishTimer = setTimeout(() => {
        setIsVisible(false);
        setIsFinishing(false);
        if (onComplete) onComplete();
      }, 240);

      return () => clearTimeout(finishTimer);
    }
  }, [isActive, isVisible, isFinishing, bucketAOrder, bucketBOrder, onComplete]);

  if (!isVisible) return null;

  return (
    <div className={`absolute inset-0 z-20 pointer-events-none select-none overflow-hidden rounded transition-opacity duration-240 ${
      isFinishing ? 'opacity-0' : 'opacity-100'
    }`}>
      {/* 1. 48 Karo Spektral Izgara */}
      <div className="w-full h-full tile-grid-container relative">
        {Array.from({ length: 48 }).map((_, idx) => {
          const isResolved = resolvedTiles.has(idx);
          const isBlooming = bloomingTiles.has(idx);

          return (
            <div
              key={idx}
              className={`render-tile ${isResolved ? 'resolved' : 'unresolved'} ${
                isBlooming ? 'tile-phosphor-bloom' : ''
              }`}
            />
          );
        })}

        {/* 2. Gezinen Render Kovası 1 (Bucket α - Üst Bölge) */}
        {!isFinishing && (
          <div
            className="roving-bucket roving-bucket-alpha"
            style={{
              left: `${(bucket1.col / 6) * 100}%`,
              top: `${(bucket1.row / 8) * 100}%`,
              width: `${(1 / 6) * 100}%`,
              height: `${(1 / 8) * 100}%`,
            }}
          >
            {/* L-Köşe Braketleri */}
            <span className="bucket-bracket bucket-bracket-tl" />
            <span className="bucket-bracket-tr" />
            <span className="bucket-bracket-bl" />
            <span className="bucket-bracket-br" />
            {/* Kova Kimliği & Örnekleyici Parıltı */}
            <div className="absolute top-0.5 left-0.5 px-1 py-0.2 bg-slate-950/80 rounded-br border-b border-r border-cyan-500/40 text-[8px] font-mono font-bold text-cyan-300 leading-none">
              B1
            </div>
            <div className="w-full h-full bucket-sampling-glow" />
          </div>
        )}

        {/* 3. Gezinen Render Kovası 2 (Bucket β - Alt Bölge) */}
        {!isFinishing && (
          <div
            className="roving-bucket roving-bucket-beta"
            style={{
              left: `${(bucket2.col / 6) * 100}%`,
              top: `${(bucket2.row / 8) * 100}%`,
              width: `${(1 / 6) * 100}%`,
              height: `${(1 / 8) * 100}%`,
            }}
          >
            {/* L-Köşe Braketleri */}
            <span className="bucket-bracket bucket-bracket-tl" />
            <span className="bucket-bracket-tr" />
            <span className="bucket-bracket-bl" />
            <span className="bucket-bracket-br" />
            {/* Kova Kimliği & Örnekleyici Parıltı */}
            <div className="absolute top-0.5 left-0.5 px-1 py-0.2 bg-slate-950/80 rounded-br border-b border-r border-cyan-500/40 text-[8px] font-mono font-bold text-cyan-300 leading-none">
              B2
            </div>
            <div className="w-full h-full bucket-sampling-glow" />
          </div>
        )}
      </div>
    </div>
  );
};
