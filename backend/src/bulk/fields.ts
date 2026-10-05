/**
 * What each template column means. Headers are matched deterministically first (case, spaces
 * and punctuation ignored, plus synonyms); the order below matters — the first field whose
 * pattern matches wins, so specific patterns come before general ones.
 */
export type FieldKey =
  | 'sku' | 'title' | 'description' | 'bullet' | 'keywords' | 'brand'
  | 'hsn' | 'gst' | 'mrp' | 'price' | 'stock'
  | 'color' | 'material' | 'pattern' | 'sleeve' | 'neck' | 'occasion' | 'size' | 'fit' | 'length' | 'ideal_for'
  | 'net_quantity' | 'country_of_origin' | 'manufacturer' | 'packer' | 'importer'
  | 'image' | 'main_image' | 'generic_name'
  // A dropdown column we don't know by name — the AI may pick a value only if the product text states it.
  | 'attribute'
  // Never filled by us (we don't have them) — always listed under "You must fill" when mandatory.
  | 'weight' | 'dimension' | 'size_chart' | 'model_number' | 'ean' | 'group_id' | 'return_price';

export interface FieldRule {
  key: FieldKey;
  /** Matched against the normalised header (lowercase, single spaces, no punctuation). */
  patterns: RegExp[];
  /** Never filled automatically — we'd have to invent it. */
  neverInvent?: boolean;
}

export const FIELD_RULES: readonly FieldRule[] = [
  { key: 'sku', patterns: [/\b(seller )?sku( id| code)?\b/, /\bstyle (code|id)\b/, /\bproduct id\b(?!.*fsn)/, /\bseller sku\b/] },
  { key: 'group_id', patterns: [/\bgroup id\b/, /\bvariant group\b/, /\bparent sku\b/, /\bstyle group\b/], neverInvent: true },
  // "Image URL 1" is the main photo, but "Other Image URL 1" is the first *additional* one.
  { key: 'main_image', patterns: [/\b(main|primary|front|first) image( url| link)?\b/, /^(?!.*\b(other|additional|back|side|extra)\b).*\bimage (url|link) 1\b/, /^(?!.*\b(other|additional|back|side|extra)\b).*\bimage 1( url| link)?\b/] },
  { key: 'image', patterns: [/\bimage( url| link)?( \d+)?\b/, /\bother image/, /\b(back|side|additional) image/, /\bimages?\b/] },
  { key: 'size_chart', patterns: [/\bsize chart\b/], neverInvent: true },
  { key: 'title', patterns: [/\bproduct (name|title)\b/, /\b(listing )?title\b/, /\bname of (the )?product\b/, /^name$/, /\bproduct name\b/] },
  { key: 'bullet', patterns: [/\bkey (feature|highlight)s?( \d+)?\b/, /\bhighlights?( \d+)?\b/, /\bbullet( point)?s?( \d+)?\b/, /\bfeatures?( \d+)?$/] },
  { key: 'description', patterns: [/\b(product )?description\b/, /\babout (the )?product\b/] },
  { key: 'keywords', patterns: [/\b(search )?keywords?\b/, /\bsearch terms?\b/, /\btags\b/] },
  // "Brand Color" is a colour, not the brand.
  { key: 'brand', patterns: [/\bbrand( name)?\b(?! colou?r)/] },
  { key: 'generic_name', patterns: [/^generic name$/, /^common name$/] },
  { key: 'hsn', patterns: [/\bhsn( code)?\b/] },
  { key: 'gst', patterns: [/\bgst\b/, /\btax (rate|code|slab|percentage)\b/, /\btax %/, /\btax$/] },
  { key: 'mrp', patterns: [/\bmrp\b/, /\bmaximum retail price\b/, /\blist price\b/] },
  // Meesho "Wrong/Defective Returns Price" is not the selling price.
  { key: 'return_price', patterns: [/\b(return|returns|rto|defective)\b.*\bprice\b/], neverInvent: true },
  { key: 'price', patterns: [/\b(selling|sale|your|meesho|offer|supplier|wholesale) price\b/, /\bprice\b/] },
  { key: 'stock', patterns: [/\bstock\b/, /\binventory\b/, /\bquantity available\b/, /\bavailable quantity\b/, /^quantity$/] },
  { key: 'net_quantity', patterns: [/\bnet quantity\b/, /\bnet qty\b/, /\bpack of\b/, /\bnumber of (items|pieces)\b/, /\bpcs\b/] },
  { key: 'country_of_origin', patterns: [/\bcountry of origin\b/, /\borigin country\b/, /\bcountry\b/] },
  { key: 'manufacturer', patterns: [/\bmanufacturer/] },
  { key: 'packer', patterns: [/\bpacker/] },
  { key: 'importer', patterns: [/\bimporter/] },
  { key: 'weight', patterns: [/\bweight\b/], neverInvent: true },
  { key: 'dimension', patterns: [/^product (length|breadth|width|height|depth)$/,/\b(length|breadth|width|height|depth)\b.*\b(cm|mm|inch|package|packaging|shipping)\b/, /\b(package|packaging|shipping) (length|breadth|width|height|dimension)/, /\bdimensions?\b/], neverInvent: true },
  { key: 'model_number', patterns: [/\bmodel (number|no|name|id)\b/], neverInvent: true },
  { key: 'ean', patterns: [/\b(ean|upc|gtin|barcode|isbn)\b/], neverInvent: true },
  { key: 'color', patterns: [/\bcolou?r\b/, /\bshade\b/] },
  { key: 'material', patterns: [/\bfabric\b/, /\bmaterial\b/] },
  { key: 'pattern', patterns: [/\bpattern\b/, /\bprint (type|or pattern)\b/] },
  { key: 'sleeve', patterns: [/\bsleeve/] },
  // "Neck", "Neck Type", "Neckline" — but not "Necklace Width".
  { key: 'neck', patterns: [/\bneck(line)?\b/, /\bcollar\b/] },
  { key: 'occasion', patterns: [/\boccasion\b/] },
  { key: 'ideal_for', patterns: [/\bideal for\b/, /\bgender\b/, /\btarget audience\b/] },
  { key: 'fit', patterns: [/\bfit\b/] },
  { key: 'length', patterns: [/\b(kurta|kurti|dress|top|saree) length\b/, /^length$/, /\blength type\b/] },
  { key: 'size', patterns: [/\bsize\b/, /^variation$/] },
];

