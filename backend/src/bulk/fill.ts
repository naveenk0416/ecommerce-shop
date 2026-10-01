import crypto from 'node:crypto';
import { BulkValueCache } from '../api/common.js';
import { coinConfig } from '../config/coins.js';
import { callGemini } from '../utils/gemini.js';
import { calculateGst, normalizeHsn } from '../utils/gst.js';
import type { FieldKey } from './fields.js';
import { hasRealVariants, variantLabel, type Variant } from '../utils/variants.js';
import type { ParsedTemplate, TemplateColumn } from './workbook.js';

export type Marketplace = 'meesho' | 'flipkart';

/** Saved once per seller, reused in every file. */
export interface SellerProfile {
  brand?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  packerName?: string;
  packerAddress?: string;
  countryOfOrigin?: string;
  /** How the seller's prices relate to GST: 'inclusive' (usual in India) or 'exclusive'. */
  gstHandling?: 'inclusive' | 'exclusive';
  pickupPincode?: string;
}

/** One listing from My Listings plus its inventory item (if it was saved to Inventory). */
export interface ListingSource {
  draftId: string;
  results: Record<string, Record<string, { values?: string[] }>>;
  imageUrl: string | null;
  inventory: {
    sku?: string; sellingPrice?: number; mrp?: number; quantity?: number;
    gstRate?: number | null; hsnCode?: string; category?: string; name?: string;
  } | null;
  /** Sizes & colours: one row per variant, all with the same group / style id. */
  variants?: Variant[] | null;
  /** Parent (style / group) id shared by the variants, e.g. SA-1A2B3C4D. */
  styleId?: string;
  /** Public URL of a product photo by id (per-colour photos). */
  photoUrl?: (imageId: string) => string;
}

export type CellStatus = 'filled' | 'adjusted' | 'ai' | 'must_fill' | 'empty';

export interface FilledCell {
  value: string;
  status: CellStatus;
  /** For adjusted cells: the value we had before fitting it to the dropdown. */
  from?: string;
}

export interface FilledRow {
  draftId: string;
  /** draftId, or draftId:variantId for one size/colour of a product. */
  rowKey: string;
  variantId: string | null;
  /** "Pink / M" */
  variantLabel: string | null;
  title: string;
  category: string;
  categoryMismatch: boolean;
  cells: Record<number, FilledCell>;
}

export interface FillReport {
  filledColumns: string[];
  emptyMandatory: Array<{ header: string; rows: number }>;
  adjusted: Array<{ header: string; from: string; to: string }>;
  aiChosen: Array<{ header: string; count: number }>;
  instructions: string[];
  filledPercent: number;
}

const first = (results: ListingSource['results'], tab: string, key: string): string => {
  const v = results?.[tab]?.[key]?.values?.[0];
  return typeof v === 'string' ? v.trim() : '';
};

const normalize = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9%]+/g, ' ').trim();
const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
const tokens = (s: string) => normalize(s).split(' ').filter((w) => w.length > 1).map(stem);

/** Category words overlap ("Kurtis" vs "Women > Ethnic Wear > Kurtis") — else the listing looks wrong for this template. */
export function categoryMatches(templateCategory: string | null, listingCategory: string): boolean {
  if (!templateCategory || !listingCategory) return true;
  const a = new Set(tokens(templateCategory));
  return tokens(listingCategory).some((t) => a.has(t) || [...a].some((x) => x.length > 3 && (t.startsWith(x) || x.startsWith(t))));
}

const SIZE_WORDS: Record<string, string[]> = {
  xxs: ['XXS', '2XS', 'Double Extra Small'],
  xs: ['XS', 'Extra Small', 'X-Small'],
  s: ['S', 'Small'],
  m: ['M', 'Medium'],
  l: ['L', 'Large'],
  xl: ['XL', 'Extra Large', 'X-Large'],
  xxl: ['XXL', '2XL', 'Double Extra Large', 'XX-Large', '2X-Large'],
  '3xl': ['3XL', 'XXXL', 'Triple Extra Large', 'XXX-Large', '3X-Large'],
  '4xl': ['4XL', 'XXXXL', '4X-Large'],
  '5xl': ['5XL', 'XXXXXL', '5X-Large'],
  free: ['Free Size', 'Free', 'One Size', 'Freesize', 'Standard'],
};

/**
 * Other ways a template may spell a size: "M" ↔ "Medium", "XXL" ↔ "2XL", "UK 7" ↔ "7",
 * "2-3Y" ↔ "2-3 Years", "Free Size" ↔ "Free".
 */
