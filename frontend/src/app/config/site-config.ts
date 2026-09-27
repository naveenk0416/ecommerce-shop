/**
 * Single place for business details, marketing claims and tracking IDs.
 *
 * Anything still wrapped in [BRACKETS] is a placeholder that must be replaced with real,
 * verified information before running ads — it is shown as-is on the legal/contact pages so a
 * missing value is obvious rather than silently wrong.
 */

export const BUSINESS = {
  brandName: 'SellAssist',
  legalName: '[BUSINESS NAME]',
  address: '[ADDRESS]',
  supportEmail: '[SUPPORT EMAIL]',
  /** Shown in the footer/contact page, e.g. '+91 98765 43210'. */
  phoneDisplay: '[NUMBER]',
  grievanceOfficerName: '[GRIEVANCE OFFICER NAME]',
  grievanceOfficerEmail: '[GRIEVANCE OFFICER EMAIL]',
  websiteUrl: 'https://sellassist.in',
  /** City whose courts have jurisdiction under the Terms. */
  jurisdictionCity: '[CITY FOR JURISDICTION]',
};

/**
 * WhatsApp number in international format without "+" or spaces, e.g. '919876543210'.
 * Empty hides the floating "Chat on WhatsApp" button entirely.
 */
export const WHATSAPP_NUMBER = '';
export const WHATSAPP_PREFILL = 'Hi SellAssist, I want to know more about listing my products.';

/** Meta Pixel ID (digits only). Empty disables the pixel — no script is loaded. */
export const META_PIXEL_ID = '';

/** GA4 measurement ID — already loaded via gtag in index.html. */
export const GA4_MEASUREMENT_ID = 'G-NYCJ00ML3F';

/**
 * Landing-page trust stats. Only switch SHOW_STATS on once every number below is verified —
 * these are shown to paid-ad traffic and must be truthful.
 */
export const SHOW_STATS = false;
export const MARKETING_STATS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '[X]', label: 'Listings Created' },
  { value: '[Y]', label: 'Active Sellers' },
  { value: '[Z]', label: 'GST Accuracy' },
  { value: '[R]', label: 'Seller Rating' },
];

/** Date shown as "Last updated" on the legal pages. Update whenever their text changes. */
export const LEGAL_LAST_UPDATED = '27 September 2026';
