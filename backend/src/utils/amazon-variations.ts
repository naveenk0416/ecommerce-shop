import { AMAZON_INDIA_MARKETPLACE_ID as MARKETPLACE_ID } from './amazon-sp-api.js';
import { skuPart, variantLabel, type Variant } from './variants.js';

/**
 * Amazon parent + child listings for a product with sizes/colours. The parent carries the
 * variation theme and no offer; each child is one size/colour with its own SKU, price and stock.
 * Everything is checked against the product type's schema (Product Type Definitions API) before
 * anything is sent.
 */

export interface FamilyMember {
  /** Variant id; 'parent' for the parent listing. */
  variantId: string;
  label: string;
  sku: string;
  body: { productType: string; requirements: 'LISTING' | 'LISTING_PRODUCT_ONLY'; attributes: Record<string, unknown> };
}

export interface MemberErrors {
  variantId: string;
  label: string;
  sku: string;
  errors: string[];
}

/** Attributes the server fills (or that belong only to the parent / a child). */
const MANAGED = new Set([
  'purchasable_offer', 'fulfillment_availability', 'main_product_image_locator',
  'parentage_level', 'child_parent_sku_relationship', 'variation_theme',
]);

/** Size attributes that need more than a plain value (size system, body type …) — not built yet. */
const STRUCTURED_SIZE_ATTRIBUTES = ['apparel_size', 'footwear_size', 'shapewear_size', 'bottoms_size', 'headwear_size', 'skirt_size', 'shirt_size'];

/** "SIZE_NAME/COLOR_NAME", "COLOR/SIZE", "SIZE_COLOR" → "COLOR+SIZE" (order and _NAME don't matter). */
export function themeKey(theme: string): string {
  return theme.toUpperCase().replace(/_NAME\b/g, '').split(/[/_\s-]+/).filter(Boolean)
    .map((w) => (w === 'COLOUR' ? 'COLOR' : w)).sort().join('+');
}

/** The variation themes this product type allows, from its schema. */
export function allowedThemes(schema: any): string[] {
  const prop = schema?.properties?.['variation_theme'];
  const name = prop?.items?.properties?.name ?? prop?.items?.oneOf?.[0]?.properties?.name;
  const values = name?.enum ?? name?.anyOf?.flatMap((a: any) => a.enum ?? []) ?? [];
  return Array.isArray(values) ? values.map(String) : [];
}

/** SIZE_NAME, COLOR_NAME or SIZE_NAME/COLOR_NAME — whichever spelling the product type allows. */
export function pickVariationTheme(schema: any, variants: Variant[]): { theme?: string; error?: string } {
  const hasSize = variants.some((v) => v.size);
  const hasColour = variants.some((v) => v.colour);
  const want = [hasColour ? 'COLOR' : '', hasSize ? 'SIZE' : ''].filter(Boolean).sort().join('+');
  const allowed = allowedThemes(schema);
  if (!allowed.length) return { error: 'Amazon doesn\'t allow sizes or colours as variations for this product type. Pick another product type.' };
  const theme = allowed.find((t) => themeKey(t) === want);
  if (!theme) {
    const what = want === 'COLOR+SIZE' ? 'size and colour' : want === 'SIZE' ? 'size' : 'colour';
    return { error: `Amazon doesn't allow ${what} variations for this product type (allowed: ${allowed.join(', ')}).` };
  }
  return { theme };
}

/** Test pushes use SA-TEST-… SKUs so they can never collide with a real listing. */
export function familySkus(listingId: string, variants: Variant[], test: boolean): { parent: string; children: Map<string, string> } {
  const short = skuPart(listingId.slice(-8), 8);
  const parent = test ? `SA-TEST-${short}` : `SA-${short}`;
  const children = new Map<string, string>();
  for (const v of variants) {
    children.set(v.id, test
      ? ['SA-TEST', short, skuPart(v.colour, 10), skuPart(v.size, 8)].filter(Boolean).join('-').slice(0, 40)
      : v.sku);
  }
  return { parent, children };
}

const text = (value: string) => [{ value, language_tag: 'en_IN', marketplace_id: MARKETPLACE_ID }];

export interface BuildFamilyInput {
  listing: { id: string; sellingPrice: number; mrp?: number | null; imageUrl?: string };
  variants: Variant[];
  productType: string;
  /** The seller's shared attributes from the Amazon dialog (item_name, brand, bullet_point …). */
  attributes: Record<string, unknown>;
  theme: string;
  schema: any;
  test: boolean;
  photoUrl: (imageId: string) => string;
}