export function sizeSpellings(size: string): string[] {
  const s = size.trim();
  const key = s.toLowerCase().replace(/[\s-]+/g, '');
  const out = new Set<string>([s]);
  for (const [k, words] of Object.entries(SIZE_WORDS)) {
    if (k === key || k === key.replace(/size$/, '') || words.some((w) => w.toLowerCase().replace(/[\s-]+/g, '') === key)) words.forEach((w) => out.add(w));
  }
  const uk = /^uk\s*(\d{1,2}(\.5)?)$/i.exec(s);
  if (uk) ['{n}', 'UK {n}', 'UK{n}', '{n} UK', 'IND/UK {n}', 'UK/IND {n}', 'UK/India {n}'].forEach((f) => out.add(f.replace('{n}', uk[1])));
  const kids = /^(\d{1,2})\s*-\s*(\d{1,2})\s*(y|yr|yrs|years?)$/i.exec(s);
  if (kids) {
    const [, a, b] = kids;
    [`${a}-${b}Y`, `${a}-${b} Y`, `${a}-${b} Years`, `${a}-${b} Year`, `${a}-${b} Yrs`, `${a} - ${b} Years`, `${a}-${b}yrs`].forEach((w) => out.add(w));
  }
  if (/^\d{2}$/.test(s)) [`${s} in`, `${s} inch`, `W${s}`, `${s}W`].forEach((w) => out.add(w));
  return [...out];
}

