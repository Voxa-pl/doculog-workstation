import React, { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  baseRadius: number;
  layer: number; // 0: iç çekirdek, 1: orta kuşak, 2: dış bulut
  angle: number;
  angularVelocity: number;
  phase: number;
  baseSize: number;
  color: string;
}

interface NeuralPointCloudProps {
  isActive: boolean;
}

/**
 * DocuLog - Kuantum/Nöral Nokta Kümesi (Neural Optical Point Cloud)
 * 
 * Lazer tarama yerine evrak çözümlenirken beliren;
 * - 300ms ease-out kararma & 200ms ease-in çıkış vinyeti
 * - 3 konsantrik jiroskopik yörüngede dönen noktalar (12-18 rpm, zıt yönlü dönüşler)
 * - 1.8s sinüs periyotlu nefes alma (büyüyüp küçülen kuantum düğümleri)
 * - 3.6s radyal genleşme ve sinaptik bağ filamentleri
 */
export const NeuralPointCloud: React.FC<NeuralPointCloudProps> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Retina / HiDPI desteği
    const dpr = window.devicePixelRatio || 1;
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { w: 400, h: 400 };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
      ctx.scale(dpr, dpr);
      return { w: rect.width, h: rect.height };
    };

    let { w, h } = updateSize();

    // Renk paleti: Siber Mavi, Nöral Kobalt, Zümrüt Kuantum
    const colors = ['#38bdf8', '#60a5fa', '#3b82f6', '#34d399'];

    // 3 Katmanlı Nokta Oluşturma (52 Nokta)
    // Katman 0: İç Çekirdek (18 RPM - Saat yönü)
    // Katman 1: Orta Kuşak (14 RPM - Ters saat yönü - Gyroscopic Parallax)
    // Katman 2: Dış Hale (12 RPM - Saat yönü)
    const points: Point[] = [];
    const layers = [
      { count: 12, minR: 35, maxR: 65, rpm: 18, dir: 1 },
      { count: 18, minR: 85, maxR: 135, rpm: 14, dir: -1 },
      { count: 22, minR: 155, maxR: 220, rpm: 12, dir: 1 },
    ];

    let pIdx = 0;
    layers.forEach((l, lIdx) => {
      const radPerSec = ((l.rpm * 2 * Math.PI) / 60) * l.dir;
      for (let i = 0; i < l.count; i++) {
        const angle = (i / l.count) * 2 * Math.PI + Math.random() * 0.35;
        const radius = l.minR + Math.random() * (l.maxR - l.minR);
        points.push({
          x: 0,
          y: 0,
          baseRadius: radius,
          layer: lIdx,
          angle,
          angularVelocity: radPerSec,
          phase: (pIdx / 52) * 2 * Math.PI,
          baseSize: 1.6 + Math.random() * 2.4,
          color: colors[pIdx % colors.length],
        });
        pIdx++;
      }
    });

    startTimeRef.current = Date.now();

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const centerX = width / 2;
      const centerY = height / 2;

      const now = (Date.now() - startTimeRef.current) / 1000;
      ctx.clearRect(0, 0, width, height);

      // Nefes alma frekansı: 1.8s dalga boyu (f = 0.55 Hz)
      const breathePeriod = 1.8;
      const breatheFreq = (2 * Math.PI) / breathePeriod;
      // Radyal genleşme alt-harmoniği: 3.6s
      const radialFreq = (2 * Math.PI) / 3.6;

      // Konumları güncelle
      points.forEach((p) => {
        const curAngle = p.angle + p.angularVelocity * now;
        const curRadius = p.baseRadius * (1 + 0.14 * Math.cos(radialFreq * now + p.phase * 0.5));
        p.x = centerX + Math.cos(curAngle) * curRadius;
        p.y = centerY + Math.sin(curAngle) * curRadius;
      });

      // 1. Noktalar arası sinaptik bağlantı çizgileri (yakınlık < 62px)
      ctx.lineWidth = 0.75;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const distSq = dx * dx + dy * dy;

          if (distSq < 3844) { // 62^2 = 3844
            const dist = Math.sqrt(distSq);
            const alpha = (1 - dist / 62) * 0.26;
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[j].x, points[j].y);
            ctx.stroke();
          }
        }
      }

      // 2. Kuantum / Nöral Noktalar (Büyüyüp Küçülen / Nefes Alan)
      points.forEach((p) => {
        const sinWave = Math.sin(breatheFreq * now + p.phase);
        const scaleVal = 1 + 0.52 * sinWave;
        const radius = Math.max(1.2, p.baseSize * scaleVal);

        const normSin = (1 + sinWave) / 2;
        const alpha = 0.22 + 0.68 * Math.pow(normSin, 1.4);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = radius * 3.2;

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20 flex items-center justify-center overflow-hidden">
      {/* 1. Belge Kararma Katmanı (300ms ease-out) */}
      <div 
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2.5px] transition-opacity duration-300 ease-out"
        style={{
          background: 'radial-gradient(circle at center, rgba(2, 6, 23, 0.65) 0%, rgba(2, 6, 23, 0.88) 100%)'
        }}
      />

      {/* 2. Dönen ve Nefes Alan Kuantum Nokta Kümesi Canvas'ı */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* 3. Minimalist Durum Rozeti */}
      <div className="relative z-30 flex flex-col items-center space-y-2 pointer-events-none">
        <div className="px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 shadow-[0_0_20px_rgba(56,189,248,0.2)] backdrop-blur-md flex items-center space-x-2.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-xs font-medium text-cyan-200 tracking-tight font-mono">
            Nöral Ayrıştırma Devrede
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
          Optik Düğümler Senkronize Ediliyor
        </span>
      </div>
    </div>
  );
};
