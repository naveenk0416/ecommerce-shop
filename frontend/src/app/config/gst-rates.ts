/**
 * GST 2.0 slabs for the GST calculator and rate labels in the UI.
 *
 * Per-product GST rates are NOT decided here: the backend calculates them from HSN code + selling
 * price using its versioned table (backend/src/data/gst-rate-table.ts), the single source of
 * truth. This file only lists the slabs themselves.
 *
 * Source: CBIC Notification No. 9/2025-Central Tax (Rate), 17.09.2025, effective 22 September 2025
 * (56th GST Council). https://cbic-gst.gov.in/central-tax-rate-notfns.html
 */

export const GST_EFFECTIVE_DATE = '22 September 2025';

export interface GstSlab {
  rate: number;
  label: string;
}

/** The standard GST 2.0 slabs. 12% and 28% no longer exist for almost all goods. */
export const GST_SLABS: readonly GstSlab[] = [
  { rate: 0, label: '0% — Nil / Exempt' },
  { rate: 5, label: '5% — Merit rate (essentials)' },
  { rate: 18, label: '18% — Standard rate' },
  { rate: 40, label: '40% — Luxury / sin goods' },
];

/** Special rates outside the slabs that still apply to specific goods. */
export const GST_SPECIAL_RATES: readonly GstSlab[] = [
  { rate: 3, label: '3% — Gold, silver, jewellery' },
];

/** Every rate a product can carry: the slabs plus the special rates, ascending. */
export const ALL_GST_RATES: readonly number[] = Array.from(
  new Set([...GST_SLABS, ...GST_SPECIAL_RATES].map((s) => s.rate)),
).sort((a, b) => a - b);
