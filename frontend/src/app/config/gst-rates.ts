/**
 * GST rate table — single source of truth for the GST calculator, inventory rate picker and the
 * AI prompts that suggest HSN codes / GST rates.
 *
 * Source: GST 2.0 rate rationalisation, 56th GST Council meeting (3 Sep 2025), implemented by
 * CBIC Notification No. 9/2025-Central Tax (Rate) dated 17.09.2025 (supersedes Notification
 * No. 1/2017-Central Tax (Rate)), effective 22 September 2025.
 *   - Press release with HSN-wise (Annexure-I) and sector-wise (Annexure-II) changes:
 *     https://gstcouncil.gov.in/sites/default/files/2025-09/press_release_press_information_bureau_0.pdf
 *   - Notification index: https://cbic-gst.gov.in/central-tax-rate-notfns.html
 * Rates below are the combined rate (CGST + SGST, or IGST).
 *
 * `verified: false` marks rows that are NOT listed in the 56th Council changes and are carried
 * over from the pre-GST-2.0 schedule — have a CA confirm them before relying on them.
 */

export const GST_EFFECTIVE_DATE = '22 September 2025';

export interface GstSlab {
  rate: number;
  label: string;
}

/** The standard GST 2.0 slabs. 12% and 28% no longer exist for almost all goods. */
export const GST_SLABS: readonly GstSlab[] = [
  { rate: 0, label: '0% — Nil / Exempt' },
  { rate: 5, label: '5% — Merit rate (essentials)' },
  { rate: 18, label: '18% — Standard rate' },
  { rate: 40, label: '40% — Luxury / sin goods' },
];

/** Special rates outside the slabs that still apply to specific goods. */
export const GST_SPECIAL_RATES: readonly GstSlab[] = [
  { rate: 3, label: '3% — Gold, silver, jewellery' },
];

export interface GstCategoryRate {
  category: string;
  hsn: string;
  rate: number;
  note?: string;
  verified: boolean;
}

