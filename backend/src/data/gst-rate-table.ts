/**
 * GST rate table — the ONLY place listing GST rates come from. The AI suggests an HSN code;
 * utils/gst.ts looks the code up here (longest HSN prefix wins) and, for price-dependent goods,
 * applies the per-piece/per-pair sale value threshold.
 *
 * Version this file: bump GST_TABLE_VERSION whenever a rate changes, so recalculated listings
 * record which table they were priced with (listing.gstTableVersion).
 *
 * Sources:
 *   N9 = CBIC Notification No. 9/2025-Central Tax (Rate), 17.09.2025, effective 22.09.2025
 *        (GST 2.0; supersedes Notification No. 1/2017-Central Tax (Rate)).
 *        https://cbic-gst.gov.in/central-tax-rate-notfns.html
 *   PR = 56th GST Council press release (03.09.2025), Annexure-II sector-wise changes.
 *        https://gstcouncil.gov.in/sites/default/files/2025-09/press_release_press_information_bureau_0.pdf
 *
 * `needsReview: true` = not explicitly listed in the 56th Council changes (carried over from the
 * pre-22-Sep-2025 schedule) or ambiguous. The rate is shown with a warning in the UI and must be
 * confirmed by a CA before it's relied on. Rates are the combined rate (CGST + SGST, or IGST).
 */

export const GST_TABLE_VERSION = '2025-09-22.v1';

const N9 = 'CBIC Notification No. 9/2025-Central Tax (Rate)';
const N9_PR = `${N9}; 56th GST Council press release, Annexure-II`;

/** Sale value threshold (₹ per piece / pair) for price-dependent apparel, made-ups and footwear. */
export const APPAREL_PRICE_THRESHOLD = 2500;

export interface GstRateEntry {
  /** HSN prefixes (digits only) this entry covers: chapter (2), heading (4) or longer. */
  hsn: string[];
  description: string;
  /** Short name used in the reason line, e.g. "apparel". Defaults to the description. */
  label?: string;
  /** Flat rate, or null when the rate depends on the sale value (see priceSlabs). */
  rate: number | null;
  /** For price-dependent goods: rate up to and including `upTo`, and above it. */
  priceSlabs?: { upTo: number; rateUpTo: number; rateAbove: number; unit: 'piece' | 'pair' };
  source: string;
  needsReview?: boolean;
  note?: string;
}

