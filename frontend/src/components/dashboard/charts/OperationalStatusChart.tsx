import React, { useState } from 'react';
import { StatusBreakdown } from '../../../types/irsaliye';
import { EmptyChartState } from './EmptyChartState';
import { PieChart, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';

export interface OperationalStatusChartProps {
  data: StatusBreakdown;
  onActionToStation?: () => void;
}

export const OperationalStatusChart: React.FC<OperationalStatusChartProps> = ({
  data,
  onActionToStation,
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const total =
    (data?.onaylandi || 0) +
    (data?.tamamlandi || 0) +
    (data?.kuyrukta || 0) +
    (data?.isleniyor || 0) +
    (data?.hata || 0);

  if (!data || total === 0) {
    return (
      <div data-testid="chart-operational-status" className="h-full">
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
      count: data.onaylandi || 0,
      color: '#10b981', // emerald-500
      strokeClass: 'stroke-emerald-500',
      bgClass: 'bg-emerald-500',
      textClass: 'text-emerald-500',
    },
    {
      key: 'tamamlandi',
      label: 'Tamamlandı (Onay Bekliyor)',
      count: data.tamamlandi || 0,
      color: '#3b82f6', // blue-500
      strokeClass: 'stroke-blue-500',
      bgClass: 'bg-blue-500',
      textClass: 'text-blue-500',
    },
    {
      key: 'kuyrukta',
      label: 'Kuyrukta',
      count: data.kuyrukta || 0,
      color: '#f59e0b', // amber-500
      strokeClass: 'stroke-amber-500',
      bgClass: 'bg-amber-500',
      textClass: 'text-amber-500',
    },
    {
      key: 'isleniyor',
      label: 'İşleniyor',
      count: data.isleniyor || 0,
      color: '#06b6d4', // cyan-500
      strokeClass: 'stroke-cyan-500',
      bgClass: 'bg-cyan-500',
      textClass: 'text-cyan-500',
    },
    {
      key: 'hata',
      label: 'Hatalı / Uyuşmazlık',
      count: data.hata || 0,
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

  const approvalRate = total > 0 ? ((data.onaylandi || 0) / total) * 100 : 0;
  const activeSlice = hoveredKey ? slices.find((s) => s.key === hoveredKey) : null;

  return (
    <div
      data-testid="chart-operational-status"
      className="bg-theme-card border border-theme-subtle rounded-xl p-5 shadow-sm flex flex-col justify-between transition-colors duration-200"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500 border border-purple-500/20">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-theme-primary">
              Operasyonel Durum ve Uyuşmazlık Dağılımı
            </h4>
            <p className="text-xs text-theme-muted">
              İrsaliye işlem safhaları ve depo kabul güvenilirlik oranı
            </p>
          </div>
        </div>

        {data.uyusmazlik_sayisi > 0 && (
          <span className="flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            <span>{data.uyusmazlik_sayisi} Uyuşmazlık</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center my-2">
        {/* Donut SVG */}
        <div className="md:col-span-5 flex justify-center items-center relative">
          <svg
            viewBox="0 0 180 180"
            className="w-40 h-40 transform -rotate-90 select-none overflow-visible"
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

            {/* Slices */}
            {slices.map((slice) => {
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
            })}
          </svg>

          {/* Center text in Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            {activeSlice ? (
              <>
                <span className="text-lg font-bold text-theme-primary">
                  %{activeSlice.percent.toFixed(0)}
                </span>
                <span className="text-[10px] text-theme-muted font-medium max-w-[80px] truncate">
                  {activeSlice.label}
                </span>
              </>
            ) : (
              <>
                <span className="text-xl font-bold text-theme-primary">
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
        <div className="md:col-span-7 space-y-2">
          <div className="grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
            {slices.map((slice) => {
              const isHovered = hoveredKey === slice.key;
              return (
                <div
                  key={slice.key}
                  onMouseEnter={() => setHoveredKey(slice.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                    isHovered
                      ? 'bg-theme-surface border border-theme-strong'
                      : 'hover:bg-theme-surface/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="text-theme-secondary font-medium">
                      {slice.label}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-theme-primary">
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
          <div className="pt-2 border-t border-theme-subtle flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-1.5 text-theme-secondary">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Onay Başarısı:</span>
              <span className="font-bold text-emerald-500">
                %{approvalRate.toFixed(1)}
              </span>
            </div>

            {data.ortalama_guven_skoru !== undefined && (
              <div className="flex items-center space-x-1.5 text-theme-secondary">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                <span>AI Güven Skoru:</span>
                <span className="font-bold text-blue-500">
                  %{(data.ortalama_guven_skoru * 100).toFixed(0)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
