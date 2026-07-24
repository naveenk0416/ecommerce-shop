/** Parses price display strings ("₹1,299", "1299") or numbers into a plain number. Returns 0 for invalid input. */
export function parsePrice(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  return parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
}