export const GST_RATE_TABLE: readonly GstRateEntry[] = [
  // ---- Apparel, made-ups, footwear (price-dependent) ----
  { hsn: ['61'], description: 'Apparel & clothing accessories, knitted or crocheted', label: 'apparel', rate: null, priceSlabs: { upTo: APPAREL_PRICE_THRESHOLD, rateUpTo: 5, rateAbove: 18, unit: 'piece' }, source: `${N9_PR} (Textile sector)` },
  { hsn: ['62'], description: 'Apparel & clothing accessories, not knitted or crocheted', label: 'apparel', rate: null, priceSlabs: { upTo: APPAREL_PRICE_THRESHOLD, rateUpTo: 5, rateAbove: 18, unit: 'piece' }, source: `${N9_PR} (Textile sector)` },
  { hsn: ['63'], description: 'Other made-up textile articles & sets (bedsheets, curtains, towels…)', label: 'made-up textiles', rate: null, priceSlabs: { upTo: APPAREL_PRICE_THRESHOLD, rateUpTo: 5, rateAbove: 18, unit: 'piece' }, source: `${N9_PR} (Textile sector)` },
  { hsn: ['6309'], description: 'Worn clothing and other worn articles', rate: 5, source: N9, needsReview: true },
  { hsn: ['64'], description: 'Footwear', label: 'footwear', rate: null, priceSlabs: { upTo: APPAREL_PRICE_THRESHOLD, rateUpTo: 5, rateAbove: 18, unit: 'pair' }, source: `${N9_PR} (Footwear sector)` },

  // ---- Jewellery ----
  { hsn: ['7113'], description: 'Jewellery of precious metal (gold, silver)', rate: 3, source: N9, needsReview: true, note: 'Special rate, not changed by the 56th Council — confirm.' },
  { hsn: ['7117'], description: 'Imitation / artificial jewellery', rate: 3, source: N9, needsReview: true, note: 'Most sources still show 3% after 22 Sep 2025, but this is not in the Council change list — confirm with a CA.' },

  // ---- Bags ----
  { hsn: ['420222'], description: 'Handbags & shopping bags of cotton or jute', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['4202'], description: 'Handbags, wallets & cases (leather, synthetic, other)', rate: 18, source: N9, needsReview: true, note: 'Handicraft handbags are 5%.' },

  // ---- Cosmetics & personal care ----
  { hsn: ['3305'], description: 'Hair oil, shampoo & hair preparations', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['3306'], description: 'Toothpaste, dental floss, tooth powder', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['3307'], description: 'Shaving cream & lotions, aftershave', rate: 5, source: `${N9_PR} (Common man items)`, needsReview: true, note: 'Other 3307 goods (deodorants etc.) may be 18%.' },
  { hsn: ['3401'], description: 'Toilet soap bars', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['330491'], description: 'Talcum powder, face powder', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['3304'], description: 'Make-up & skin-care preparations (lipstick, creams…)', rate: 18, source: N9, needsReview: true },
  { hsn: ['3303'], description: 'Perfumes & toilet waters', rate: 18, source: N9, needsReview: true },
  { hsn: ['9615'], description: 'Combs, hair-slides, hairpins & hair accessories', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['960321'], description: 'Toothbrushes', rate: 5, source: `${N9_PR} (Common man items)` },

  // ---- Home decor & handicrafts ----
  { hsn: ['4420'], description: 'Statuettes & ornaments of wood (handicraft)', rate: 5, source: `${N9_PR} (Handicrafts)` },
  { hsn: ['4414'], description: 'Wooden frames for paintings, photos, mirrors', rate: 5, source: `${N9_PR} (Handicrafts)` },
  { hsn: ['6802'], description: 'Stone statues & carved stone products (handicraft)', rate: 5, source: `${N9_PR} (Handicrafts)` },
  { hsn: ['6913'], description: 'Ceramic statuettes & ornamental articles', rate: 5, source: `${N9_PR} (Handicrafts)` },
  { hsn: ['700992'], description: 'Framed mirrors (ornamental)', rate: 5, source: `${N9_PR} (Handicrafts)`, needsReview: true, note: 'Handicraft entry — non-handicraft mirrors may be 18%.' },
  { hsn: ['940510'], description: 'Handcrafted lamps', rate: 5, source: `${N9_PR} (Handicrafts)`, needsReview: true, note: 'Only handcrafted lamps are 5%; other lamps 18%.' },
  { hsn: ['9701', '9702', '9703'], description: 'Paintings, prints, sculptures', rate: 5, source: `${N9_PR} (Handicrafts)` },
  { hsn: ['3406'], description: 'Candles (incl. handcrafted)', rate: 5, source: `${N9_PR} (Common man items / Handicrafts)` },
  { hsn: ['6601'], description: 'Umbrellas', rate: 5, source: `${N9_PR} (Common man items)` },

  // ---- Kitchenware & water bottles ----
  { hsn: ['7323'], description: 'Kitchen & household articles of iron/steel (incl. steel water bottles)', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['7418'], description: 'Kitchen & household articles of copper', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['7615'], description: 'Kitchen & household articles of aluminium', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['6911', '6912'], description: 'Ceramic / porcelain tableware & kitchenware', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['4419'], description: 'Wooden tableware & kitchenware', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['3924'], description: 'Plastic tableware, kitchenware & bottles', rate: 18, source: N9, needsReview: true },
  { hsn: ['7013'], description: 'Glassware (table, kitchen, decor)', rate: 18, source: N9, needsReview: true },

  // ---- Toys, games & sports ----
  { hsn: ['9503'], description: 'Toys (tricycles, scooters, dolls…) other than electronic toys', rate: 5, source: `${N9_PR} (Sports goods and toys)`, needsReview: true, note: 'Electronic toys are 18%.' },
  { hsn: ['9504'], description: 'Playing cards, chess, carrom, board games (not video game consoles)', rate: 5, source: `${N9_PR} (Sports goods and toys)`, needsReview: true, note: 'Video game consoles are excluded.' },
  { hsn: ['9506'], description: 'Sports goods', rate: 5, source: `${N9_PR} (Sports goods and toys)` },

  // ---- Stationery ----
  { hsn: ['4820'], description: 'Exercise books, notebooks, graph & lab books', rate: 0, source: `${N9_PR} (Education)`, needsReview: true, note: 'Registers, diaries and other 4820 goods may differ.' },
  { hsn: ['9609'], description: 'Pencils, crayons, pastels', rate: 0, source: `${N9_PR} (Education)` },
  { hsn: ['960840'], description: 'Propelling / sliding pencils', rate: 0, source: `${N9_PR} (Education)` },
  { hsn: ['9608'], description: 'Pens (ball-point, gel, markers)', rate: 18, source: N9, needsReview: true },

  // ---- Electronics & appliances ----
  { hsn: ['8415', '8422', '8528'], description: 'ACs, dishwashers, TVs & monitors', rate: 18, source: `${N9_PR} (Consumer electronics)` },
  { hsn: ['8517'], description: 'Mobile phones & communication equipment', rate: 18, source: N9, needsReview: true },

  // ---- Other ----
  { hsn: ['8712'], description: 'Bicycles (non-motorised)', rate: 5, source: `${N9_PR} (Common man items)` },
  { hsn: ['9403'], description: 'Furniture', rate: 18, source: N9, needsReview: true, note: 'Bamboo, cane or rattan furniture is 5%.' },
  { hsn: ['220210'], description: 'Aerated / sugar-added beverages', rate: 40, source: `${N9_PR} (Food sector)` },
  { hsn: ['21069020'], description: 'Pan masala', rate: 40, source: `${N9_PR} (Food sector)` },
];