export function buildFamily(input: BuildFamilyInput): { parent: FamilyMember; children: FamilyMember[]; errors: MemberErrors[] } {
  const { listing, variants, productType, schema, theme, test } = input;
  const skus = familySkus(listing.id, variants, test);
  const props = schema?.properties ?? {};
  const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.attributes)) if (!MANAGED.has(key)) shared[key] = value;
  const errors: MemberErrors[] = [];

  const parent: FamilyMember = {
    variantId: 'parent',
    label: 'Parent',
    sku: skus.parent,
    body: {
      productType,
      requirements: 'LISTING_PRODUCT_ONLY',
      attributes: {
        ...shared,
        parentage_level: [{ marketplace_id: MARKETPLACE_ID, value: 'parent' }],
        variation_theme: [{ name: theme }],
      },
    },
  };
  if (listing.imageUrl) parent.body.attributes['main_product_image_locator'] = [{ marketplace_id: MARKETPLACE_ID, media_location: listing.imageUrl }];

  const usesSize = /SIZE/i.test(theme);
  const usesColour = /COLOU?R/i.test(theme);
  const structuredSize = STRUCTURED_SIZE_ATTRIBUTES.find((a) => a in props && required.includes(a));

  const children = variants.map((v): FamilyMember => {
    const sku = skus.children.get(v.id) ?? v.sku;
    const label = variantLabel(v);
    const childErrors: string[] = [];
    const attributes: Record<string, unknown> = {
      ...shared,
      parentage_level: [{ marketplace_id: MARKETPLACE_ID, value: 'child' }],
      child_parent_sku_relationship: [{ marketplace_id: MARKETPLACE_ID, child_relationship_type: 'variation', parent_sku: skus.parent }],
      variation_theme: [{ name: theme }],
    };
    if (usesSize) {
      if (!v.size) childErrors.push('Size is missing.');
      else if ('size' in props || !structuredSize) attributes['size'] = text(v.size);
      else childErrors.push(`Amazon needs "${structuredSize}" (size system and body type) for this product type — SellAssist can't fill that yet. Choose a product type that uses a plain size.`);
    }
    if (usesColour) {
      if (!v.colour) childErrors.push('Colour is missing.');
      else attributes['color'] = text(v.colour);
    }
    const price = v.price ?? listing.sellingPrice;
    const mrp = v.mrp ?? listing.mrp ?? price;
    if (!(price > 0)) childErrors.push('Price is missing.');
    attributes['purchasable_offer'] = [{
      marketplace_id: MARKETPLACE_ID,
      currency: 'INR',
      audience: 'ALL',
      our_price: [{ schedule: [{ value_with_tax: price }] }],
      maximum_retail_price: [{ schedule: [{ value_with_tax: mrp }] }],
    }];
    // A test family is never buyable: stock 0 keeps every child inactive on Amazon.
    attributes['fulfillment_availability'] = [{ fulfillment_channel_code: 'DEFAULT', quantity: test ? 0 : Math.max(0, v.stock) }];
    const photo = v.imageIds?.[0] ? input.photoUrl(v.imageIds[0]) : listing.imageUrl;
    if (photo) attributes['main_product_image_locator'] = [{ marketplace_id: MARKETPLACE_ID, media_location: photo }];

    // Checked against the product type schema before anything goes to Amazon.
    const missing = required.filter((name) => !(name in attributes) && name !== 'purchasable_offer' && name !== 'fulfillment_availability');
    if (missing.length) childErrors.push(`Missing for Amazon: ${missing.join(', ')}.`);
    // Attributes the schema doesn't list are left to Amazon's own validation (next step).
    for (const [name, value] of Object.entries(attributes)) {
      const allowed = props[name]?.items?.properties?.value?.enum;
      const given = Array.isArray(value) ? (value[0] as any)?.value : undefined;
      if (Array.isArray(allowed) && typeof given === 'string' && !allowed.includes(given)) {
        childErrors.push(`${name} "${given}" isn't one of Amazon's values (${allowed.slice(0, 8).join(', ')}${allowed.length > 8 ? ' …' : ''}).`);
      }
    }
    if (!/^[A-Za-z0-9._\-/]{1,40}$/.test(sku)) childErrors.push(`SKU "${sku}" isn't valid for Amazon.`);
    if (childErrors.length) errors.push({ variantId: v.id, label, sku, errors: [...new Set(childErrors)] });
    return { variantId: v.id, label, sku, body: { productType, requirements: 'LISTING', attributes } };
  });

  const skuSet = new Set<string>();
  for (const member of [parent, ...children]) {
    if (skuSet.has(member.sku.toUpperCase())) errors.push({ variantId: member.variantId, label: member.label, sku: member.sku, errors: ['This SKU is used twice.'] });
    skuSet.add(member.sku.toUpperCase());
  }
  return { parent, children, errors };
}