export function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r?\n/g, ' ')
    .toLowerCase()
    .replace(/\*/g, ' ')
    .replace(/\((mandatory|required|optional)\)/g, ' ')
    .replace(/[_\-/:.()[\]]+/g, ' ')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The field-name part of a header cell. Meesho puts "Product Name⏎⏎Please enter …" (a long
 * description) in the same cell — only the first line is the name.
 */
export function headerName(raw: unknown): string {
  const lines = String(raw ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return (lines[0] ?? '').replace(/\s*:$/, '');
}

/** Label / system columns that are never filled ("Fields + Description", "ERROR STATUS" …). */
const SKIP_HEADER = /^(fields? (and )?description|field names?|error (status|message)|s ?no|sr ?no|serial (no|number))$/;

export function isSkippedHeader(raw: unknown): boolean {
  return SKIP_HEADER.test(normalizeHeader(headerName(raw).replace(/\+/g, ' and ')));
}

/** The field a header means, or null if we don't recognise it. */
export function matchHeader(raw: unknown): FieldRule | null {
  if (isSkippedHeader(raw)) return null;
  const header = normalizeHeader(headerName(raw));
  if (!header || header.length > 80) return null;
  return FIELD_RULES.find((rule) => rule.patterns.some((p) => p.test(header))) ?? null;
}

/** "Key Feature 3" → 3; used to spread bullet points and images over numbered columns. */
export function headerNumber(raw: unknown): number | null {
  // "Image 1 (Front)" → 1
  const match = /(\d+)\s*\)?\s*$/.exec(normalizeHeader(headerName(raw)).replace(/ (front|back|side|main)$/, ''));
  return match ? Number(match[1]) : null;
}

export function isMandatoryText(raw: unknown): boolean {
  const text = String(raw ?? '').trim();
  return /\*/.test(text) || /\b(mandatory|required|compulsory)\b/i.test(text);
}

/**
 * Allowed values for marketplace system columns when the file carries no dropdown for them.
 * Only values a marketplace has told us. Flipkart's QC error lists internal codes
 * ("Allowed values are: FA,seller,SellerSmart") and rejects "seller" in the sheet — the sheet takes
 * the label from its own dropdown, "Seller" (other options need Flipkart's approval).
 */
const KNOWN_ALLOWED: Array<{ pattern: RegExp; values: string[] }> = [
  { pattern: /^ful+fil+ment by$/, values: ['Seller'] },
];

export function knownAllowedValues(raw: unknown): string[] | null {
  const name = normalizeHeader(headerName(raw));
  return KNOWN_ALLOWED.find((k) => k.pattern.test(name))?.values ?? null;
}
