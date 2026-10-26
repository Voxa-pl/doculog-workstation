import React, { useState, useEffect, useRef, useMemo } from 'react';

interface ProgressiveTileRenderProps {
  isActive: boolean;
  onComplete?: () => void;
}

interface BucketPos {
  row: number;
  col: number;
  touchdownId: number;
}

/**
 * DocuLog - Ultra-Kinetic Dual-Core Roving Bucket Render Engine
 * 
 * 1000x Daha Havalı & Sinematik Hareket Mimarisi:
 * 1. Motion Ghosting (110ms fotonik kova kuyruğu ve ivme izi)
 * 2. 120 FPS Micro Laser Raster Blade (Kovanın indiği karoda dikey lazer taraması)
 * 3. Mekansal Işık Difüzyonu (320ms komşu karolara taşan foton kanaması)
 * 4. Çift Çekirdekli Bağımsız Sensörler: S1 • HDR (Üstbilgi) & S2 • VTX (Kalem Matrisi)
 * 5. Global Anamorfik Diyafram Flaşı (340ms sinematik kilitlenme dalgası)
 * 6. Sıfır Reflow, 120 FPS kilitli GPU Compositor performansı
 */
export const ProgressiveTileRender: React.FC<ProgressiveTileRenderProps> = ({
  isActive,
  onComplete,
}) => {
  const [resolvedTiles, setResolvedTiles] = useState<Set<number>>(() => new Set());
  const [bloomingTiles, setBloomingTiles] = useState<Set<number>>(() => new Set());
  const [bucket1, setBucket1] = useState<BucketPos>({ row: 0, col: 0, touchdownId: 0 });
  const [bucket2, setBucket2] = useState<BucketPos>({ row: 4, col: 0, touchdownId: 0 });
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
  const touchdownCounterRef = useRef<number>(1);

  // 1. Asimptotik Organik İlerleme Motoru (Asymptotic Progress Engine)
  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      setIsFinishing(false);
      setResolvedTiles(new Set());
      setBloomingTiles(new Set());
      currentStepRef.current = 0;
      touchdownCounterRef.current = 1;
      startTimeRef.current = performance.now();

      const tick = (now: number) => {
        const elapsedSec = (now - startTimeRef.current) / 1000;

        // Logaritmik Doygunluk Eğrisi
        let progress = 0;
        if (elapsedSec <= 1.0) {
          // Faz 1: Hızlı Ön Algılama (%0 -> %35)
          progress = 0.35 * (elapsedSec / 1.0);
        } else if (elapsedSec <= 3.5) {
          // Faz 2: Dengeli Matris Taraması (%35 -> %80)
          progress = 0.35 + 0.45 * ((elapsedSec - 1.0) / 2.5);
        } else {
          // Faz 3: Asimptotik Canlı Kuyruk (%80 -> %96+) - Kovalar asla durmaz!
          progress = 0.80 + 0.17 * (1 - Math.exp(-(elapsedSec - 3.5) / 3.0));
        }

        const targetStep = Math.min(23, Math.floor(progress * 24));

        if (targetStep > currentStepRef.current) {
          const newResolved: number[] = [];
          touchdownCounterRef.current++;
          const currentTouchdown = touchdownCounterRef.current;

          for (let s = currentStepRef.current; s <= targetStep; s++) {
            const tileA = bucketAOrder[s];
            const tileB = bucketBOrder[s];
            if (tileA !== undefined) newResolved.push(tileA);
            if (tileB !== undefined) newResolved.push(tileB);

            if (tileA !== undefined) {
              setBucket1({
                row: Math.floor(tileA / 6),
                col: tileA % 6,
                touchdownId: currentTouchdown,
              });
            }
            if (tileB !== undefined) {
              setBucket2({
                row: Math.floor(tileB / 6),
                col: tileB % 6,
                touchdownId: currentTouchdown,
              });
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

          // 320ms sonra fosfor difüzyonunu söndür
          setTimeout(() => {
            setBloomingTiles((prev) => {
              const next = new Set(prev);
              newResolved.forEach((t) => next.delete(t));
              return next;
            });
          }, 320);
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
      // 2. Final Kristalizasyon Dalgası: Global Anamorfik Flaş
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      setIsFinishing(true);

      // Kalan tüm karoları çöz
      const allTiles = new Set<number>();
      for (let i = 0; i < 48; i++) allTiles.add(i);
      setResolvedTiles(allTiles);

      const finishTimer = setTimeout(() => {
        setIsVisible(false);
        setIsFinishing(false);
        if (onComplete) onComplete();
      }, 340);

      return () => clearTimeout(finishTimer);
    }
  }, [isActive, isVisible, isFinishing, bucketAOrder, bucketBOrder, onComplete]);

  if (!isVisible) return null;

  return (
    <div className={`absolute inset-0 z-20 pointer-events-none select-none overflow-hidden rounded transition-opacity duration-300 ${
      isFinishing ? 'pointer-events-none' : 'opacity-100'
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
            >
              {/* Çözülmemiş karo içinde mikro CAD topoğrafya artı işareti */}
              {!isResolved && (
                <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                  <span className="text-[7px] font-mono text-cyan-300 leading-none select-none">+</span>
                </div>
              )}
            </div>
          );
        })}

        {/* 2. Kovalar Arası Kuantum Lazer Vektörü (Inter-Bucket Optical Beam) */}
        {!isFinishing && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-24">
            <line
              x1={`${((bucket1.col + 0.5) / 6) * 100}%`}
              y1={`${((bucket1.row + 0.5) / 8) * 100}%`}
              x2={`${((bucket2.col + 0.5) / 6) * 100}%`}
              y2={`${((bucket2.row + 0.5) / 8) * 100}%`}
              stroke="url(#interBucketBeam)"
              strokeWidth="1.2"
              strokeDasharray="4 3"
              className="animate-pulse"
            />
            <defs>
              <linearGradient id="interBucketBeam" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.65" />
                <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.65" />
              </linearGradient>
            </defs>
          </svg>
        )}

        {/* 3. Sensör 1: α • LiDAR Aperture (Üstbilgi ve Belge Çekirdeği) */}
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
            {/* Hareket İzi / Hayalet Kuyruk (Motion Ghosting) */}
            <div className="bucket-motion-ghost" />
            
            {/* L-Köşe Hassasiyet Braketleri */}
            <span className="bucket-bracket bucket-bracket-tl" />
            <span className="bucket-bracket-tr" />
            <span className="bucket-bracket-bl" />
            <span className="bucket-bracket-br" />

            {/* Sensör Kimlik Rozeti & Canlı Koordinat Damgası */}
            <div className="absolute top-0.5 left-0.5 px-1 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-cyan-400/50 text-[7.5px] font-mono font-bold text-cyan-300 leading-none tracking-tight flex items-center space-x-1 shadow-sm">
              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping inline-block" />
              <span>α • [{bucket1.row}:{bucket1.col}]</span>
            </div>

            {/* Dikey Yüksek Hızlı Lazer Tarama Bıçağı (140ms Sweep) */}
            <div 
              key={`laser-1-${bucket1.touchdownId}`} 
              className="bucket-laser-blade" 
            />

            {/* Dönen Optik Hedefleme Artısı (Center Reticle) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-2.5 h-2.5 rounded-full border border-cyan-400/50 flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
                <div className="w-0.5 h-0.5 rounded-full bg-cyan-300 shadow-[0_0_4px_#38bdf8]" />
              </div>
            </div>

            {/* Kova Odak Parıltısı */}
            <div className="w-full h-full bucket-sampling-glow" />
          </div>
        )}

        {/* 4. Sensör 2: β • Matrix Aperture (Kalem Tablosu & Matris Analizcisi) */}
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
            {/* Hareket İzi / Hayalet Kuyruk (Motion Ghosting) */}
            <div className="bucket-motion-ghost bucket-motion-ghost-beta" />

            {/* L-Köşe Hassasiyet Braketleri */}
            <span className="bucket-bracket bucket-bracket-tl border-indigo-400" />
            <span className="bucket-bracket-tr border-indigo-400" />
            <span className="bucket-bracket-bl border-indigo-400" />
            <span className="bucket-bracket-br border-indigo-400" />

            {/* Sensör Kimlik Rozeti & Canlı Koordinat Damgası */}
            <div className="absolute top-0.5 left-0.5 px-1 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-indigo-400/50 text-[7.5px] font-mono font-bold text-indigo-300 leading-none tracking-tight flex items-center space-x-1 shadow-sm">
              <span className="w-1 h-1 rounded-full bg-indigo-400 animate-ping inline-block" />
              <span>β • [{bucket2.row}:{bucket2.col}]</span>
            </div>

            {/* Dikey Yüksek Hızlı Lazer Tarama Bıçağı (140ms Sweep) */}
            <div 
              key={`laser-2-${bucket2.touchdownId}`} 
              className="bucket-laser-blade bucket-laser-blade-beta" 
            />

            {/* Dönen Optik Hedefleme Artısı (Center Reticle) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-2.5 h-2.5 rounded-full border border-indigo-400/50 flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
                <div className="w-0.5 h-0.5 rounded-full bg-indigo-300 shadow-[0_0_4px_#818cf8]" />
              </div>
            </div>

            {/* Kova Odak Parıltısı */}
            <div className="w-full h-full bucket-sampling-glow bucket-sampling-glow-beta" />
          </div>
        )}

        {/* 5. Global Anamorfik Diyafram Flaşı & Şok Dalgası (Büyük Sinematik Kapanış) */}
        {isFinishing && (
          <div className="global-aperture-flash pointer-events-none">
            <div className="anamorphic-horizontal-flare" />
          </div>
        )}
      </div>
    </div>
  );
};
