import React, { useState } from 'react';
import { StatusBreakdown } from '../../../types/irsaliye';
import { EmptyChartState } from './EmptyChartState';
import { PieChart, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';

export interface OperationalStatusChartProps {
  data?: StatusBreakdown | null;
  onActionToStation?: () => void;
}

export const OperationalStatusChart: React.FC<OperationalStatusChartProps> = ({
  data,
  onActionToStation,
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const total =
    (Number(data?.onaylandi) || 0) +
    (Number(data?.tamamlandi) || 0) +
    (Number(data?.kuyrukta) || 0) +
    (Number(data?.isleniyor) || 0) +
    (Number(data?.hata) || 0);

  if (!data || total === 0) {
    return (
      <div data-testid="chart-operational-status" className="h-full min-w-0">
        <EmptyChartState
          title="Operasyonel Durum Verisi Yok"
          description="Sistemde henüz işlem gören veya kuyrukta bekleyen irsaliye bulunmuyor."
          actionText="İstasyon'dan İrsaliye Yükle"
          onAction={onActionToStation}
        />
      </div>
    );
  }

  // Segments definition
  const segments = [
    {
      key: 'onaylandi',
      label: 'Onaylandı',
      count: Number(data.onaylandi) || 0,
      color: '#10b981', // emerald-500
      strokeClass: 'stroke-emerald-500',
      bgClass: 'bg-emerald-500',
      textClass: 'text-emerald-500',
    },
    {
      key: 'tamamlandi',
      label: 'Tamamlandı (Onay Bekliyor)',
      count: Number(data.tamamlandi) || 0,
      color: '#3b82f6', // blue-500
      strokeClass: 'stroke-blue-500',
      bgClass: 'bg-blue-500',
      textClass: 'text-blue-500',
    },
    {
      key: 'kuyrukta',
      label: 'Kuyrukta',
      count: Number(data.kuyrukta) || 0,
      color: '#f59e0b', // amber-500
      strokeClass: 'stroke-amber-500',
      bgClass: 'bg-amber-500',
      textClass: 'text-amber-500',
    },
    {
      key: 'isleniyor',
      label: 'İşleniyor',
      count: Number(data.isleniyor) || 0,
      color: '#06b6d4', // cyan-500
      strokeClass: 'stroke-cyan-500',
      bgClass: 'bg-cyan-500',
      textClass: 'text-cyan-500',
    },
    {
      key: 'hata',
      label: 'Hatalı / Uyuşmazlık',
      count: Number(data.hata) || 0,
      color: '#f43f5e', // rose-500
      strokeClass: 'stroke-rose-500',
      bgClass: 'bg-rose-500',
      textClass: 'text-rose-500',
    },
  ].filter((s) => s.count > 0);

  // SVG Donut calculation
  const radius = 64;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;
  const slices = segments.map((seg) => {
    const percent = total > 0 ? seg.count / total : 0;
    const strokeDasharray = `${percent * circumference} ${circumference}`;
    const strokeDashoffset = -currentOffset;
    currentOffset += percent * circumference;
    return {
      ...seg,
      percent: percent * 100,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const rawApproval = total > 0 ? ((Number(data.onaylandi) || 0) / total) * 100 : 0;
  const approvalRate = Number.isFinite(rawApproval) ? rawApproval : 0;
  const activeSlice = hoveredKey ? slices.find((s) => s.key === hoveredKey) : null;

  const rawUyusmazlik = Number(data.uyusmazlik_sayisi);
  const uyusmazlikSayisi = Number.isFinite(rawUyusmazlik) ? rawUyusmazlik : 0;

  const rawScore = Number(data.ortalama_guven_skoru);
  const guvenSkoru = Number.isFinite(rawScore) ? rawScore : undefined;

  return (
    <div
      data-testid="chart-operational-status"
      className="bg-theme-card border border-theme-subtle rounded-xl p-4 sm:p-5 shadow-sm flex flex-col justify-between transition-colors duration-200 min-w-0"
    >
      <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500 border border-purple-500/20 shrink-0">
            <PieChart className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-theme-primary truncate">
              Operasyonel Durum ve Uyuşmazlık Dağılımı
            </h4>
            <p className="text-xs text-theme-muted truncate">
              İrsaliye işlem safhaları ve depo kabul güvenilirlik oranı
            </p>
          </div>
        </div>

        {uyusmazlikSayisi > 0 && (
          <span className="flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
            <AlertCircle className="w-3 h-3" />
            <span>{uyusmazlikSayisi} Uyuşmazlık</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center my-2 min-w-0">
        {/* Donut SVG */}
        <div className="md:col-span-5 flex justify-center items-center relative">
          <svg
            viewBox="0 0 180 180"
            className="w-36 h-36 sm:w-40 sm:h-40 transform -rotate-90 select-none overflow-visible"
          >
            {/* Background ring */}
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="transparent"
              stroke="var(--chart-grid)"
              strokeWidth={strokeWidth}
              className="opacity-40"
            />

            {/* Slices: If single segment (100%), render clean solid circle to avoid SVG strokeDasharray 100% glitch */}
            {slices.length === 1 ? (
              <circle
                cx="90"
                cy="90"
                r={radius}
                fill="transparent"
                stroke={slices[0].color}
                strokeWidth={hoveredKey === slices[0].key ? strokeWidth + 4 : strokeWidth}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredKey(slices[0].key)}
                onMouseLeave={() => setHoveredKey(null)}
              />
            ) : (
              slices.map((slice) => {
                const isHovered = hoveredKey === slice.key;
                return (
                  <circle
                    key={slice.key}
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="transparent"
                    stroke={slice.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={slice.strokeDasharray}
                    strokeDashoffset={slice.strokeDashoffset}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredKey(slice.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  />
                );
              })
            )}
          </svg>

          {/* Center text in Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            {activeSlice ? (
              <>
                <span className="text-lg font-bold text-theme-primary font-mono">
                  %{activeSlice.percent.toFixed(0)}
                </span>
                <span className="text-[10px] text-theme-muted font-medium max-w-[80px] truncate">
                  {activeSlice.label}
                </span>
              </>
            ) : (
              <>
                <span className="text-xl font-bold text-theme-primary font-mono">
                  {total}
                </span>
                <span className="text-[10px] text-theme-muted uppercase tracking-wider font-semibold">
                  Toplam Evrak
                </span>
              </>
            )}
          </div>
        </div>

        {/* Legend & Details */}
        <div className="md:col-span-7 space-y-2 min-w-0">
          <div className="grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
            {slices.map((slice) => {
              const isHovered = hoveredKey === slice.key;
              return (
                <div
                  key={slice.key}
                  onMouseEnter={() => setHoveredKey(slice.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-all min-w-0 gap-2 ${
                    isHovered
                      ? 'bg-theme-surface border border-theme-strong'
                      : 'hover:bg-theme-surface/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="text-theme-secondary font-medium truncate min-w-0">
                      {slice.label}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="font-bold text-theme-primary font-mono">
                      {slice.count}
                    </span>
                    <span className="text-[10px] text-theme-muted font-mono">
                      (%{slice.percent.toFixed(1)})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Operational Quality Badges */}
          <div className="pt-2 border-t border-theme-subtle flex flex-wrap items-center justify-between gap-2 text-xs min-w-0">
            <div className="flex items-center space-x-1.5 text-theme-secondary min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">Onay Başarısı:</span>
              <span className="font-bold text-emerald-500 font-mono">
                %{approvalRate.toFixed(1)}
              </span>
            </div>

            {guvenSkoru !== undefined && (
              <div className="flex items-center space-x-1.5 text-theme-secondary min-w-0">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="truncate">Doğruluk Skoru:</span>
                <span className="font-bold text-blue-500 font-mono">
                  %{(guvenSkoru * 100).toFixed(0)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
