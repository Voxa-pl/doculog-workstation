import React, { useState, useEffect, useRef, useMemo } from 'react';

interface ProgressiveTileRenderProps {
  isActive: boolean;
  onComplete?: () => void;
}

interface BucketPos {
  row: number;
  col: number;
  xPct: number;
  yPct: number;
  touchdownId: number;
}

const COLS = 10;
const ROWS = 14;
const TOTAL_TILES = COLS * ROWS; // 140 Mikro-Karo

/**
 * 10 Sütun x 14 Satır = 140 Mikro-Karo için Salyangoz Kabuğu (Inward Nautilus G-Spiral) Algoritması
 * Dış çeperden başlayarak saat yönünde (Clockwise Inward Vortex) 5 konsantrik halka halinde merkeze iner.
 */
function generateInwardSpiralOrder(rows: number, cols: number): number[] {
  const result: number[] = new Array(rows * cols);
  let idx = 0;
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;

  while (top <= bottom && left <= right) {
    // 1. Üst Kenar: Soldan Sağa
    for (let c = left; c <= right; c++) result[idx++] = top * cols + c;
    top++;

    // 2. Sağ Kenar: Yukarıdan Aşağıya
    for (let r = top; r <= bottom; r++) result[idx++] = r * cols + right;
    right--;

    // 3. Alt Kenar: Sağdan Sola
    if (top <= bottom) {
      for (let c = right; c >= left; c--) result[idx++] = bottom * cols + c;
      bottom--;
    }

    // 4. Sol Kenar: Aşağıdan Yukarıya
    if (left <= right) {
      for (let r = bottom; r >= top; r--) result[idx++] = r * cols + left;
      left++;
    }
  }

  return result;
}

