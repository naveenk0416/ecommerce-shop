import crypto from 'node:crypto';
import { SIZE_PRESETS, type Variant } from '../utils/variants.js';

/**
 * Turning one batch product's AI reply into a My Listings draft: the same compact
 * { v, c, r } format as the single-photo flow, plus the batch's common details and sizes.
 */

export interface BatchCommon {
  /** Empty = let the AI detect the category. */
  category?: string;
  brand?: string;
  price?: number;
  mrp?: number;
  costPrice?: number;
  gstHandling?: 'inclusive' | 'exclusive';
  /** "alpha", "waist", … or "custom"; empty = no sizes. */
  sizePreset?: string;
  sizes?: string[];
  /** Stock per size ("" when the product has no sizes). */
  stock?: Record<string, number>;
  /** Optional price per size. */
  sizePrices?: Record<string, number>;
  lowStockThreshold?: number;
}

export interface FieldValue {
  values: string[];
  confidence: number;
  reason: string;
}

export type DraftResults = Record<string, Record<string, FieldValue>>;

const TABS = ['general', 'amazon', 'flipkart', 'meesho', 'instagram'];

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || undefined;
}

function money(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : undefined;
}

function count(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : undefined;
}

/** Validates the "common details" step. Unknown keys are dropped. */
export function sanitizeCommon(raw: unknown): { common?: BatchCommon; error?: string } {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const common: BatchCommon = {};
  const category = text(r['category'], 120);
  if (category) common.category = category;
  const brand = text(r['brand'], 80);
  if (brand) common.brand = brand;
  const price = money(r['price']);
  const mrp = money(r['mrp']);
  const costPrice = money(r['costPrice']);
  if (price) common.price = price;
  if (mrp) common.mrp = mrp;
  if (costPrice) common.costPrice = costPrice;
  if (price && mrp && mrp < price) return { error: 'MRP can\'t be lower than the price.' };
  if (r['gstHandling'] === 'inclusive' || r['gstHandling'] === 'exclusive') common.gstHandling = r['gstHandling'];
  const preset = text(r['sizePreset'], 20);
  if (preset && (preset === 'custom' || preset in SIZE_PRESETS)) common.sizePreset = preset;
  if (Array.isArray(r['sizes'])) {
    const seen = new Set<string>();
    const sizes: string[] = [];
    for (const s of r['sizes']) {
      const size = text(s, 20);
      if (!size || seen.has(size.toLowerCase())) continue;
      seen.add(size.toLowerCase());
      sizes.push(size);
    }
    if (sizes.length > 30) return { error: 'Use at most 30 sizes.' };
    if (sizes.length) common.sizes = sizes;
  }
  const stockRaw = r['stock'] && typeof r['stock'] === 'object' ? r['stock'] as Record<string, unknown> : {};
  const stock: Record<string, number> = {};
  for (const key of common.sizes ?? ['']) {
    const n = count(stockRaw[key]);
    if (stockRaw[key] !== undefined && stockRaw[key] !== '' && n === undefined) return { error: `Stock for ${key || 'this product'} must be a whole number (0 or more).` };
    if (n !== undefined) stock[key] = n;
  }
  if (Object.keys(stock).length) common.stock = stock;
  const pricesRaw = r['sizePrices'] && typeof r['sizePrices'] === 'object' ? r['sizePrices'] as Record<string, unknown> : {};
  const sizePrices: Record<string, number> = {};
  for (const key of common.sizes ?? []) {
    const n = money(pricesRaw[key]);
    if (n) sizePrices[key] = n;
  }
  if (Object.keys(sizePrices).length) common.sizePrices = sizePrices;
  const threshold = count(r['lowStockThreshold']);
  if (threshold !== undefined) common.lowStockThreshold = threshold;
  return { common };
}

/** Extra instructions appended to the single-listing prompt for one batch product. */
export function batchPromptAddition(common: BatchCommon, photoCount: number): string {
  const lines = ['', '', '=== SELLER DETAILS FOR THIS PRODUCT ==='];
  lines.push(common.category
    ? `- Category (given by the seller — use it): ${common.category}`
    : '- Category: detect it from the photos.');
  if (common.brand) lines.push(`- Brand (given by the seller — use it for every brand field): ${common.brand}`);
  if (common.sizes?.length) lines.push(`- Sizes the seller has: ${common.sizes.join(', ')}. Do not invent other sizes.`);
  lines.push('', '=== PHOTOS ===');
  lines.push(photoCount > 1
    ? `There are ${photoCount} photos of the SAME product (front/back/detail, or the same style in different colours). Describe the product from all of them.`
    : 'There is 1 photo of the product.');
  lines.push('Also return "photoColours": one short colour name per photo, in the same order (e.g. "Pink", "Navy Blue"). Use the same name for photos of the same colour.');
  return lines.join('\n');
}

/** Adds photoColours to the client's listing schema. */
export function batchSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = { ...((schema['properties'] as Record<string, unknown>) ?? {}), photoColours: { type: 'array', items: { type: 'string' } } };
  const required = [...new Set([...((schema['required'] as string[]) ?? []), 'photoColours'])];
  return { ...schema, properties, required };
}

