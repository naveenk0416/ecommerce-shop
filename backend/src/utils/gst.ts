import { GST_RATE_TABLE, GST_TABLE_VERSION, GstRateEntry } from '../data/gst-rate-table.js';

export interface GstCalculation {
  /** Combined GST rate as a number (e.g. 5), or null when it can't be determined. */
  rate: number | null;
  /** True when the seller should confirm the rate (unknown HSN, missing price, or an unverified table row). */
  needsReview: boolean;
  /** One-line explanation shown next to the HSN code, e.g. "5% — apparel ≤ ₹2,500 per piece (GST 2.0)". */
  reason: string;
  source: string | null;
  matchedHsn: string | null;
  tableVersion: string;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Digits only — "6204 42 20" and "6204.42.20" both become "62044220". */
export function normalizeHsn(hsn: unknown): string {
  return String(hsn ?? '').replace(/\D/g, '');
}

function findEntry(hsn: string): { entry: GstRateEntry; prefix: string } | null {
  let best: { entry: GstRateEntry; prefix: string } | null = null;
  for (const entry of GST_RATE_TABLE) {
    for (const prefix of entry.hsn) {
      if (hsn.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
        best = { entry, prefix };
      }
    }
  }
  return best;
}

/**
 * GST rate for a product from its HSN code and selling price (per piece / pair). The AI never
 * decides the rate — it only suggests the HSN code.
 */
export function calculateGst(hsnInput: unknown, sellingPrice?: unknown): GstCalculation {
  const hsn = normalizeHsn(hsnInput);
  const base = { tableVersion: GST_TABLE_VERSION };

  if (hsn.length < 2) {
    return { ...base, rate: null, needsReview: true, reason: 'Needs review — add an HSN code to calculate GST.', source: null, matchedHsn: null };
  }

  const match = findEntry(hsn);
  if (!match) {
    return { ...base, rate: null, needsReview: true, reason: `Needs review — HSN ${hsn} isn't in the GST 2.0 rate table yet. Confirm the rate with your CA.`, source: null, matchedHsn: null };
  }

  const { entry, prefix } = match;
  const review = entry.needsReview ? ' — needs review' : '';
  const label = entry.label ?? entry.description.split(/[,(]/)[0].trim().toLowerCase();

  if (entry.priceSlabs) {
    const price = Number(sellingPrice);
    const { upTo, rateUpTo, rateAbove, unit } = entry.priceSlabs;
    if (!Number.isFinite(price) || price <= 0) {
      return { ...base, rate: null, needsReview: true, reason: `Needs review — ${label}: ${rateUpTo}% up to ${inr(upTo)} per ${unit}, ${rateAbove}% above. Enter the selling price.`, source: entry.source, matchedHsn: prefix };
    }
    const rate = price <= upTo ? rateUpTo : rateAbove;
    const comparison = price <= upTo ? `≤ ${inr(upTo)}` : `> ${inr(upTo)}`;
    return { ...base, rate, needsReview: !!entry.needsReview, reason: `${rate}% — ${label} ${comparison} per ${unit} (GST 2.0)${review}`, source: entry.source, matchedHsn: prefix };
  }

  return {
    ...base,
    rate: entry.rate,
    needsReview: !!entry.needsReview,
    reason: `${entry.rate}% — ${label} (GST 2.0)${review}${entry.note ? `. ${entry.note}` : ''}`,
    source: entry.source,
    matchedHsn: prefix,
  };
}
