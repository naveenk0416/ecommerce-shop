/**
 * Single place for business details, marketing claims and tracking IDs.
 *
 * Anything still wrapped in [BRACKETS] is a placeholder that must be replaced with real,
 * verified information before running ads — it is shown as-is on the legal/contact pages so a
 * missing value is obvious rather than silently wrong.
 */

export const BUSINESS = {
  brandName: 'SellAssist',
  legalName: 'PURE ESSENTIALS',
  address: 'L B Nagar, Hyderabad, Telangana 500074, India',
  supportEmail: 'support@sellassist.in',
  /** Shown in the footer/contact page, e.g. '+91 98765 43210'. */
  phoneDisplay: '+91 96666 50416',
  grievanceOfficerName: 'K Naveen Kumar',
  grievanceOfficerEmail: 'grievance@sellassist.in',
  websiteUrl: 'https://sellassist.in',
  /** City whose courts have jurisdiction under the Terms. */
  jurisdictionCity: 'Hyderabad',
};

/**
 * WhatsApp number in international format without "+" or spaces, e.g. '919876543210'.
 * Empty hides the floating "Chat on WhatsApp" button entirely.
 */
export const WHATSAPP_NUMBER = '919666650416';
export const WHATSAPP_PREFILL = 'Hi SellAssist, I want to know more about listing my products.';

/**
 * Meta Pixel IDs (digits only). Every event is sent to each pixel listed here.
 * An empty list disables the pixel — no script is loaded.
 */
export const META_PIXEL_IDS: readonly string[] = ['1777429170044753', '1020160774160627'];

/**
 * Google OAuth "Web application" client ID for "Continue with Google" (Google Cloud Console →
 * APIs & Services → Credentials). The backend needs the same value in GOOGLE_CLIENT_ID.
 * Empty hides the Google button.
 */
export const GOOGLE_CLIENT_ID = '';

/**
 * Payments (Razorpay). false = no Razorpay script is ever loaded, no buy/pay buttons are shown
 * (coin packs show "Notify me" instead) and the developer test checkout box never renders.
 * The backend has its own PAYMENTS_ENABLED env switch and refuses orders while it's off.
 */
export const PAYMENTS_ENABLED = false;

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
