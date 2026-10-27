import React, { useState, useEffect, useRef } from 'react';

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

interface BucketFleetState {
  alpha: BucketPos;
  beta: BucketPos;
  gamma: BucketPos;
  delta: BucketPos;
}

const COLS = 10;
const ROWS = 14;
const TOTAL_TILES = COLS * ROWS; // 140 Mikro-Karo
const STATIC_TILE_INDICES = Array.from({ length: TOTAL_TILES }, (_, idx) => idx);

/**
 * 10 Sütun x 14 Satır = 140 Mikro-Karo için Salyangoz Kabuğu (Inward Nautilus G-Spiral) Algoritması
 * Dış çeperden başlayarak saat yönünde (Clockwise Inward Vortex) 5 konsantrik halka halinde merkeze iner.
 * Modül seviyesinde bir defa hesaplanır (Sıfır GC baskısı, O(1) indeks erişimi).
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

const SPIRAL_ORDER = generateInwardSpiralOrder(ROWS, COLS);

const INITIAL_BUCKET_POS: BucketPos = { row: 0, col: 0, xPct: 5, yPct: 3.57, touchdownId: 0 };
const INITIAL_FLEET: BucketFleetState = {
  alpha: INITIAL_BUCKET_POS,
  beta: INITIAL_BUCKET_POS,
  gamma: INITIAL_BUCKET_POS,
  delta: INITIAL_BUCKET_POS,
};

/**
 * React 19 Bireysel Mikro-Karo (Micro-Tile)
 * Yalnızca kendi resolved veya blooming durumu değiştiğinde render edilir.
 * 140 karo için gereksiz VDOM diff ve re-render maliyetini %99 oranında azaltır.
 */
interface TileItemProps {
  idx: number;
  isResolved: boolean;
  isBlooming: boolean;
}

