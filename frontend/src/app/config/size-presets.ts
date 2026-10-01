/**
 * Size sets for the "Sizes" step (single listing, batch and inventory). Kept in sync with
 * backend/src/utils/variants.ts (SIZE_PRESETS / suggestSizePreset).
 */
export type SizePresetId = 'alpha' | 'alpha_wide' | 'free' | 'waist' | 'shoe_uk' | 'kids';

export interface SizePreset {
  id: SizePresetId;
  en: string;
  hi: string;
  sizes: string[];
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: 'alpha', en: 'S – XXL', hi: 'S – XXL', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { id: 'alpha_wide', en: 'XS – 3XL', hi: 'XS – 3XL', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  { id: 'free', en: 'Free Size', hi: 'Free Size', sizes: ['Free Size'] },
  { id: 'waist', en: 'Waist 28 – 40', hi: 'कमर 28 – 40', sizes: ['28', '30', '32', '34', '36', '38', '40'] },
  { id: 'shoe_uk', en: 'Shoes UK 5 – 11', hi: 'जूते UK 5 – 11', sizes: ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'] },
  { id: 'kids', en: 'Kids 2–3Y … 12–13Y', hi: 'बच्चे 2–3 साल … 12–13 साल', sizes: ['2-3Y', '3-4Y', '4-5Y', '5-6Y', '6-7Y', '7-8Y', '8-9Y', '9-10Y', '10-11Y', '11-12Y', '12-13Y'] },
];

/** The preset that usually fits a category (the AI detects the category from the photo). */
export function suggestSizePreset(category: string, title = ''): SizePresetId | null {
  const text = `${category} ${title}`.toLowerCase();
  if (/\b(kid|kids|boy|boys|girl|girls|baby|infant|toddler|children)\b/.test(text)) return 'kids';
  if (/\b(shoe|shoes|footwear|sandal|sandals|slipper|slippers|sneaker|sneakers|chappal|heels|flats|juttis?|mojaris?|loafers?|boots?)\b/.test(text)) return 'shoe_uk';
  if (/\b(jeans|trousers?|pants?|chinos?|joggers?|track ?pants?|shorts|palazzos?)\b/.test(text)) return 'waist';
  if (/\b(sarees?|sari|dupattas?|stoles?|scarf|scarves|shawls?|dress material|unstitched)\b/.test(text)) return 'free';
  if (/\b(kurtis?|kurtas?|kurta sets?|tops?|t-?shirts?|tees?|shirts?|dress(es)?|gowns?|blouses?|jackets?|hoodies?|sweatshirts?|sweaters?|co-?ord|nightwear|nighty|kaftans?|tunics?|leggings|salwar|anarkali)\b/.test(text)) return 'alpha';
  return null;
}

/** One size × colour of a product (a listing's child). */
export interface Variant {
  id: string;
  size: string | null;
  colour: string | null;
  /** Filled by the server (SA-<listing>-<COLOUR>-<SIZE>) when empty; editable. */
  sku: string;
  stock: number;
  price: number | null;
  mrp: number | null;
  imageIds: string[];
  amazonSku?: string;
  flipkartProductId?: string;
}

export function variantLabel(v: Pick<Variant, 'size' | 'colour'>): string {
  return [v.colour, v.size].filter(Boolean).join(' / ') || 'Default';
}

/** True when the product really has sizes/colours (not just one default variant). */
export function hasRealVariants(variants: Array<Pick<Variant, 'size' | 'colour'>> | null | undefined): boolean {
  return !!variants && (variants.length > 1 || (variants.length === 1 && !!(variants[0].size || variants[0].colour)));
}

export function totalStock(variants: Array<Pick<Variant, 'stock'>>): number {
  return variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
}

let counter = 0;
export function newVariantId(): string {
  counter = (counter + 1) % 1e6;
  return `v_${Date.now().toString(36).slice(-5)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 24).toLowerCase();
}
