/**
 * "5%" for a numeric GST rate; legacy string values ("18%") are shown as stored; null → "—".
 */
export function formatGstRate(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined || rate === '') return '—';
  if (typeof rate === 'number') return `${rate}%`;
  return rate;
}

/**
 * Compact Indian currency that never wraps mid-number: ₹999, ₹12,450, ₹5.25L, ₹1.2Cr.
 * Full amounts below ₹1 lakh; lakhs/crores above.
 */
export function formatInrCompact(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '₹0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, '');
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

/** Parses a seller-typed amount ("₹1,299", "1299", "") into a number, or null when empty/invalid. */
export function parseAmountInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = value.replace(/[₹,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