const TileItem = React.memo<TileItemProps>(
  ({ isResolved, isBlooming }) => {
    return (
      <div
        className={`render-tile-micro ${isResolved ? 'resolved' : 'unresolved'} ${
          isBlooming ? 'tile-phosphor-bloom' : ''
        }`}
      >
        {!isResolved && (
          <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none">
            <span className="text-[6px] font-mono text-cyan-300 leading-none select-none">+</span>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => prev.isResolved === next.isResolved && prev.isBlooming === next.isBlooming
);

/**
 * 140 Mikro-Karo Izgarası (Tile Grid)
 * Kova pozisyonu güncellendiğinde karolar asla yeniden render edilmez (İzolasyon Katmanı).
 */
interface TileGridProps {
  resolvedTiles: Set<number>;
  bloomingTiles: Set<number>;
}

const TileGrid = React.memo<TileGridProps>(({ resolvedTiles, bloomingTiles }) => {
  return (
    <>
      {STATIC_TILE_INDICES.map((idx) => (
        <TileItem
          key={idx}
          idx={idx}
          isResolved={resolvedTiles.has(idx)}
          isBlooming={bloomingTiles.has(idx)}
        />
      ))}
    </>
  );
});

/**
 * 4'lü Roving Kova Filosu & Dinamik Lazer Poligonu Katmanı
 * 120 FPS GPU compositor (translate3d) ile çalışır, karo ızgarasını tetiklemez.
 */
interface RovingFleetOverlayProps {
  fleet: BucketFleetState;
  isFinishing: boolean;
}

const RovingFleetOverlay = React.memo<RovingFleetOverlayProps>(({ fleet, isFinishing }) => {
  if (isFinishing) return null;

  const { alpha, beta, gamma, delta } = fleet;
  const polygonPoints = `${alpha.xPct},${alpha.yPct} ${beta.xPct},${beta.yPct} ${gamma.xPct},${gamma.yPct} ${delta.xPct},${delta.yPct}`;

  return (
    <>
      {/* 2. Dinamik SVG Kuantum Lazer Poligonu (4 Kova Arası Işık Vektörleri) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-24"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polygon
          points={polygonPoints}
          fill="rgba(56, 189, 248, 0.05)"
          stroke="rgba(56, 189, 248, 0.45)"
          strokeWidth="0.5"
          strokeDasharray="2 1.5"
          className="animate-pulse"
        />
        <line
          x1={`${alpha.xPct}%`}
          y1={`${alpha.yPct}%`}
          x2={`${gamma.xPct}%`}
          y2={`${gamma.yPct}%`}
          stroke="rgba(52, 211, 153, 0.45)"
          strokeWidth="0.4"
          strokeDasharray="1.5 1"
        />
        <line
          x1={`${beta.xPct}%`}
          y1={`${beta.yPct}%`}
          x2={`${delta.xPct}%`}
          y2={`${delta.yPct}%`}
          stroke="rgba(129, 140, 248, 0.45)"
          strokeWidth="0.4"
          strokeDasharray="1.5 1"
        />
      </svg>

      {/* Kova α (Alpha - Öncü Cyan Lazer) */}
      <div
        className="roving-bucket roving-bucket-alpha"
        style={{
          width: '10%',
          height: `${100 / ROWS}%`,
          transform: `translate3d(${alpha.col * 100}%, ${alpha.row * 100}%, 0)`,
        }}
      >
        <div className="bucket-motion-ghost bucket-motion-ghost-alpha" />
        <span className="bucket-bracket bucket-bracket-tl text-cyan-400" />
        <span className="bucket-bracket-tr text-cyan-400" />
        <span className="bucket-bracket-bl text-cyan-400" />
        <span className="bucket-bracket-br text-cyan-400" />

        <div className="absolute top-0 left-0 px-0.5 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-cyan-400/50 text-[6.5px] font-mono font-bold text-cyan-300 leading-none flex items-center space-x-0.5">
          <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping inline-block" />
          <span>α • [{alpha.row}:{alpha.col}]</span>
        </div>

        <div key={`laser-alpha-${alpha.touchdownId}`} className="bucket-laser-blade bucket-laser-blade-alpha" />

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
          transform: `translate3d(${beta.col * 100}%, ${beta.row * 100}%, 0)`,
        }}
      >
        <div className="bucket-motion-ghost bucket-motion-ghost-beta" />
        <span className="bucket-bracket bucket-bracket-tl text-indigo-400" />
        <span className="bucket-bracket-tr text-indigo-400" />
        <span className="bucket-bracket-bl text-indigo-400" />
        <span className="bucket-bracket-br text-indigo-400" />

        <div className="absolute top-0 left-0 px-0.5 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-indigo-400/50 text-[6.5px] font-mono font-bold text-indigo-300 leading-none flex items-center space-x-0.5">
          <span className="w-1 h-1 rounded-full bg-indigo-400 animate-ping inline-block" />
          <span>β • [{beta.row}:{beta.col}]</span>
        </div>

        <div key={`laser-beta-${beta.touchdownId}`} className="bucket-laser-blade bucket-laser-blade-beta" />

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
          transform: `translate3d(${gamma.col * 100}%, ${gamma.row * 100}%, 0)`,
        }}
      >
        <div className="bucket-motion-ghost bucket-motion-ghost-gamma" />
        <span className="bucket-bracket bucket-bracket-tl text-emerald-400" />
        <span className="bucket-bracket-tr text-emerald-400" />
        <span className="bucket-bracket-bl text-emerald-400" />
        <span className="bucket-bracket-br text-emerald-400" />

        <div className="absolute top-0 left-0 px-0.5 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-emerald-400/50 text-[6.5px] font-mono font-bold text-emerald-300 leading-none flex items-center space-x-0.5">
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping inline-block" />
          <span>γ • [{gamma.row}:{gamma.col}]</span>
        </div>

        <div key={`laser-gamma-${gamma.touchdownId}`} className="bucket-laser-blade bucket-laser-blade-gamma" />

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
          transform: `translate3d(${delta.col * 100}%, ${delta.row * 100}%, 0)`,
        }}
      >
        <div className="bucket-motion-ghost bucket-motion-ghost-delta" />
        <span className="bucket-bracket bucket-bracket-tl text-amber-400" />
        <span className="bucket-bracket-tr text-amber-400" />
        <span className="bucket-bracket-bl text-amber-400" />
        <span className="bucket-bracket-br text-amber-400" />

        <div className="absolute top-0 left-0 px-0.5 py-0.2 bg-slate-950/90 rounded-br border-b border-r border-amber-400/50 text-[6.5px] font-mono font-bold text-amber-300 leading-none flex items-center space-x-0.5">
          <span className="w-1 h-1 rounded-full bg-amber-400 animate-ping inline-block" />
          <span>δ • [{delta.row}:{delta.col}]</span>
        </div>

        <div key={`laser-delta-${delta.touchdownId}`} className="bucket-laser-blade bucket-laser-blade-delta" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-2 h-2 rounded-full border border-amber-400/50 flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
            <div className="w-0.5 h-0.5 rounded-full bg-amber-300 shadow-[0_0_4px_#fbbf24]" />
          </div>
        </div>

        <div className="w-full h-full bucket-sampling-glow bucket-sampling-glow-delta" />
      </div>
    </>
  );
});