/** Exact or near-exact dropdown match, without AI. */
export function fitAllowed(value: string, allowed: string[]): string | null {
  if (!value) return null;
  const v = normalize(value);
  const exact = allowed.find((a) => normalize(a) === v);
  if (exact) return exact;
  const vs = stem(v.replace(/\s+/g, ''));
  const loose = allowed.find((a) => stem(normalize(a).replace(/\s+/g, '')) === vs);
  if (loose) return loose;
  // "Blue" ⊂ "Navy Blue"? Only accept when exactly one allowed value contains the whole word.
  const containing = allowed.filter((a) => new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalize(a)));
  if (containing.length === 1) return containing[0];
  const within = allowed.filter((a) => normalize(a).length > 2 && new RegExp(`\\b${normalize(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(v));
  if (within.length === 1) return within[0];
  return null;
}

/** GST in the template's own format: 5 / "5%" / "GST_5" / "GST_APPAREL" / 0.05. */
function formatGst(rate: number | null, hsn: string, col: TemplateColumn): string {
  if (rate === null || rate === undefined) return '';
  const apparel = /^(61|62|63|64)/.test(hsn);
  if (col.allowed) {
    if (apparel) {
      const code = col.allowed.find((a) => /apparel/i.test(a));
      if (code) return code;
    }
    const byNumber = col.allowed.find((a) => {
      const n = Number(String(a).replace(/[^0-9.]/g, ''));
      return n === rate || (n > 0 && n < 1 && Math.round(n * 100) === rate);
    });
    return byNumber ?? '';
  }
  return String(rate);
}

/** Values we know for a listing, by field (before fitting to dropdowns). */
function knownValue(field: FieldKey, col: TemplateColumn, src: ListingSource, marketplace: Marketplace, profile: SellerProfile, variant: Variant | null = null): string {
  const r = src.results ?? {};
  const inv = src.inventory ?? {};
  const tab = marketplace;
  const header = col.header.toLowerCase();
  const pick = (...vals: string[]) => vals.find((v) => v && v.toLowerCase() !== 'generic' && v.toLowerCase() !== 'n/a') ?? '';
  if (variant) {
    // One row per size/colour: its own SKU, size, colour, stock, price and colour photo.
    const colourPhoto = variant.imageIds?.[0] && src.photoUrl ? src.photoUrl(variant.imageIds[0]) : '';
    switch (field) {
      case 'sku': return /\bstyle\b/.test(header) ? (src.styleId ?? variant.sku) : variant.sku;
      case 'group_id': return src.styleId ?? '';
      case 'stock': return String(variant.stock ?? 0);
      case 'price': return variant.price ? String(variant.price) : inv.sellingPrice ? String(inv.sellingPrice) : '';
      case 'mrp': return variant.mrp ? String(variant.mrp) : inv.mrp ? String(inv.mrp) : '';
      case 'size': if (variant.size) return variant.size; break;
      case 'color': if (variant.colour) return variant.colour; break;
      case 'main_image': if (colourPhoto) return colourPhoto; break;
      case 'image': if (colourPhoto && !/other|additional|back|side|extra/.test(header) && (col.number ?? 1) <= 1) return colourPhoto; break;
      default: break;
    }
  }
  switch (field) {
    case 'sku': return inv.sku || `SA-${src.draftId}`;
    case 'title': return marketplace === 'meesho'
      ? pick(first(r, 'meesho', 'listingTitle'), first(r, 'general', 'productTitle'), inv.name ?? '')
      : pick(first(r, 'flipkart', 'seoTitle'), first(r, 'general', 'productTitle'), inv.name ?? '');
    case 'description': return pick(first(r, tab, 'description'), first(r, 'general', 'description'));
    case 'bullet': {
      const bullets = [1, 2, 3, 4, 5]
        .map((i) => first(r, 'flipkart', `keyHighlight${i}`) || first(r, 'amazon', `bulletPoint${i}`))
        .filter(Boolean);
      return col.number ? (bullets[col.number - 1] ?? '') : bullets.join('\n');
    }
    case 'keywords': return pick(first(r, tab, 'searchKeywords'), first(r, 'general', 'searchTags'));
    case 'brand': return pick(profile.brand ?? '', first(r, tab, 'brand'), first(r, 'general', 'brand'));
    case 'hsn': return normalizeHsn(inv.hsnCode || first(r, 'general', 'hsnCode'));
    case 'mrp': return inv.mrp ? String(inv.mrp) : '';
    case 'price': return inv.sellingPrice ? String(inv.sellingPrice) : '';
    case 'stock': return typeof inv.quantity === 'number' ? String(inv.quantity) : '';
    case 'color': return pick(first(r, tab, 'color'), first(r, 'amazon', 'color'));
    case 'material': return pick(first(r, 'flipkart', 'material'), first(r, 'amazon', 'material'));
    case 'size': return pick(first(r, tab, 'size'), first(r, 'amazon', 'size'));
    case 'country_of_origin': return profile.countryOfOrigin ?? '';
    case 'manufacturer':
    case 'packer':
    case 'importer': {
      const name = field === 'packer' ? (profile.packerName || profile.manufacturerName) : field === 'manufacturer' ? profile.manufacturerName : '';
      const address = field === 'packer' ? (profile.packerAddress || profile.manufacturerAddress) : field === 'manufacturer' ? profile.manufacturerAddress : '';
      if (/pin ?code|postal|zip/.test(header)) return '';
      if (/address/.test(header)) return address ?? '';
      if (/\bname\b/.test(header)) return name ?? '';
      return [name, address].filter(Boolean).join(', ');
    }
    case 'main_image': return src.imageUrl ?? '';
    // We keep one photo per listing: it goes in the first image column only. "Other / additional /
    // back / side image" columns are further photos, which we don't have.
    case 'image': return /other|additional|back|side|extra/.test(header) || (col.number ?? 1) > 1 ? '' : (src.imageUrl ?? '');
    default: return '';
  }
}

/** Attribute columns we may ask the AI to choose from the dropdown using the listing's text. */
const INFERABLE: ReadonlySet<FieldKey> = new Set(['color', 'material', 'pattern', 'sleeve', 'neck', 'occasion', 'fit', 'length', 'ideal_for', 'size']);

interface AiItem { key: string; col: TemplateColumn; row: number; ourValue: string; context: string }

/** Cache key for a value we have ("navy blue") or, with no value, for the product text the AI read. */
function cacheFrom(ourValue: string, context: string): string {
  return ourValue ? normalize(ourValue) : `ctx:${crypto.createHash('sha1').update(context).digest('hex')}`;
}

/**
 * Builds the filled rows. One Gemini call at most (per file) for dropdown values we couldn't
 * match; value mappings are cached by template hash, so the same category costs nothing next time.
 */
export async function fillRows(
  uid: string,
  template: ParsedTemplate,
  marketplace: Marketplace,
  sources: ListingSource[],
  profile: SellerProfile,
  /** The template checker script runs without a database or AI. */
  options: { useCacheAndAi?: boolean } = {},
): Promise<{ rows: FilledRow[]; report: FillReport }> {
  const useCacheAndAi = options.useCacheAndAi ?? true;
  const rows: FilledRow[] = [];
  const adjusted: FillReport['adjusted'] = [];
  const pendingAi: AiItem[] = [];

  const cached = new Map<string, string>();
  if (useCacheAndAi) for (const row of await BulkValueCache.find({ templateHash: template.hash }).lean() as any[]) cached.set(`${row.column}\u0000${row.from}`, row.to);

  // Products with sizes/colours become one row per variant.
  const expanded: Array<{ src: ListingSource; variant: Variant | null }> = sources.flatMap((src) => (
    hasRealVariants(src.variants) ? src.variants!.map((variant) => ({ src, variant })) : [{ src, variant: null }]
  ));

  expanded.forEach(({ src, variant }, rowIndex) => {
    const r = src.results ?? {};
    const category = first(r, 'general', 'category') || src.inventory?.category || '';
    const title = first(r, marketplace, marketplace === 'meesho' ? 'listingTitle' : 'seoTitle') || first(r, 'general', 'productTitle') || src.inventory?.name || 'Untitled';
    const cells: Record<number, FilledCell> = {};
    // Everything the listing says about the product — the AI may only pick what this text states.
    const context = [...new Set([title, first(r, 'general', 'category'), first(r, 'general', 'description'), first(r, marketplace, 'description'), first(r, 'amazon', 'material')].filter(Boolean))]
      .join(' | ').slice(0, 800);

    for (const col of template.columns) {
      let value = '';
      if (col.field === 'group_id' && variant) {
        value = knownValue('group_id', col, src, marketplace, profile, variant);
      } else if (col.field && !col.neverInvent) {
        if (col.field === 'gst') {
          const hsn = normalizeHsn(src.inventory?.hsnCode || first(r, 'general', 'hsnCode'));
          const rate = typeof src.inventory?.gstRate === 'number' ? src.inventory.gstRate : calculateGst(hsn, src.inventory?.sellingPrice).rate;
          value = formatGst(rate, hsn, col);
        } else {
          value = knownValue(col.field, col, src, marketplace, profile, variant);
        }
      }

      if (value && col.allowed) {
        const cachedFit = cached.get(`${col.header}\u0000${normalize(value)}`);
        // Sizes: "M" also matches "Medium", "UK 7" matches "7", "2-3Y" matches "2-3 Years" …
        const sizeFit = col.field === 'size' ? sizeSpellings(value).map((v) => fitAllowed(v, col.allowed!)).find(Boolean) ?? null : null;
        const fitted = sizeFit ?? fitAllowed(value, col.allowed) ?? (cachedFit || null);
        if (fitted) {
          if (fitted !== value) adjusted.push({ header: col.header, from: value, to: fitted });
          cells[col.col] = fitted === value ? { value, status: 'filled' } : { value: fitted, status: 'adjusted', from: value };
          continue;
        }
        if (col.field === 'brand') {
          // A brand can't be "mapped" to another one: the seller's brand isn't approved in this
          // template's list yet, so they choose (apply for approval, or pick Generic) themselves.
          cells[col.col] = { value: '', status: col.required ? 'must_fill' : 'empty', from: value };
          continue;
        }
        if (cachedFit === '') {
          // Asked before: nothing in the list fits this value.
          cells[col.col] = { value: '', status: col.required ? 'must_fill' : 'empty', from: value };
          continue;
        }
        pendingAi.push({ key: `${col.col}:${rowIndex}`, col, row: rowIndex, ourValue: value, context });
        cells[col.col] = { value: '', status: col.required ? 'must_fill' : 'empty', from: value };
        continue;
      }
      if (!value && col.field === 'brand' && col.allowed) {
        const generic = col.allowed.find((a) => /^generic$/i.test(a));
        if (generic) { cells[col.col] = { value: generic, status: 'adjusted', from: '' }; continue; }
      }
      if (!value && col.allowed && col.field && INFERABLE.has(col.field)) {
        const hit = cached.get(`${col.header}\u0000${cacheFrom('', context)}`);
        if (hit !== undefined) {
          if (hit) { cells[col.col] = { value: hit, status: 'ai' }; continue; }
        } else {
          pendingAi.push({ key: `${col.col}:${rowIndex}`, col, row: rowIndex, ourValue: '', context });
        }
      }
      cells[col.col] = value ? { value, status: 'filled' } : { value: '', status: col.required ? 'must_fill' : 'empty' };
    }
    rows.push({
      draftId: src.draftId,
      rowKey: variant ? `${src.draftId}:${variant.id}` : src.draftId,
      variantId: variant?.id ?? null,
      variantLabel: variant ? variantLabel(variant) : null,
      title, category, categoryMismatch: !categoryMatches(template.category, category), cells,
    });
  });

  const aiChosenCount = new Map<string, number>();
  if (pendingAi.length && useCacheAndAi) {
    const answers = await askGemini(uid, template, pendingAi).catch((err) => {
      console.error('[bulk] dropdown mapping failed', err?.message);
      return new Map<string, string>();
    });
    for (const item of pendingAi) {
      const answer = answers.get(item.key) ?? '';
      // Remember "no good answer" too (as ''), so the same cell doesn't cost another call.
      await BulkValueCache.updateOne(
        { templateHash: template.hash, column: item.col.header, from: cacheFrom(item.ourValue, item.context) },
        { $set: { to: answer } },
        { upsert: true },
      ).catch(() => undefined);
      if (!answer) continue;
      const row = rows[item.row];
      if (item.ourValue) {
        row.cells[item.col.col] = { value: answer, status: 'adjusted', from: item.ourValue };
        adjusted.push({ header: item.col.header, from: item.ourValue, to: answer });
      } else {
        row.cells[item.col.col] = { value: answer, status: 'ai' };
        aiChosenCount.set(item.col.header, (aiChosenCount.get(item.col.header) ?? 0) + 1);
      }
    }
  }

  // Report.
  const filledColumns = template.columns.filter((c) => rows.some((r) => r.cells[c.col]?.value)).map((c) => c.header);
  const emptyMandatory = template.columns
    .filter((c) => c.required)
    .map((c) => ({ header: c.header, rows: rows.filter((r) => !r.cells[c.col]?.value).length }))
    .filter((c) => c.rows > 0);
  const totalRequired = template.columns.filter((c) => c.required).length * rows.length;
  const filledRequired = template.columns.filter((c) => c.required).reduce((n, c) => n + rows.filter((r) => r.cells[c.col]?.value).length, 0);
  const instructions: string[] = [];
  if (!template.columns.some((c) => c.field === 'image' || c.field === 'main_image')) instructions.push('IMAGES_SEPARATE');
  if (rows.some((r) => !r.cells[template.columns.find((c) => c.field === 'price')?.col ?? -1]?.value)) instructions.push('SAVE_TO_INVENTORY_FOR_PRICE');

  return {
    rows,
    report: {
      filledColumns,
      emptyMandatory,
      adjusted: dedupeAdjusted(adjusted),
      aiChosen: [...aiChosenCount.entries()].map(([header, count]) => ({ header, count })),
      instructions,
      filledPercent: totalRequired ? Math.round((filledRequired / totalRequired) * 100) : 100,
    },
  };
}

function dedupeAdjusted(list: FillReport['adjusted']): FillReport['adjusted'] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const k = `${a.header}\u0000${a.from}\u0000${a.to}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** One call for all unmatched dropdown cells of this file. Answers not in the list are dropped. */
async function askGemini(uid: string, template: ParsedTemplate, items: AiItem[]): Promise<Map<string, string>> {
  const byColumn = new Map<number, AiItem[]>();
  for (const item of items) byColumn.set(item.col.col, [...(byColumn.get(item.col.col) ?? []), item]);
  const columns = [...byColumn.entries()].slice(0, 25).map(([col, list]) => {
    const column = list[0].col;
    return {
      column: column.header,
      allowed: (column.allowed ?? []).slice(0, 300),
      cells: list.slice(0, 100).map((i) => ({ id: i.key, ourValue: i.ourValue || null, product: i.context })),
      col,
    };
  });
  const prompt = [
    'You fill dropdown columns of an Indian marketplace bulk-upload template.',
    'For each cell pick exactly one value from that column\'s "allowed" list, copied verbatim.',
    'If "ourValue" is given, pick the allowed value that means the same thing (e.g. "Navy" → "Blue").',
    'If "ourValue" is null, pick a value only when the product text clearly states it (e.g. "3/4 sleeve", "round neck").',
    'If nothing fits or you are not sure, return an empty string. Never guess sizes, measurements or quantities.',
    '',
    JSON.stringify(columns.map(({ col: _col, ...rest }) => rest)),
  ].join('\n');
  const result = await callGemini(uid, 'bulk_mapping', {
    model: coinConfig.ai.assistModel,
    prompt,
    schema: {
      type: 'object',
      properties: { answers: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, value: { type: 'string' } }, required: ['id', 'value'] } } },
      required: ['answers'],
    },
    temperature: 0.1,
    thinkingLevel: coinConfig.ai.assistThinkingLevel,
    maxOutputTokens: 4000,
  }) as { answers?: Array<{ id: string; value: string }> };

  const allowedById = new Map<string, string[]>();
  for (const c of columns) for (const cell of c.cells) allowedById.set(cell.id, c.allowed);
  const out = new Map<string, string>();
  for (const a of result?.answers ?? []) {
    const allowed = allowedById.get(a.id);
    const exact = allowed?.find((v) => v === a.value) ?? allowed?.find((v) => normalize(v) === normalize(a.value ?? ''));
    if (exact) out.set(a.id, exact);
  }
  return out;
}
