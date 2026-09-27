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