export const ProgressiveTileRender: React.FC<ProgressiveTileRenderProps> = ({
  isActive,
  onComplete,
}) => {
  const [resolvedTiles, setResolvedTiles] = useState<Set<number>>(() => new Set());
  const [bloomingTiles, setBloomingTiles] = useState<Set<number>>(() => new Set());
  const [isFinishing, setIsFinishing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // 4'lü Kuantum Kova Filosu (α: Cyan, β: Indigo, γ: Emerald, δ: Amber) Tekil State
  const [fleet, setFleet] = useState<BucketFleetState>(INITIAL_FLEET);

  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const currentStepRef = useRef<number>(0);
  const touchdownCounterRef = useRef<number>(1);
  const timersRef = useRef<Set<number>>(new Set());

  // Tüm aktif timer'ları temizleme (Memory Leak & Unmount State Update Koruması)
  const clearAllTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  };

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      setIsFinishing(false);
      setResolvedTiles(new Set());
      setBloomingTiles(new Set());
      setFleet(INITIAL_FLEET);
      currentStepRef.current = 0;
      touchdownCounterRef.current = 1;
      startTimeRef.current = performance.now();
      clearAllTimers();

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
            const tileIdx = SPIRAL_ORDER[s];
            if (tileIdx !== undefined) newResolved.push(tileIdx);
          }

          currentStepRef.current = targetStep;

          // 4 Kovanın Sarmal Hat Üzerindeki Faz Farklı Konumları (0, 4, 9, 15 Adım Ofset)
          const stepA = targetStep;
          const idxA = SPIRAL_ORDER[stepA] ?? 0;
          const rA = Math.floor(idxA / COLS);
          const cA = idxA % COLS;

          const stepB = Math.max(0, targetStep - 4);
          const idxB = SPIRAL_ORDER[stepB] ?? 0;
          const rB = Math.floor(idxB / COLS);
          const cB = idxB % COLS;

          const stepG = Math.max(0, targetStep - 9);
          const idxG = SPIRAL_ORDER[stepG] ?? 0;
          const rG = Math.floor(idxG / COLS);
          const cG = idxG % COLS;

          const stepD = Math.max(0, targetStep - 15);
          const idxD = SPIRAL_ORDER[stepD] ?? 0;
          const rD = Math.floor(idxD / COLS);
          const cD = idxD % COLS;

          setFleet({
            alpha: {
              row: rA,
              col: cA,
              xPct: (cA + 0.5) * 10,
              yPct: (rA + 0.5) * (100 / ROWS),
              touchdownId: tId,
            },
            beta: {
              row: rB,
              col: cB,
              xPct: (cB + 0.5) * 10,
              yPct: (rB + 0.5) * (100 / ROWS),
              touchdownId: tId,
            },
            gamma: {
              row: rG,
              col: cG,
              xPct: (cG + 0.5) * 10,
              yPct: (rG + 0.5) * (100 / ROWS),
              touchdownId: tId,
            },
            delta: {
              row: rD,
              col: cD,
              xPct: (cD + 0.5) * 10,
              yPct: (rD + 0.5) * (100 / ROWS),
              touchdownId: tId,
            },
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

          // 240ms sonra fosfor difüzyonunu söndür (Timer havuzunda takip edilir)
          const bloomTimer = window.setTimeout(() => {
            timersRef.current.delete(bloomTimer);
            setBloomingTiles((prev) => {
              const next = new Set(prev);
              newResolved.forEach((t) => next.delete(t));
              return next;
            });
          }, 240);
          timersRef.current.add(bloomTimer);
        }

        animFrameRef.current = requestAnimationFrame(tick);
      };

      animFrameRef.current = requestAnimationFrame(tick);

      return () => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
        clearAllTimers();
      };
    } else if (isVisible && !isFinishing) {
      // Backend Yanıtı Geldiği An: Final Global Anamorfik Flaş & Kristal Kapanış
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      clearAllTimers();
      setIsFinishing(true);

      const allTiles = new Set<number>();
      for (let i = 0; i < TOTAL_TILES; i++) allTiles.add(i);
      setResolvedTiles(allTiles);

      const finishTimer = window.setTimeout(() => {
        timersRef.current.delete(finishTimer);
        setIsVisible(false);
        setIsFinishing(false);
        if (onComplete) onComplete();
      }, 340);
      timersRef.current.add(finishTimer);

      return () => {
        clearTimeout(finishTimer);
        timersRef.current.delete(finishTimer);
      };
    }
  }, [isActive, isVisible, isFinishing, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className={`absolute inset-0 z-20 pointer-events-none select-none overflow-hidden rounded transition-opacity duration-300 ${
        isFinishing ? 'pointer-events-none' : 'opacity-100'
      }`}
      style={{ contain: 'strict' }}
    >
      {/* 1. 140 Mikro-Karo Spektral Salyangoz Izgarası (10 Sütun x 14 Satır) */}
      <div className="w-full h-full spiral-tile-grid relative">
        <TileGrid resolvedTiles={resolvedTiles} bloomingTiles={bloomingTiles} />

        {/* 2 & 3. 4'lü Kova Filosu ve Kuantum Lazer Poligonu (İzole Render Katmanı) */}
        <RovingFleetOverlay fleet={fleet} isFinishing={isFinishing} />

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
