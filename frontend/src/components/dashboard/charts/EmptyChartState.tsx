import React from 'react';
import { BarChart3, ArrowRight } from 'lucide-react';

export interface EmptyChartStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyChartState: React.FC<EmptyChartStateProps> = ({
  title = 'Veri Bekleniyor',
  description = 'Henüz görselleştirilecek yeterli sevk irsaliyesi verisi bulunmuyor.',
  icon,
  actionText,
  onAction,
}) => {
  return (
    <div className="h-full min-h-[220px] w-full flex flex-col items-center justify-center p-6 text-center rounded-xl bg-theme-surface/40 border border-dashed border-theme-subtle">
      <div className="p-3 rounded-full bg-theme-card text-theme-muted mb-3 border border-theme-subtle">
        {icon || <BarChart3 className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-semibold text-theme-primary mb-1">
        {title}
      </h4>
      <p className="text-xs text-theme-muted max-w-xs mb-4">
        {description}
      </p>
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center space-x-1.5 text-xs font-medium text-blue-500 hover:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-md transition-colors"
        >
          <span>{actionText}</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