export const GST_CATEGORY_RATES: readonly GstCategoryRate[] = [
  // Textiles (Annexure-II, 7. Textile sector)
  { category: 'Apparel & clothing accessories (knitted or not)', hsn: '61, 62', rate: 5, note: 'sale value up to ₹2,500 per piece', verified: true },
  { category: 'Apparel & clothing accessories (knitted or not)', hsn: '61, 62', rate: 18, note: 'sale value above ₹2,500 per piece', verified: true },
  { category: 'Other made-up textiles & sets (bedsheets, curtains, towels…)', hsn: '63', rate: 5, note: 'sale value up to ₹2,500 per piece; above ₹2,500 → 18%', verified: true },
  // Footwear (19. Footwear sector)
  { category: 'Footwear', hsn: '64', rate: 5, note: 'sale value up to ₹2,500 per pair; above ₹2,500 → 18%', verified: true },
  // Common man items (10.)
  { category: 'Kitchenware, tableware & utensils of steel, copper, aluminium, ceramic, wood', hsn: '7323, 7418, 7615, 6911, 6912, 4419', rate: 5, note: 'includes steel water bottles', verified: true },
  { category: 'Hair oil, shampoo, toilet soap bars, toothpaste, toothbrush, shaving cream, talcum/face powder', hsn: '3305, 3401, 3306, 9603, 3307, 3304', rate: 5, verified: true },
  { category: 'Combs, hair-slides, hairpins and similar hair accessories', hsn: '9615', rate: 5, verified: true },
  { category: 'Handbags & shopping bags of cotton or jute', hsn: '4202 22', rate: 5, verified: true },
  { category: 'Umbrellas', hsn: '6601', rate: 5, verified: true },
  { category: 'Bicycles (non-motorised)', hsn: '8712', rate: 5, verified: true },
  { category: 'Furniture of bamboo, cane or rattan', hsn: '9403', rate: 5, verified: true },
  // Handicrafts (22.)
  { category: 'Handicrafts: idols, statues, handcrafted candles, handcrafted lamps, art ware of wood/stone/metal/glass, handicraft handbags & jewellery boxes', hsn: '44, 68, 83, 3406, 4202, 4420, 7419, 9405', rate: 5, verified: true },
  { category: 'Candles (non-handcrafted)', hsn: '3406', rate: 5, verified: true },
  // Sports goods & toys (14.)
  { category: 'Sports goods; board games, playing cards, chess, carrom; tricycles, scooters, pedal cars', hsn: '9506, 9504, 9503', rate: 5, note: 'electronic toys and video game consoles excluded', verified: true },
  // Education (9.)
  { category: 'Exercise books, notebooks, pencils, sharpeners, erasers', hsn: '4820, 9608, 9609', rate: 0, verified: true },
  // Consumer electronics (11.)
  { category: 'Air conditioners, dishwashers, TVs & monitors (all sizes)', hsn: '8415, 8422, 8528', rate: 18, verified: true },
  // Transport (13.)
  { category: 'Small cars; motorcycles up to 350 cc; auto parts', hsn: '8703, 8711, 8708', rate: 18, verified: true },
  // De-merit (40%)
  { category: 'Aerated / sugar-added / caffeinated beverages; pan masala', hsn: '2202, 2106 90 20', rate: 40, verified: true },
  { category: 'Mid/large cars, motorcycles above 350 cc', hsn: '8703, 8711', rate: 40, verified: true },
  // Not changed by the 56th Council — carried over, confirm with a CA.
  { category: 'Gold / silver / precious-metal jewellery', hsn: '7113', rate: 3, verified: false },
  { category: 'Imitation (artificial) jewellery', hsn: '7117', rate: 3, verified: false },
  { category: 'Leather / synthetic handbags, wallets (non-handicraft)', hsn: '4202', rate: 18, verified: false },
  { category: 'Cosmetics & make-up (other than talcum/face powder), perfumes', hsn: '3304, 3303', rate: 18, verified: false },
  { category: 'Mobile phones & accessories, electronics not listed above', hsn: '8517, 85', rate: 18, verified: false },
  { category: 'Plastic household articles & bottles', hsn: '3924', rate: 18, verified: false },
  { category: 'Watches', hsn: '9101, 9102', rate: 18, verified: false },
  { category: 'Furniture (other than bamboo/cane), mattresses', hsn: '9401, 9403, 9404', rate: 18, verified: false },
];

/** Every rate a product can carry: the slabs plus the special rates, ascending. */
export const ALL_GST_RATES: readonly number[] = Array.from(
  new Set([...GST_SLABS, ...GST_SPECIAL_RATES].map((s) => s.rate)),
).sort((a, b) => a - b);

/**
 * Plain-text guidance appended to AI prompts that pick an HSN code or GST rate, so the model
 * uses the post-22-Sep-2025 structure instead of the old 5/12/18/28% slabs it was trained on.
 */
export function gstPromptGuidance(): string {
  const rows = GST_CATEGORY_RATES.map(
    (r) => `  - ${r.category} (HSN ${r.hsn}): ${r.rate}%${r.note ? ` — ${r.note}` : ''}`,
  ).join('\n');
  return `GST rates must follow GST 2.0, effective ${GST_EFFECTIVE_DATE} (CBIC Notification 9/2025-Central Tax (Rate)).
The only slabs are 0%, 5%, 18% and 40% (plus 3% for gold/silver/imitation jewellery). 12% and 28% no longer exist
for almost all goods — never output 12% or 28%. For apparel, made-up textiles and footwear the rate depends on the
sale value per piece/pair: up to ₹2,500 → 5%, above ₹2,500 → 18%; use the product's selling price to decide.
Reference rates:
${rows}
If a product is not covered above, use 18% unless it clearly falls in a 5% or 40% category.`;
}
