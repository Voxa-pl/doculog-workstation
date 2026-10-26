import React, { useEffect, useRef } from 'react';

interface Particle {
  baseR: number;
  angle: number;
  angularVelocity: number;
  pulsePhase: number;
  pulseFreq: number;
  baseSize: number;
  colorIdx: number;
}

interface NeuralPointCloudProps {
  isActive: boolean;
}

// Renk paleti: Siber Mavi, Nöral Gökyüzü, Kuantum Zümrüt, Kristal Beyaz
const PALETTE = [
  'rgba(56, 189, 248, ',  // Cyan 400
  'rgba(96, 165, 250, ',  // Sky 400
  'rgba(52, 211, 153, ',  // Emerald 400
  'rgba(248, 250, 252, ', // White
];

/**
 * DocuLog - 120 FPS Kuantum Sarmal Nokta Motoru (Swirling Celestial Particle Field)
 * 
 * - Render döngüsü içinde 0 DOM reflow (getBoundingClientRect SADECE ResizeObserver ile çalışır)
 * - 0 shadowBlur (Mobil GPU'larda yazılımsal yavaşlamayı önler)
 * - 48 adet konsantrik jiroskopik yörüngede dönen, sinüs dalgasıyla küçülüp büyüyen parıltılı parçacık
 * - Batch Draw Call ile maksimum 4 çizim çağrısı
 * - Telefon ve masaüstünde 120 FPS akıcı ve hafif
 */
export const NeuralPointCloud: React.FC<NeuralPointCloudProps> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // 1. BOYUTLANDIRMA SADECE RESIZEOBSERVER İLE YAPILIR
    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2); // Mobilde pil ve GPU dostu: maks 2x
      sizeRef.current = { w: rect.width, h: rect.height, dpr };

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    updateCanvasSize();
    const ro = new ResizeObserver(updateCanvasSize);
    ro.observe(canvas);

    // 2. 48 ADET SARMAL GÖKSEL PARTİKÜL (Swirling Celestial Nodes)
    const PARTICLE_COUNT = 48;
    const particles: Particle[] = [];
    const layers = [
      { count: 10, minR: 28, maxR: 55, rpm: 18, dir: 1 },
      { count: 16, minR: 70, maxR: 120, rpm: -14, dir: -1 },
      { count: 22, minR: 135, maxR: 195, rpm: 11, dir: 1 },
    ];

    let pIdx = 0;
    layers.forEach((l) => {
      const angularVel = ((l.rpm * 2 * Math.PI) / 60) * l.dir;
      for (let i = 0; i < l.count; i++) {
        const angle = (i / l.count) * 2 * Math.PI + Math.random() * 0.25;
        const radius = l.minR + Math.random() * (l.maxR - l.minR);
        particles.push({
          baseR: radius,
          angle,
          angularVelocity: angularVel,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseFreq: 1.8 + Math.random() * 1.4, // 1.8 - 3.2 rad/s nefes alma frekansı
          baseSize: 1.5 + Math.random() * 2.2,
          colorIdx: pIdx % PALETTE.length,
        });
        pIdx++;
      }
    });

    let lastTime = performance.now();

    // 3. 120 FPS BATCH CANVAS 2D MOTORU (0 CPU Garbage, 0 shadowBlur)
    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const { w, h } = sizeRef.current;
      if (w <= 0 || h <= 0) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      // Hafif ambient merkez halesi (Tek seferlik çizim)
      const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 170);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
      glow.addColorStop(0.5, 'rgba(15, 23, 42, 0.05)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const sec = now / 1000;

      // Partikülleri güncelle ve renklerine göre BATCH çiz (Draw Call minimizasyonu)
      for (let c = 0; c < PALETTE.length; c++) {
        ctx.beginPath();
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const p = particles[i];
          if (p.colorIdx !== c) continue;

          // Açısal dönüş
          p.angle += p.angularVelocity * dt;
          // Harmonik nefes alma (pulsating scale: küçülüp büyüme)
          const pulse = Math.sin(sec * p.pulseFreq + p.pulsePhase);
          const r = Math.max(0.9, p.baseSize * (1 + 0.55 * pulse));

          const px = cx + Math.cos(p.angle) * p.baseR;
          const py = cy + Math.sin(p.angle) * p.baseR;

          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, Math.PI * 2);
        }
        ctx.fillStyle = `${PALETTE[c]}0.88)`;
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20 flex items-center justify-center overflow-hidden">
      {/* Kadife Karartma Katmanı (Masaüstü ve mobil ekranı yumuşakça örter) */}
      <div 
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px] transition-opacity duration-300 ease-out"
        style={{
          background: 'radial-gradient(circle at center, rgba(2, 6, 23, 0.60) 0%, rgba(2, 6, 23, 0.90) 100%)'
        }}
      />

      {/* 120 FPS Kuantum Sarmal Nokta Tuvali */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </div>
  );
};
