import React from 'react';

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: {
    text: string;
    positive?: boolean;
    neutral?: boolean;
  };
  icon: React.ReactNode;
  progress?: number;
  testId?: string;
  accentColor?: 'blue' | 'emerald' | 'amber' | 'purple';
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  badge,
  icon,
  progress,
  testId,
  accentColor = 'blue',
}) => {
  const colorStyles = {
    blue: {
      iconBg: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      progress: 'bg-blue-500',
    },
    emerald: {
      iconBg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      progress: 'bg-emerald-500',
    },
    amber: {
      iconBg: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      progress: 'bg-amber-500',
    },
    purple: {
      iconBg: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      progress: 'bg-purple-500',
    },
  }[accentColor];

  return (
    <div
      data-testid={testId}
      className="bg-theme-card border border-theme-subtle rounded-xl p-5 shadow-sm transition-all duration-200 hover:border-theme-strong flex flex-col justify-between"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-theme-muted tracking-wide uppercase">
            {title}
          </p>
          <h3 className="text-2xl font-bold tracking-tight text-theme-primary">
            {value}
          </h3>
        </div>
        <div className={`p-2.5 rounded-lg border ${colorStyles.iconBg}`}>
          {icon}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {progress !== undefined && (
          <div className="w-full bg-theme-surface h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colorStyles.progress}`}
              style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          {subtitle && (
            <span className="text-theme-secondary font-medium">
              {subtitle}
            </span>
          )}
          {badge && (
            <span
              className={`px-2 py-0.5 rounded-full font-medium ${
                badge.neutral
                  ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                  : badge.positive
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
