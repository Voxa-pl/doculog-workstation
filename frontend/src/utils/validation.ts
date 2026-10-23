/**
 * DocuLog Turkish Legal Logistics Validation Utilities
 * - T.C. VKN (Vergi Kimlik No) Modulo-10 Checksum Algorithm
 * - T.C. TCKN 11-Digit Algorithmic Verification
 */

export function isValidVKN(vkn: string | null | undefined): boolean {
  if (!vkn) return false;
  const clean = String(vkn).replace(/\D/g, '');
  if (clean.length !== 10) return false;

  const digits = clean.split('').map(Number);
  let vknSum = 0;

  for (let i = 0; i < 9; i++) {
    const d = digits[i];
    const c1 = (d + (9 - i)) % 10;
    let c2 = 0;
    if (c1 !== 0) {
      c2 = (c1 * Math.pow(2, 9 - i)) % 9;
      if (c2 === 0) c2 = 9;
    }
    vknSum += c2;
  }

  const checkDigit = (10 - (vknSum % 10)) % 10;
  return checkDigit === digits[9];
}

export function isValidTCKN(tckn: string | null | undefined): boolean {
  if (!tckn) return false;
  const clean = String(tckn).replace(/\D/g, '');
  if (clean.length !== 11 || clean.startsWith('0')) return false;

  const d = clean.split('').map(Number);
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];

  const d10 = ((oddSum * 7) - evenSum) % 10;
  if (d10 !== d[9]) return false;

  const total10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return total10 % 10 === d[10];
}
