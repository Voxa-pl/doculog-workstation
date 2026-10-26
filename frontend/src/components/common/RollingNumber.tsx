import React, { useEffect, useState } from 'react';

interface RollingNumberProps {
  value: number;
  durationMs?: number;
  formatFn?: (val: number) => string;
  className?: string;
}

/**
 * DocuLog - Swiss Tabular Rolling Counter
 * Sayısal değişimleri (doğruluk yüzdesi, toplam miktar) mekanik odometre yumuşaklığıyla akıtır.
 */
export const RollingNumber: React.FC<RollingNumberProps> = ({
  value,
  durationMs = 500,
  formatFn = (v) => Math.round(v).toLocaleString('tr-TR'),
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let startTime: number | null = null;
    const startVal = displayValue;
    const endVal = value;
    const diff = endVal - startVal;

    if (diff === 0) return;

    let animId: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / durationMs, 1);
      // Apple Velvety Deceleration: cubic-bezier(0.16, 1, 0.3, 1) approx
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + diff * ease;

      setDisplayValue(current);

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setDisplayValue(endVal);
      }
    };

    animId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animId);
  }, [value, durationMs]);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {formatFn(displayValue)}
    </span>
  );
};
