import { FieldConfig } from '../listing-workspace/models/field-section.model';

/**
 * Simplified field set for the redesigned /optimize General Details tab — a quick-glance
 * listing summary (title, category, price, stock, tags), distinct from the full 28-field
 * General Details tab used on /workspace, which is unaffected by this.
 */
export const LISTING_SUMMARY_FIELDS: readonly FieldConfig[] = [
  { key: 'productTitle', label: 'Product title', maxLength: 150 },
  { key: 'category', label: 'Category', maxLength: 80 },
  { key: 'sku', label: 'SKU', maxLength: 40 },
  { key: 'brand', label: 'Brand', maxLength: 60 },
  { key: 'hsnCode', label: 'HSN Code', maxLength: 20 },
  { key: 'description', label: 'Description', maxLength: 1200, multiline: true },
  // Price is only a hint shown as "Suggested price range" — never auto-filled. Cost price and
  // stock are business numbers the AI can't know from a photo, so it isn't asked for them at all.
  { key: 'suggestedSellingPrice', label: 'Suggested selling price', maxLength: 12 },
  { key: 'suggestedMrp', label: 'Suggested MRP', maxLength: 12 },
  { key: 'searchTags', label: 'Search tags', maxLength: 200 },
];

/** Seller-entered values stored alongside the AI content in the draft's "general" tab. */
export const SELLER_FIELD_KEYS = ['costPrice', 'sellingPrice', 'mrp', 'stock', 'lowStockThreshold'] as const;
