import crypto from 'node:crypto';

/**
 * Sizes & colours. A listing is the parent product (style); its variants are the size × colour
 * children. A product without sizes has one default variant (size and colour null), so every
 * listing can be read the same way. Listing.quantity is always the sum of the variants' stock.
 */
export interface Variant {
  id: string;
  size: string | null;
  colour: string | null;
  sku: string;
  stock: number;
  /** Per-size price / MRP; null = the product's own price. */
  price: number | null;
  mrp: number | null;
  /** Photos of this colour (ProductImage ids). */
  imageIds: string[];
  /** Set once the child exists on Amazon (created by SellAssist). */
  amazonSku?: string;
  /** Captured by "Sync from Flipkart" when a Flipkart SKU matches this variant's SKU. */
  flipkartProductId?: string;
  flipkartLocationId?: string;
}

export const MAX_VARIANTS = 100;
export const DEFAULT_VARIANT_ID = 'default';

/** Size sets offered in the "Sizes" step. Kept in sync with frontend config/size-presets.ts. */
export const SIZE_PRESETS: Record<string, string[]> = {
  alpha: ['S', 'M', 'L', 'XL', 'XXL'],
  alpha_wide: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  free: ['Free Size'],
  waist: ['28', '30', '32', '34', '36', '38', '40'],
  shoe_uk: ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'],
  kids: ['2-3Y', '3-4Y', '4-5Y', '5-6Y', '6-7Y', '7-8Y', '8-9Y', '9-10Y', '10-11Y', '11-12Y', '12-13Y'],
};

/** The preset that usually fits a category (the AI detects the category from the photo). */
export function suggestSizePreset(category: string, title = ''): keyof typeof SIZE_PRESETS | null {
  const text = `${category} ${title}`.toLowerCase();
  if (/\b(kid|kids|boy|boys|girl|girls|baby|infant|toddler|children)\b/.test(text)) return 'kids';
  if (/\b(shoe|shoes|footwear|sandal|sandals|slipper|slippers|sneaker|sneakers|chappal|heels|flats|juttis?|mojaris?|loafers?|boots?)\b/.test(text)) return 'shoe_uk';
  if (/\b(jeans|trousers?|pants?|chinos?|joggers?|track ?pants?|shorts|palazzos?)\b/.test(text)) return 'waist';
  if (/\b(sarees?|sari|dupattas?|stoles?|scarf|scarves|shawls?|lehenga (choli )?(fabric|material)|dress material|unstitched)\b/.test(text)) return 'free';
  if (/\b(kurtis?|kurtas?|kurta sets?|tops?|t-?shirts?|tees?|shirts?|dress(es)?|gowns?|blouses?|jackets?|hoodies?|sweatshirts?|sweaters?|co-?ord|nightwear|nighty|kaftans?|tunics?|leggings|salwar|anarkali)\b/.test(text)) return 'alpha';
  return null;
}

function cleanLabel(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || null;
}

function cleanMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
}

/** SKU-safe part: "Navy Blue" → "NAVYBLUE", "2-3Y" → "2-3Y". */
export function skuPart(value: string | null | undefined, max: number): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, max);
}

/**
 * SA-<listing>-<COLOUR>-<SIZE>. The listing part is the last 8 characters of its id, so SKUs stay
 * under Amazon's 40-character limit even with long colour names.
 */
export function autoSku(listingId: string, colour: string | null, size: string | null): string {
  return ['SA', skuPart(listingId.slice(-8), 8), skuPart(colour, 12), skuPart(size, 10)].filter(Boolean).join('-');
}

/** Parent (style / group) id shared by all variants of one product. */
export function styleId(listingId: string): string {
  return `SA-${skuPart(listingId.slice(-8), 8)}`;
}

const VALID_SKU = /^[A-Za-z0-9._\-/]{1,40}$/;
const VALID_ID = /^[a-z0-9_]{1,24}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function newVariantId(): string {
  return `v_${crypto.randomBytes(5).toString('hex')}`;
}

export function variantLabel(v: Pick<Variant, 'size' | 'colour'>): string {
  return [v.colour, v.size].filter(Boolean).join(' / ') || 'Default';
}

/**
 * Validates variants from the client. Unknown fields are dropped; stock is a whole number ≥ 0;
 * two variants can't share the same size + colour or the same SKU. Empty SKUs are filled from
 * autoSku once the listing id is known (see assignSkus).
 */
