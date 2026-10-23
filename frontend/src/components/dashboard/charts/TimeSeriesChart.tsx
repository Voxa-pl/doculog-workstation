import React, { useState } from 'react';
import { TimeSeriesPoint } from '../../../types/irsaliye';
import { EmptyChartState } from './EmptyChartState';
import { TrendingUp, Calendar } from 'lucide-react';

export interface TimeSeriesChartProps {
  data?: TimeSeriesPoint[] | null;
  onActionToStation?: () => void;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  onActionToStation,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const safeData = Array.isArray(data) ? data : [];

  if (safeData.length === 0) {
    return (
      <div data-testid="chart-timeseries" className="h-full min-w-0">
        <EmptyChartState
          title="Zaman Serisi Verisi Yok"
          description="Sisteme henüz tarihli irsaliye kaydedilmedi. İrsaliyeler işlendikçe akış grafiği otomatik oluşur."
          actionText="İstasyon'dan İrsaliye Yükle"
          onAction={onActionToStation}
        />
      </div>
    );
  }

  const width = 560;
  const height = 240;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxQuantityRaw = Math.max(
    ...safeData.map((d) => {
      const v = Number(d?.toplam_miktar);
      return Number.isFinite(v) ? v : 0;
    }),
    10
  );
  const maxQuantity = Number.isFinite(maxQuantityRaw) && maxQuantityRaw > 0 ? maxQuantityRaw : 10;

  const maxDocsRaw = Math.max(
    ...safeData.map((d) => {
      const v = Number(d?.evrak_sayisi ?? d?.toplam_evrak);
      return Number.isFinite(v) ? v : 1;
    }),
    5
  );
  const maxDocs = Number.isFinite(maxDocsRaw) && maxDocsRaw > 0 ? maxDocsRaw : 5;

  const getX = (index: number) => {
    if (safeData.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (safeData.length - 1)) * chartWidth;
  };

  const getY = (val: number, max: number) => {
    const safeVal = Number.isFinite(val) ? val : 0;
    const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
    const clampedRatio = Math.min(Math.max(safeVal / safeMax, 0), 1);
    return paddingTop + chartHeight - clampedRatio * chartHeight;
  };

  // Build SVG Path for Area and Line
  const points = safeData.map((d, i) => {
    const qty = Number(d?.toplam_miktar);
    const docCount = Number(d?.evrak_sayisi ?? d?.toplam_evrak);
    return {
      x: getX(i),
      yQty: getY(Number.isFinite(qty) ? qty : 0, maxQuantity),
      yDoc: getY(Number.isFinite(docCount) ? docCount : 0, maxDocs),
      data: d,
    };
  });

  const linePath =
    points.length === 1
      ? `M ${paddingLeft} ${points[0].yQty} L ${width - paddingRight} ${points[0].yQty}`
      : points.reduce(
          (acc, p, i) => (i === 0 ? `M ${p.x} ${p.yQty}` : `${acc} L ${p.x} ${p.yQty}`),
          ''
        );

