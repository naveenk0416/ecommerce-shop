// Sign-up profile options — keep in sync with backend/src/utils/signup-fields.ts.

/** All 28 states and 8 union territories of India. */
export const INDIAN_STATES_AND_UTS: readonly string[] = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

/** "How many products do you sell?" — keep values in sync with catalogSizeBands in backend/config/coins.json. */
export const CATALOG_SIZE_BANDS: readonly { value: string; label: string }[] = [
  { value: '1-10', label: '1–10' },
  { value: '11-50', label: '11–50' },
  { value: '51-200', label: '51–200' },
  { value: '200+', label: '200+' },
];

export const SELLING_CHANNELS: readonly string[] = [
  'Meesho', 'Flipkart', 'Amazon', 'Myntra', 'Instagram/WhatsApp', 'Offline shop',
];

/** 10-digit Indian mobile number (starts with 6-9), without the +91 prefix. */
export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Strips spaces/dashes and a pasted leading 0, 91 or +91, leaving the bare digits to validate
 * against INDIAN_MOBILE_RE. Same rules as the backend's toIndianE164.
 */
export function normalizeIndianMobile(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** GSTIN: 2-digit state code, 10-char PAN, entity number, 'Z', checksum character. */
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * "Where do you sell? (select all)" — values are stored in users.marketplaces; keep in sync with
 * MARKETPLACE_VALUES in backend/src/utils/signup-fields.ts.
 */
export type MarketplaceValue = 'amazon' | 'flipkart' | 'meesho' | 'myntra' | 'ajio' | 'social' | 'website' | 'offline' | 'none' | 'other';

export const MARKETPLACE_OPTIONS: readonly { value: MarketplaceValue; en: string; hi: string; icon: string; color: string }[] = [
  { value: 'amazon', en: 'Amazon', hi: 'Amazon', icon: 'shopping_bag', color: '#f97316' },
  { value: 'flipkart', en: 'Flipkart', hi: 'Flipkart', icon: 'storefront', color: '#2563eb' },
  { value: 'meesho', en: 'Meesho', hi: 'Meesho', icon: 'diversity_3', color: '#db2777' },
  { value: 'myntra', en: 'Myntra', hi: 'Myntra', icon: 'checkroom', color: '#e11d48' },
  { value: 'ajio', en: 'AJIO', hi: 'AJIO', icon: 'style', color: '#334155' },
  { value: 'social', en: 'Instagram / WhatsApp', hi: 'Instagram / WhatsApp', icon: 'chat', color: '#16a34a' },
  { value: 'website', en: 'Own website', hi: 'अपनी website', icon: 'language', color: '#0891b2' },
  { value: 'offline', en: 'Offline shop', hi: 'दुकान (offline)', icon: 'store', color: '#92400e' },
  { value: 'none', en: 'Not selling yet', hi: 'अभी नहीं बेचते', icon: 'hourglass_empty', color: '#64748b' },
  { value: 'other', en: 'Other', hi: 'अन्य', icon: 'more_horiz', color: '#64748b' },
];

export const MARKETPLACE_OTHER_MAX = 30;

/**
 * Chip toggle: "Not selling yet" clears every other choice, and picking anything clears it. The
 * result is always in MARKETPLACE_OPTIONS order, so analytics values don't depend on click order.
 */
export function toggleMarketplace(list: readonly string[], value: string, on: boolean): string[] {
  if (on && value === 'none') return ['none'];
  const next = new Set(list.filter((v) => v !== value && (!on || v !== 'none')));
  if (on) next.add(value);
  return MARKETPLACE_OPTIONS.map((o) => o.value as string).filter((v) => next.has(v));
}

/** Older accounts answered "where do you sell?" as display names (SELLING_CHANNELS). */
const LEGACY_CHANNELS: Record<string, MarketplaceValue> = {
  Meesho: 'meesho', Flipkart: 'flipkart', Amazon: 'amazon', Myntra: 'myntra', 'Instagram/WhatsApp': 'social', 'Offline shop': 'offline',
};

/** Chips to pre-tick: the saved answer, else the older sign-up "sells on" list mapped over. */
export function initialMarketplaces(profile: { marketplaces?: string[] | null; sellsOn?: string[] } | null | undefined): string[] {
  if (profile?.marketplaces) return [...profile.marketplaces];
  return [...new Set((profile?.sellsOn ?? []).map((c) => LEGACY_CHANNELS[c]).filter(Boolean))];
}

/** Listing tabs a "where do you sell?" answer puts first (Myntra/AJIO/website/offline have no tab yet). */
const TAB_FOR_MARKETPLACE: Partial<Record<MarketplaceValue, string>> = {
  amazon: 'amazon', flipkart: 'flipkart', meesho: 'meesho', social: 'instagram',
};

/**
 * Stable re-order: tabs for the seller's marketplaces first (in the default order), then the rest.
 * Nothing is ever hidden.
 */
export function orderTabsByMarketplaces<T>(items: readonly T[], tabOf: (item: T) => string, marketplaces: readonly string[] | null | undefined): T[] {
  const preferred = new Set((marketplaces ?? []).map((m) => TAB_FOR_MARKETPLACE[m as MarketplaceValue]).filter(Boolean));
  if (!preferred.size) return [...items];
  return [...items.filter((i) => preferred.has(tabOf(i))), ...items.filter((i) => !preferred.has(tabOf(i)))];
}
