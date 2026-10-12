import React, { useState } from 'react';
import { SupplierStat } from '../../../types/irsaliye';
import { EmptyChartState } from './EmptyChartState';
import { Building2, Package, FileText } from 'lucide-react';

export interface SupplierDistributionChartProps {
  data: SupplierStat[];
  onActionToStation?: () => void;
}

export const SupplierDistributionChart: React.FC<SupplierDistributionChartProps> = ({
  data,
  onActionToStation,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div data-testid="chart-suppliers" className="h-full">
        <EmptyChartState
          title="Tedarikçi Dağılımı Yok"
          description="Henüz hiçbir tedarikçi cari kaydı bulunmuyor. Gelen irsaliyeler analiz edildikçe tedarikçi hacimleri burada listelenir."
          actionText="İstasyon'dan İrsaliye Yükle"
          onAction={onActionToStation}
        />
      </div>
    );
  }

  // Calculate highest quantity to scale relative bar widths
  const maxMiktar = Math.max(...data.map((s) => s.toplam_miktar || 0), 1);
  const totalVolume = data.reduce((acc, s) => acc + (s.toplam_miktar || 0), 0);

  return (
    <div
      data-testid="chart-suppliers"
      className="bg-theme-card border border-theme-subtle rounded-xl p-5 shadow-sm flex flex-col justify-between transition-colors duration-200"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-theme-primary">
              Tedarikçi Sevkiyat Hacim Dağılımı
            </h4>
            <p className="text-xs text-theme-muted">
              En yüksek mal indiren cariler ve toplam sevkiyat payları
            </p>
          </div>
        </div>

        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-theme-surface text-theme-secondary border border-theme-subtle">
          {data.length} Tedarikçi
        </span>
      </div>

      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
        {data.map((item, idx) => {
          const miktar = item.toplam_miktar || 0;
          const sharePercentage =
            item.pay_yuzde ??
            item.yuzde ??
            (totalVolume > 0 ? (miktar / totalVolume) * 100 : 0);

          const barWidthPercent = (miktar / maxMiktar) * 100;
          const isHovered = hoveredIndex === idx;

          return (
            <div
              key={idx}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`p-2.5 rounded-lg border transition-all duration-150 ${
                isHovered
                  ? 'bg-theme-surface border-theme-strong shadow-sm'
                  : 'bg-theme-surface/40 border-theme-subtle hover:border-theme-strong'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <div className="flex items-center space-x-2 truncate max-w-[65%]">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                      idx === 0
                        ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                        : idx === 1
                        ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30'
                        : idx === 2
                        ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30'
                        : 'bg-theme-card text-theme-muted border border-theme-subtle'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span
                    className="font-medium text-theme-primary truncate"
                    title={item.unvan}
                  >
                    {item.unvan || 'Bilinmeyen Tedarikçi'}
                  </span>
                  {item.vkn && (
                    <span className="text-[10px] text-theme-muted font-mono hidden sm:inline">
                      ({item.vkn})
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="flex items-center space-x-1 text-theme-secondary text-[11px]">
                    <FileText className="w-3 h-3 text-theme-muted" />
                    <span>{item.evrak_sayisi ?? item.irsaliye_sayisi ?? 1} evrak</span>
                  </span>
                  <span className="font-semibold text-theme-primary">
                    {miktar.toLocaleString('tr-TR')}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    %{sharePercentage.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* SVG Progress Bar Container */}
              <div className="w-full bg-theme-card h-2.5 rounded-full overflow-hidden border border-theme-subtle/40">
                <svg viewBox="0 0 100 8" className="w-full h-full block" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`supplierGrad-${idx}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                  <rect
                    x="0"
                    y="0"
                    width={Math.max(barWidthPercent, 2)}
                    height="8"
                    rx="4"
                    fill={`url(#supplierGrad-${idx})`}
                    className="transition-all duration-500"
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