export function sanitizeVariants(raw: unknown): { variants?: Variant[]; error?: string } {
  if (!Array.isArray(raw)) return { error: 'Sizes must be a list.' };
  if (raw.length === 0) return { error: 'Add at least one size.' };
  if (raw.length > MAX_VARIANTS) return { error: `A product can have at most ${MAX_VARIANTS} size/colour combinations.` };
  const out: Variant[] = [];
  const combos = new Set<string>();
  const skus = new Set<string>();
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { error: 'Invalid size entry.' };
    const r = item as Record<string, unknown>;
    const size = cleanLabel(r['size'], 20);
    const colour = cleanLabel(r['colour'] ?? r['color'], 30);
    const stockRaw = r['stock'] === '' || r['stock'] === null || r['stock'] === undefined ? 0 : Number(r['stock']);
    if (!Number.isInteger(stockRaw) || stockRaw < 0 || stockRaw > 1_000_000) {
      return { error: `Stock for ${variantLabel({ size, colour })} must be a whole number (0 or more).` };
    }
    const combo = `${(colour ?? '').toLowerCase()}\u0000${(size ?? '').toLowerCase()}`;
    if (combos.has(combo)) return { error: `${variantLabel({ size, colour })} is listed twice.` };
    combos.add(combo);
    const skuRaw = cleanLabel(r['sku'], 40) ?? '';
    if (skuRaw && !VALID_SKU.test(skuRaw)) return { error: `SKU "${skuRaw}" can only use letters, numbers and - _ . /` };
    if (skuRaw) {
      if (skus.has(skuRaw.toUpperCase())) return { error: `SKU ${skuRaw} is used twice.` };
      skus.add(skuRaw.toUpperCase());
    }
    let id = typeof r['id'] === 'string' && VALID_ID.test(r['id']) ? r['id'] : newVariantId();
    if (ids.has(id)) id = newVariantId();
    ids.add(id);
    const price = cleanMoney(r['price']);
    const mrp = cleanMoney(r['mrp']);
    if (price && mrp && mrp < price) return { error: `MRP for ${variantLabel({ size, colour })} can't be lower than its price.` };
    const imageIds = Array.isArray(r['imageIds']) ? [...new Set(r['imageIds'].filter((x): x is string => typeof x === 'string' && OBJECT_ID.test(x)))].slice(0, 8) : [];
    const v: Variant = { id, size, colour, sku: skuRaw, stock: stockRaw, price, mrp, imageIds };
    for (const key of ['amazonSku', 'flipkartProductId', 'flipkartLocationId'] as const) {
      const val = cleanLabel(r[key], 60);
      if (val) v[key] = val;
    }
    out.push(v);
  }
  return { variants: out };
}

/** Fills empty SKUs with SA-<listing>-<COLOUR>-<SIZE> (suffixing -2, -3 … on a clash). */
export function assignSkus(listingId: string, variants: Variant[], productSku?: string): Variant[] {
  const single = variants.length === 1 && !variants[0].size && !variants[0].colour;
  const taken = new Set(variants.map((v) => v.sku.toUpperCase()).filter(Boolean));
  return variants.map((v) => {
    if (v.sku) return v;
    let sku = single && productSku ? productSku : autoSku(listingId, v.colour, v.size);
    let n = 2;
    while (taken.has(sku.toUpperCase())) sku = `${autoSku(listingId, v.colour, v.size).slice(0, 36)}-${n++}`;
    taken.add(sku.toUpperCase());
    return { ...v, sku };
  });
}

export function totalStock(variants: Array<Pick<Variant, 'stock'>>): number {
  return variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
}

/** True when the product really has sizes/colours (not just the one default variant). */
export function hasRealVariants(variants: Array<Pick<Variant, 'size' | 'colour'>> | undefined | null): boolean {
  return !!variants && (variants.length > 1 || (variants.length === 1 && !!(variants[0].size || variants[0].colour)));
}

/**
 * A listing's variants. Products without sizes/colours have one default variant whose stock is
 * always the listing's `quantity` — marketplace syncs and older code update `quantity` only, so
 * it stays the source of truth there.
 */
export function variantsOf(listing: any): Variant[] {
  const stored = listing?.variants;
  if (hasRealVariants(stored)) return stored as Variant[];
  const qty = Number(listing?.quantity);
  const base = Array.isArray(stored) && stored[0] ? stored[0] : {};
  return [{
    id: DEFAULT_VARIANT_ID,
    size: null,
    colour: null,
    sku: typeof listing?.sku === 'string' && listing.sku ? listing.sku : (base.sku ?? ''),
    stock: Number.isFinite(qty) && qty > 0 ? Math.trunc(qty) : 0,
    price: null,
    mrp: null,
    imageIds: Array.isArray(base.imageIds) ? base.imageIds : [],
  }];
}

/** The stored form of a single-size product: one default variant mirroring `quantity`. */
export function defaultVariant(sku: string, stock: number): Variant {
  return { id: DEFAULT_VARIANT_ID, size: null, colour: null, sku, stock, price: null, mrp: null, imageIds: [] };
}

/** Variants at or below the product's low-stock level ("Pink / M — 2 left"). */
export function lowStockVariants(listing: any, threshold: number): Array<{ id: string; label: string; stock: number }> {
  return variantsOf(listing)
    .filter((v) => v.stock <= threshold)
    .map((v) => ({ id: v.id, label: variantLabel(v), stock: v.stock }));
}

/**
 * Stores a product's sizes/colours on an inventory item (a Mongoose document). With real sizes,
 * stock is kept per variant and `quantity` is their sum; otherwise the product keeps one default
 * variant and `quantity` stays its stock.
 */
export function applyVariants(listing: any, variants: Variant[] | undefined, quantity: number | null | undefined): void {
  const id = listing._id.toString();
  if (variants && hasRealVariants(variants)) {
    const withSkus = assignSkus(id, variants);
    listing.set('variants', withSkus);
    listing.set('quantity', totalStock(withSkus));
    return;
  }
  const stock = quantity ?? variants?.[0]?.stock ?? (Number(listing.get('quantity')) || 0);
  const sku = String(listing.get('sku') || variants?.[0]?.sku || '');
  listing.set('variants', [{ ...defaultVariant(sku, stock), imageIds: variants?.[0]?.imageIds ?? [] }]);
  if (quantity !== undefined || variants) listing.set('quantity', stock);
}