interface CompactField { v?: unknown; c?: unknown; r?: unknown }

/** Same as the app's expandCompactResult: { v, c, r } → { values, confidence, reason }. */
export function expandCompact(compact: unknown): DraftResults {
  const out: DraftResults = {};
  const root = compact && typeof compact === 'object' ? compact as Record<string, unknown> : {};
  for (const tab of TABS) {
    const fields = root[tab];
    if (!fields || typeof fields !== 'object') continue;
    out[tab] = {};
    for (const [key, raw] of Object.entries(fields as Record<string, CompactField>)) {
      out[tab][key] = {
        values: Array.isArray(raw?.v) ? raw.v.map((x) => String(x)) : [],
        confidence: typeof raw?.c === 'number' ? raw.c : 0,
        reason: raw?.r ? String(raw.r) : '',
      };
    }
  }
  return out;
}

/** Same rule as the app's normalizeHashtags: #-prefixed, unique, capped. */
function normalizeHashtags(input: string, limit: number, exclude: Iterable<string> = []): string[] {
  const seen = new Set(Array.from(exclude, (t) => t.toLowerCase()));
  const out: string[] = [];
  for (const token of input.split(/[\s,]+/)) {
    const tag = token.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!tag) continue;
    const key = `#${tag}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${tag}`);
    if (out.length >= limit) break;
  }
  return out;
}

const sellerValue = (value: string): FieldValue => ({ values: [value], confidence: 0, reason: 'Entered by seller.' });

/** The draft's tab content: AI results + the batch's common details (which always win). */
export function buildDraftResults(expanded: DraftResults, common: BatchCommon, totalStock: number): DraftResults {
  const results: DraftResults = JSON.parse(JSON.stringify(expanded));
  const ig = results['instagram'];
  if (ig?.['hashtags']) {
    const main = ig['hashtags'].values.map((v) => normalizeHashtags(v, 20));
    ig['hashtags'].values = main.map((t) => t.join(' '));
    if (ig['trendingHashtags']) ig['trendingHashtags'].values = ig['trendingHashtags'].values.map((v, i) => normalizeHashtags(v, 10, main[i] ?? main[0] ?? []).join(' '));
  }
  const general = (results['general'] ??= {});
  if (common.category) general['category'] = { values: [common.category, ...(general['category']?.values ?? []).filter((v) => v !== common.category)].slice(0, 3), confidence: 100, reason: 'Given by seller.' };
  if (common.brand) {
    for (const tab of TABS) if (results[tab]?.['brand']) results[tab]['brand'] = { values: [common.brand], confidence: 100, reason: 'Given by seller.' };
    general['brand'] = { values: [common.brand], confidence: 100, reason: 'Given by seller.' };
  }
  if (common.price) general['sellingPrice'] = sellerValue(String(common.price));
  if (common.mrp) general['mrp'] = sellerValue(String(common.mrp));
  if (common.costPrice !== undefined) general['costPrice'] = sellerValue(String(common.costPrice));
  general['stock'] = sellerValue(String(totalStock));
  if (common.lowStockThreshold !== undefined) general['lowStockThreshold'] = sellerValue(String(common.lowStockThreshold));
  return results;
}

/** Groups the AI's per-photo colours: "Pink", "pink" and "PINK" are one colour. */
export function colourGroups(colours: string[] | undefined, photoIds: string[]): Array<{ colour: string; imageIds: string[] }> {
  const groups: Array<{ colour: string; imageIds: string[] }> = [];
  photoIds.forEach((id, i) => {
    const name = text(colours?.[i], 30);
    if (!name) return;
    const pretty = name.replace(/\b\w/g, (c) => c.toUpperCase());
    const existing = groups.find((g) => g.colour.toLowerCase() === pretty.toLowerCase());
    if (existing) existing.imageIds.push(id);
    else groups.push({ colour: pretty, imageIds: [id] });
  });
  return groups;
}

/**
 * Size × colour children for one product. No sizes and one colour = a plain product (null):
 * its stock is the "" entry. Every colour gets the same stock per size — the seller adjusts it
 * on the review screen.
 */
export function buildVariants(common: BatchCommon, colours: string[] | undefined, photoIds: string[]): Variant[] | null {
  const groups = colourGroups(colours, photoIds);
  const sizes = common.sizes ?? [];
  if (!sizes.length && groups.length <= 1) return null;
  const colourList: Array<{ colour: string | null; imageIds: string[] }> = groups.length ? groups : [{ colour: null, imageIds: photoIds.slice(0, 1) }];
  const sizeList: Array<string | null> = sizes.length ? sizes : [null];
  const variants: Variant[] = [];
  for (const c of colourList) {
    for (const size of sizeList) {
      variants.push({
        id: `v_${crypto.randomBytes(5).toString('hex')}`,
        size,
        colour: c.colour,
        sku: '',
        stock: common.stock?.[size ?? ''] ?? 0,
        price: size ? common.sizePrices?.[size] ?? null : null,
        mrp: null,
        imageIds: c.imageIds,
      });
    }
  }
  return variants;
}
