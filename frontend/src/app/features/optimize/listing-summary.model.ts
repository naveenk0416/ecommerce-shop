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
  { key: 'costPrice', label: 'Cost price', maxLength: 12 },
  { key: 'sellingPrice', label: 'Selling price', maxLength: 12 },
  { key: 'mrp', label: 'MRP', maxLength: 12 },
  { key: 'stock', label: 'Stock', maxLength: 20 },
  { key: 'searchTags', label: 'Search tags', maxLength: 200 },
];
