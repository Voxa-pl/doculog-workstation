/**
 * Turkish and International Number Parsing Utility
 * Handles Turkish formats (e.g. "1.250,50", "570,5", "100")
 * as well as standard English formats (e.g. 570.5, "570.5")
 */
export const parseTurkishNumber = (val: any): number | null => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  const str = String(val).trim();
  if (!str) return null;

  // Hem binlik nokta hem ondalık virgül varsa: "1.250,50" -> 1250.50
  if (str.includes('.') && str.includes(',')) {
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Sadece virgül varsa: "570,5" -> 570.5
  if (str.includes(',')) {
    const parsed = parseFloat(str.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Standart ondalık noktalı sayı veya string: "570.5" -> 570.5
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Format a number nicely for Turkish locale display
 */
export const formatTurkishNumber = (val: number | null | undefined, maxDecimals: number = 2): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '0';
  return val.toLocaleString('tr-TR', { maximumFractionDigits: maxDecimals });
};
