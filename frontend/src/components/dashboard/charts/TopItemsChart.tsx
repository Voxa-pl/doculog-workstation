import React, { useState } from 'react';
import { ItemFrequencyStat } from '../../../types/irsaliye';
import { EmptyChartState } from './EmptyChartState';
import { Boxes, Repeat, Layers } from 'lucide-react';

export interface TopItemsChartProps {
  data: ItemFrequencyStat[];
  onActionToStation?: () => void;
}

export const TopItemsChart: React.FC<TopItemsChartProps> = ({
  data,
  onActionToStation,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div data-testid="chart-top-items" className="h-full">
        <EmptyChartState
          title="Ürün Kalemi Verisi Yok"
          description="Henüz hiçbir irsaliye kalemi ayrıştırılmadı. Sevk irsaliyeleri okundukça en çok gelen malzemeler burada sıralanır."
          actionText="İstasyon'dan İrsaliye Yükle"
          onAction={onActionToStation}
        />
      </div>
    );
  }

  const maxMiktar = Math.max(...data.map((item) => item.toplam_miktar || 0), 1);

  return (
    <div
      data-testid="chart-top-items"
      className="bg-theme-card border border-theme-subtle rounded-xl p-5 shadow-sm flex flex-col justify-between transition-colors duration-200"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-theme-primary">
              En Çok Hareket Gören Malzeme Kalemleri
            </h4>
            <p className="text-xs text-theme-muted">
              Mal kabulü yapılan ürünlerin miktar ve frekans sıralaması
            </p>
          </div>
        </div>

        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-theme-surface text-theme-secondary border border-theme-subtle">
          İlk {data.length} Kalem
        </span>
      </div>

      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
        {data.map((item, idx) => {
          const miktar = item.toplam_miktar || 0;
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
                        ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                        : idx === 1
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : idx === 2
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-theme-card text-theme-muted border border-theme-subtle'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span
                    className="font-medium text-theme-primary truncate"
                    title={item.mal_hizmet}
                  >
                    {item.mal_hizmet}
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="flex items-center space-x-1 text-theme-secondary text-[11px]">
                    <Repeat className="w-3 h-3 text-theme-muted" />
                    <span>{item.frekans} kez</span>
                  </span>
                  <span className="font-bold text-theme-primary">
                    {miktar.toLocaleString('tr-TR')}
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    {item.birim || 'Adet'}
                  </span>
                </div>
              </div>

              {/* SVG Bar Fill Container */}
              <div className="w-full bg-theme-card h-2.5 rounded-full overflow-hidden border border-theme-subtle/40">
                <svg viewBox="0 0 100 8" className="w-full h-full block" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`itemGrad-${idx}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#059669" />
                      <stop offset="100%" stopColor="#14b8a6" />
                    </linearGradient>
                  </defs>
                  <rect
                    x="0"
                    y="0"
                    width={Math.max(barWidthPercent, 2)}
                    height="8"
                    rx="4"
                    fill={`url(#itemGrad-${idx})`}
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