  const areaPath =
    points.length === 1
      ? `M ${paddingLeft} ${points[0].yQty} L ${width - paddingRight} ${points[0].yQty} L ${width - paddingRight} ${paddingTop + chartHeight} L ${paddingLeft} ${paddingTop + chartHeight} Z`
      : `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

  // Grid levels (4 horizontal lines)
  const gridLines = [0, 0.33, 0.66, 1].map((ratio) => {
    const y = paddingTop + chartHeight * (1 - ratio);
    const label = Math.round(maxQuantity * ratio);
    return { y, label: Number.isFinite(label) ? label : 0 };
  });

  const activePoint = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null;

  return (
    <div
      data-testid="chart-timeseries"
      className="bg-theme-card border border-theme-subtle rounded-xl p-4 sm:p-5 shadow-sm flex flex-col justify-between relative transition-colors duration-200 min-w-0"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 min-w-0">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-theme-primary truncate">
              Evrak ve Mal Kabul Hacmi Trendi
            </h4>
            <p className="text-xs text-theme-muted truncate">
              Günlük sevkiyat akışı ve teslim alınan toplam miktar
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs shrink-0">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-theme-secondary font-medium">Toplam Miktar</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-theme-secondary font-medium">Evrak Sayısı</span>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="timeseriesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {gridLines.map((gl, i) => (
            <g key={i}>
              <line
                x1={paddingLeft}
                y1={gl.y}
                x2={width - paddingRight}
                y2={gl.y}
                stroke="var(--chart-grid)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 8}
                y={gl.y + 4}
                textAnchor="end"
                className="text-[10px] fill-current"
                fill="var(--chart-axis)"
              >
                {gl.label}
              </text>
            </g>
          ))}

          {/* Area Fill */}
          <path d={areaPath} fill="url(#timeseriesGradient)" />

          {/* Main Quantity Line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--chart-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Data Points */}
          {points.map((p, i) => {
            const isHovered = hoveredIndex === i;
            const dateStr = p.data?.tarih || 'Tarih';
            return (
              <g key={i} className="cursor-pointer">
                {/* Vertical hover marker line */}
                {isHovered && (
                  <line
                    x1={p.x}
                    y1={paddingTop}
                    x2={p.x}
                    y2={paddingTop + chartHeight}
                    stroke="var(--chart-line)"
                    strokeDasharray="2 2"
                    strokeWidth="1.5"
                    opacity="0.8"
                  />
                )}

                {/* Point circle */}
                <circle
                  cx={p.x}
                  cy={p.yQty}
                  r={isHovered ? 6 : 4}
                  fill="var(--bg-card)"
                  stroke="var(--chart-line)"
                  strokeWidth={isHovered ? 3 : 2}
                  className="transition-all duration-150"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />

                {/* Transparent larger hit target */}
                <circle
                  cx={p.x}
                  cy={p.yQty}
                  r={18}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />

                {/* X Axis Date Labels */}
                <text
                  x={p.x}
                  y={height - 8}
                  textAnchor="middle"
                  className="text-[10px] fill-current"
                  fill="var(--chart-axis)"
                >
                  {dateStr.length > 10 ? `${dateStr.substring(0, 8)}...` : dateStr}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip Card */}
        {activePoint && (
          <div
            className="absolute pointer-events-none z-20 bg-theme-surface border border-theme-strong p-2.5 rounded-lg shadow-xl text-xs space-y-1 transform -translate-x-1/2 -translate-y-full transition-all duration-75"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${Math.max(15, (activePoint.yQty / height) * 100 - 6)}%`,
            }}
          >
            <div className="flex items-center space-x-1.5 text-theme-muted font-semibold border-b border-theme-subtle pb-1">
              <Calendar className="w-3 h-3 text-blue-500" />
              <span>{activePoint.data.tarih}</span>
            </div>
            <div className="flex justify-between space-x-4">
              <span className="text-theme-secondary">Toplam Miktar:</span>
              <span className="font-bold text-blue-500">
                {(Number(activePoint.data.toplam_miktar) || 0).toLocaleString('tr-TR')}
              </span>
            </div>
            <div className="flex justify-between space-x-4">
              <span className="text-theme-secondary">Evrak Adedi:</span>
              <span className="font-semibold text-theme-primary">
                {activePoint.data.evrak_sayisi ?? activePoint.data.toplam_evrak ?? 0}
              </span>
            </div>
            {(activePoint.data.onaylanan_sayisi !== undefined ||
              activePoint.data.onaylanan_evrak !== undefined) && (
              <div className="flex justify-between space-x-4">
                <span className="text-theme-secondary">Onaylanan:</span>
                <span className="font-semibold text-emerald-500">
                  {activePoint.data.onaylanan_sayisi ?? activePoint.data.onaylanan_evrak ?? 0}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
