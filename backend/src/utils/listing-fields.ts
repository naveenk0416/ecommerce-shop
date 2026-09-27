import { calculateGst } from './gst.js';

/** Default "low stock" level when a product doesn't set its own. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/**
 * Parses a money/quantity value that may arrive as a number or as text such as "₹1,299",
 * "1299.00" or "50 units". Returns null for empty/unparseable input.
 */
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

const MONEY_FIELDS = ['sellingPrice', 'costPrice', 'mrp'] as const;
const INTEGER_FIELDS = ['quantity', 'lowStockThreshold'] as const;

/**
 * Normalises the numeric listing fields present in `input` (in place on a copy) and validates
 * them against `existing` values for cross-field rules (MRP ≥ selling price). Returns the
 * cleaned fields or a user-facing error.
 */
export function normalizeListingNumbers(
  input: Record<string, unknown>,
  existing: Record<string, unknown> = {},
): { values: Record<string, number | null>; error?: string } {
  const values: Record<string, number | null> = {};

  for (const field of MONEY_FIELDS) {
    if (!(field in input)) continue;
    const n = parseAmount(input[field]);
    if (n !== null && n < 0) return { values, error: `${label(field)} can't be negative.` };
    values[field] = n === null ? null : Math.round(n * 100) / 100;
  }
  for (const field of INTEGER_FIELDS) {
    if (!(field in input)) continue;
    const n = parseAmount(input[field]);
    if (n !== null && (n < 0 || !Number.isInteger(n))) return { values, error: `${label(field)} must be a whole number of 0 or more.` };
    values[field] = n;
  }

  const selling = 'sellingPrice' in values ? values['sellingPrice'] : parseAmount(existing['sellingPrice']);
  const mrp = 'mrp' in values ? values['mrp'] : parseAmount(existing['mrp']);
  if (selling && mrp && mrp < selling) {
    return { values, error: `MRP (₹${mrp}) can't be lower than the selling price (₹${selling}).` };
  }
  return { values };
}

/** GST fields to store on a listing, calculated from its HSN code and selling price. */
export function gstFieldsFor(hsnCode: unknown, sellingPrice: unknown) {
  const gst = calculateGst(hsnCode, sellingPrice);
  return {
    gstRate: gst.rate,
    gstNeedsReview: gst.needsReview,
    gstReason: gst.reason,
    gstTableVersion: gst.tableVersion,
  };
}

function label(field: string): string {
  return ({ sellingPrice: 'Selling price', costPrice: 'Cost price', mrp: 'MRP', quantity: 'Stock', lowStockThreshold: 'Low-stock level' } as Record<string, string>)[field] ?? field;
}
