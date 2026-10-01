// Sign-up profile fields — keep these lists in sync with frontend/src/app/config/signup-options.ts.

/** All 28 states and 8 union territories of India. */
export const INDIAN_STATES_AND_UTS: readonly string[] = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export const SELLING_CHANNELS: readonly string[] = [
  'Meesho', 'Flipkart', 'Amazon', 'Myntra', 'Instagram/WhatsApp', 'Offline shop',
];

/** 10-digit Indian mobile number (starts with 6-9), without the +91 prefix. */
export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Normalises a pasted/typed Indian mobile to E.164 (+91XXXXXXXXXX), or null if invalid. Accepts
 * spaces/dashes and a leading 0, 91 or +91 — the same rules as the sign-up form.
 */
export function toIndianE164(raw: unknown): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return INDIAN_MOBILE_RE.test(digits) ? `+91${digits}` : null;
}

/** Both stored forms of a number — older accounts saved the bare 10 digits. */
export function phoneLookupValues(e164: string): string[] {
  return [e164, e164.slice(3)];
}

/** GSTIN: 2-digit state code, 10-char PAN, entity number, 'Z', checksum character. */
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// `ref` is the referral code from a sellassist.in/?ref=CODE link, stored with the UTM attribution.
const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid', 'ref', 'landingPath', 'capturedAt'] as const;

/** Keeps only known attribution keys as short strings — the client controls this payload. */
export function sanitizeAttribution(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 200);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * "Where do you sell?" answers (users.marketplaces) — keep in sync with MARKETPLACE_OPTIONS in
 * frontend/src/app/config/signup-options.ts. 'social' = Instagram / WhatsApp, 'none' = not selling yet.
 */
export const MARKETPLACE_VALUES = ['amazon', 'flipkart', 'meesho', 'myntra', 'ajio', 'social', 'website', 'offline', 'none', 'other'] as const;
export const MARKETPLACE_OTHER_MAX = 30;

/**
 * Known values only (unknown ones are dropped, not rejected), de-duplicated, in the canonical
 * order. "none" can't be combined with anything else — if both come in, "none" is dropped because
 * the seller actively picked a channel. The "Other" text is kept only when "other" is selected.
 */
export function sanitizeMarketplaces(raw: unknown, otherRaw: unknown): { marketplaces: string[]; other: string | null } {
  const picked = new Set(
    (Array.isArray(raw) ? raw : [])
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim().toLowerCase()),
  );
  let marketplaces: string[] = MARKETPLACE_VALUES.filter((v) => picked.has(v));
  if (marketplaces.includes('none') && marketplaces.length > 1) marketplaces = marketplaces.filter((v) => v !== 'none');
  const other = marketplaces.includes('other')
    ? String(otherRaw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MARKETPLACE_OTHER_MAX) || null
    : null;
  return { marketplaces, other };
}