export const ProgressiveTileRender: React.FC<ProgressiveTileRenderProps> = ({
  isActive,
  onComplete,
}) => {
  const [resolvedTiles, setResolvedTiles] = useState<Set<number>>(() => new Set());
  const [bloomingTiles, setBloomingTiles] = useState<Set<number>>(() => new Set());
  const [isFinishing, setIsFinishing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // 140 Karolu Salyangoz Sarmalı Dizilimi (O(1) useMemo Önbelleği)
  const spiralOrder = useMemo(() => generateInwardSpiralOrder(ROWS, COLS), []);

  // 4'lü Kuantum Kova Filosu (α: Cyan, β: Indigo, γ: Emerald, δ: Amber)
  const [bucketAlpha, setBucketAlpha] = useState<BucketPos>({ row: 0, col: 0, xPct: 5, yPct: 3.57, touchdownId: 0 });
  const [bucketBeta, setBucketBeta] = useState<BucketPos>({ row: 0, col: 0, xPct: 5, yPct: 3.57, touchdownId: 0 });
  const [bucketGamma, setBucketGamma] = useState<BucketPos>({ row: 0, col: 0, xPct: 5, yPct: 3.57, touchdownId: 0 });
  const [bucketDelta, setBucketDelta] = useState<BucketPos>({ row: 0, col: 0, xPct: 5, yPct: 3.57, touchdownId: 0 });

  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const currentStepRef = useRef<number>(0);
  const touchdownCounterRef = useRef<number>(1);

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

        // Asimptotik Organik İlerleme Eğrisi (1s - 8s Canlı İlerleme)
        let progress = 0;
        if (elapsedSec <= 0.9) {
          // Faz 1: Dış Çeper Sarmal Hortum Hızı (%0 -> %32 - Halka 0 & 1)
          progress = 0.32 * (elapsedSec / 0.9);
        } else if (elapsedSec <= 3.2) {
          // Faz 2: Gövde Matris Sarmalı (%32 -> %82 - Halka 2 & 3)
          progress = 0.32 + 0.50 * ((elapsedSec - 0.9) / 2.3);
        } else {
          // Faz 3: Asimptotik Çekirdek Canlı Kuyruk (%82 -> %98 - Halka 4 & 5 Çekirdek)
          progress = 0.82 + 0.16 * (1 - Math.exp(-(elapsedSec - 3.2) / 3.0));
        }

        const targetStep = Math.min(TOTAL_TILES - 1, Math.floor(progress * TOTAL_TILES));

        if (targetStep > currentStepRef.current) {
          const newResolved: number[] = [];
          touchdownCounterRef.current++;
          const tId = touchdownCounterRef.current;

          for (let s = currentStepRef.current; s <= targetStep; s++) {
            const tileIdx = spiralOrder[s];
            if (tileIdx !== undefined) newResolved.push(tileIdx);
          }

          currentStepRef.current = targetStep;

          // 4 Kovanın Sarmal Hat Üzerindeki Faz Farklı Konumları (0, 4, 9, 15 Adım Ofset)
          const stepA = targetStep;
          const idxA = spiralOrder[stepA] ?? 0;
          const rA = Math.floor(idxA / COLS);
          const cA = idxA % COLS;
          setBucketAlpha({
            row: rA,
            col: cA,
            xPct: (cA + 0.5) * 10,
            yPct: (rA + 0.5) * (100 / ROWS),
            touchdownId: tId,
          });

          const stepB = Math.max(0, targetStep - 4);
          const idxB = spiralOrder[stepB] ?? 0;
          const rB = Math.floor(idxB / COLS);
          const cB = idxB % COLS;
          setBucketBeta({
            row: rB,
            col: cB,
            xPct: (cB + 0.5) * 10,
            yPct: (rB + 0.5) * (100 / ROWS),
            touchdownId: tId,
          });

          const stepG = Math.max(0, targetStep - 9);
          const idxG = spiralOrder[stepG] ?? 0;
          const rG = Math.floor(idxG / COLS);
          const cG = idxG % COLS;
          setBucketGamma({
            row: rG,
            col: cG,
            xPct: (cG + 0.5) * 10,
            yPct: (rG + 0.5) * (100 / ROWS),
            touchdownId: tId,
          });

          const stepD = Math.max(0, targetStep - 15);
          const idxD = spiralOrder[stepD] ?? 0;
          const rD = Math.floor(idxD / COLS);
          const cD = idxD % COLS;
          setBucketDelta({
            row: rD,
            col: cD,
            xPct: (cD + 0.5) * 10,
            yPct: (rD + 0.5) * (100 / ROWS),
            touchdownId: tId,
          });

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

          // 240ms sonra fosfor difüzyonunu söndür
          setTimeout(() => {
            setBloomingTiles((prev) => {
              const next = new Set(prev);
              newResolved.forEach((t) => next.delete(t));
              return next;
            });
          }, 240);
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
      // Backend Yanıtı Geldiği An: Final Global Anamorfik Flaş & Kristal Kapanış
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      setIsFinishing(true);

      const allTiles = new Set<number>();
      for (let i = 0; i < TOTAL_TILES; i++) allTiles.add(i);
      setResolvedTiles(allTiles);

      const finishTimer = setTimeout(() => {
        setIsVisible(false);
        setIsFinishing(false);
        if (onComplete) onComplete();
      }, 340);

      return () => clearTimeout(finishTimer);
    }
  }, [isActive, isVisible, isFinishing, spiralOrder, onComplete]);

  if (!isVisible) return null;

  // 4 Kovanın SVG Poligon Koordinatları
  const polygonPoints = `${bucketAlpha.xPct},${bucketAlpha.yPct} ${bucketBeta.xPct},${bucketBeta.yPct} ${bucketGamma.xPct},${bucketGamma.yPct} ${bucketDelta.xPct},${bucketDelta.yPct}`;

  return (
    <div
      className={`absolute inset-0 z-20 pointer-events-none select-none overflow-hidden rounded transition-opacity duration-300 ${
        isFinishing ? 'pointer-events-none' : 'opacity-100'
      }`}
      style={{ contain: 'strict' }}
    >
      {/* 1. 140 Mikro-Karo Spektral Salyangoz Izgarası (10 Sütun x 14 Satır) */}
      <div className="w-full h-full spiral-tile-grid relative">
        {Array.from({ length: TOTAL_TILES }).map((_, idx) => {
          const isResolved = resolvedTiles.has(idx);
          const isBlooming = bloomingTiles.has(idx);

          return (
            <div
              key={idx}
              className={`render-tile-micro ${isResolved ? 'resolved' : 'unresolved'} ${
                isBlooming ? 'tile-phosphor-bloom' : ''
              }`}
            >
              {/* Çözülmemiş mikro-karo içinde CAD topoğrafya artı işareti */}
              {!isResolved && (
                <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none">
                  <span className="text-[6px] font-mono text-cyan-300 leading-none select-none">+</span>
                </div>
              )}
            </div>
          );
        })}

        {/* 2. Dinamik SVG Kuantum Lazer Poligonu (4 Kova Arası Işık Vektörleri) */}
        {!isFinishing && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-24"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Lazer Poligonu Çerçeve ve İç Işıma */}
            <polygon
              points={polygonPoints}
              fill="rgba(56, 189, 248, 0.05)"
              stroke="rgba(56, 189, 248, 0.45)"
              strokeWidth="0.5"
              strokeDasharray="2 1.5"
              className="animate-pulse"
            />
            {/* Çapraz Kuantum Lazer Bağlantıları */}
            <line
              x1={`${bucketAlpha.xPct}%`}
              y1={`${bucketAlpha.yPct}%`}
              x2={`${bucketGamma.xPct}%`}
              y2={`${bucketGamma.yPct}%`}
              stroke="rgba(52, 211, 153, 0.45)"
              strokeWidth="0.4"
              strokeDasharray="1.5 1"
            />
            <line
              x1={`${bucketBeta.xPct}%`}
              y1={`${bucketBeta.yPct}%`}
              x2={`${bucketDelta.xPct}%`}
              y2={`${bucketDelta.yPct}%`}
              stroke="rgba(129, 140, 248, 0.45)"
              strokeWidth="0.4"
              strokeDasharray="1.5 1"
            />
          </svg>
        )}

        {/* 3. 4'lü Roving Bucket Filosu (translate3d ile 120 FPS Sub-Pixel Akıcı) */}
        {!isFinishing && (
          <>
            {/* Kova α (Alpha - Öncü Cyan Lazer) */}
            <div
              className="roving-bucket roving-bucket-alpha"
              style={{
                width: '10%',
                height: `${100 / ROWS}%`,
                transform: `translate3d(${bucketAlpha.col * 100}%, ${bucketAlpha.row * 100}%, 0)`,
              }}
            >
              <div className="bucket-motion-ghost bucket-motion-ghost-alpha" />
              <span className="bucket-bracket bucket-bracket-tl text-cyan-400" />
              <span className="bucket-bracket-tr text-cyan-400" />
              <span className="bucket-bracket-bl text-cyan-400" />
              <span className="bucket-bracket-br text-cyan-400" />

              <div className="absolute top-0 left-0 px-0.5 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-cyan-400/50 text-[6.5px] font-mono font-bold text-cyan-300 leading-none flex items-center space-x-0.5">
                <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping inline-block" />
                <span>α • [{bucketAlpha.row}:{bucketAlpha.col}]</span>
              </div>

              <div key={`laser-alpha-${bucketAlpha.touchdownId}`} className="bucket-laser-blade bucket-laser-blade-alpha" />

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2 h-2 rounded-full border border-cyan-400/50 flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
                  <div className="w-0.5 h-0.5 rounded-full bg-cyan-300 shadow-[0_0_4px_#38bdf8]" />
                </div>
              </div>

              <div className="w-full h-full bucket-sampling-glow bucket-sampling-glow-alpha" />
            </div>

            {/* Kova β (Beta - Safir Mavi / Deep Indigo Analizci) */}
            <div
              className="roving-bucket roving-bucket-beta"
              style={{
                width: '10%',
                height: `${100 / ROWS}%`,
                transform: `translate3d(${bucketBeta.col * 100}%, ${bucketBeta.row * 100}%, 0)`,
              }}
            >
              <div className="bucket-motion-ghost bucket-motion-ghost-beta" />
              <span className="bucket-bracket bucket-bracket-tl text-indigo-400" />
              <span className="bucket-bracket-tr text-indigo-400" />
              <span className="bucket-bracket-bl text-indigo-400" />
              <span className="bucket-bracket-br text-indigo-400" />

              <div className="absolute top-0 left-0 px-0.5 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-indigo-400/50 text-[6.5px] font-mono font-bold text-indigo-300 leading-none flex items-center space-x-0.5">
                <span className="w-1 h-1 rounded-full bg-indigo-400 animate-ping inline-block" />
                <span>β • [{bucketBeta.row}:{bucketBeta.col}]</span>
              </div>

              <div key={`laser-beta-${bucketBeta.touchdownId}`} className="bucket-laser-blade bucket-laser-blade-beta" />

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2 h-2 rounded-full border border-indigo-400/50 flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
                  <div className="w-0.5 h-0.5 rounded-full bg-indigo-300 shadow-[0_0_4px_#818cf8]" />
                </div>
              </div>

              <div className="w-full h-full bucket-sampling-glow bucket-sampling-glow-beta" />
            </div>

            {/* Kova γ (Gamma - Aurora Zümrüt / Emerald Matris Doğrulayıcı) */}
            <div
              className="roving-bucket roving-bucket-gamma"
              style={{
                width: '10%',
                height: `${100 / ROWS}%`,
                transform: `translate3d(${bucketGamma.col * 100}%, ${bucketGamma.row * 100}%, 0)`,
              }}
            >
              <div className="bucket-motion-ghost bucket-motion-ghost-gamma" />
              <span className="bucket-bracket bucket-bracket-tl text-emerald-400" />
              <span className="bucket-bracket-tr text-emerald-400" />
              <span className="bucket-bracket-bl text-emerald-400" />
              <span className="bucket-bracket-br text-emerald-400" />

              <div className="absolute top-0 left-0 px-0.5 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-emerald-400/50 text-[6.5px] font-mono font-bold text-emerald-300 leading-none flex items-center space-x-0.5">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span>γ • [{bucketGamma.row}:{bucketGamma.col}]</span>
              </div>

              <div key={`laser-gamma-${bucketGamma.touchdownId}`} className="bucket-laser-blade bucket-laser-blade-gamma" />

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2 h-2 rounded-full border border-emerald-400/50 flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
                  <div className="w-0.5 h-0.5 rounded-full bg-emerald-300 shadow-[0_0_4px_#34d399]" />
                </div>
              </div>

              <div className="w-full h-full bucket-sampling-glow bucket-sampling-glow-gamma" />
            </div>

            {/* Kova δ (Delta - Solar Amber / Fotonik Pişirici) */}
            <div
              className="roving-bucket roving-bucket-delta"
              style={{
                width: '10%',
                height: `${100 / ROWS}%`,
                transform: `translate3d(${bucketDelta.col * 100}%, ${bucketDelta.row * 100}%, 0)`,
              }}
            >
              <div className="bucket-motion-ghost bucket-motion-ghost-delta" />
              <span className="bucket-bracket bucket-bracket-tl text-amber-400" />
              <span className="bucket-bracket-tr text-amber-400" />
              <span className="bucket-bracket-bl text-amber-400" />
              <span className="bucket-bracket-br text-amber-400" />

              <div className="absolute top-0 left-0 px-0.5 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-amber-400/50 text-[6.5px] font-mono font-bold text-amber-300 leading-none flex items-center space-x-0.5">
                <span className="w-1 h-1 rounded-full bg-amber-400 animate-ping inline-block" />
                <span>δ • [{bucketDelta.row}:{bucketDelta.col}]</span>
              </div>

              <div key={`laser-delta-${bucketDelta.touchdownId}`} className="bucket-laser-blade bucket-laser-blade-delta" />

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2 h-2 rounded-full border border-amber-400/50 flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
                  <div className="w-0.5 h-0.5 rounded-full bg-amber-300 shadow-[0_0_4px_#fbbf24]" />
                </div>
              </div>

              <div className="w-full h-full bucket-sampling-glow bucket-sampling-glow-delta" />
            </div>
          </>
        )}

        {/* 4. Global Anamorfik Diyafram Flaşı & Şok Dalgası (Büyük Sinematik Kapanış) */}
        {isFinishing && (
          <div className="global-aperture-flash pointer-events-none">
            <div className="anamorphic-horizontal-flare" />
          </div>
        )}
      </div>
    </div>
  );
};
