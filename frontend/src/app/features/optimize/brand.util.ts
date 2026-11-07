/**
 * Brand rules shared by the listing editor, Readiness, Publish and Export.
 * "Generic" counts as missing: Flipkart no longer accepts it for many categories (e.g. jewellery)
 * and Amazon only allows it for genuinely unbranded products.
 */
export function isMissingBrand(value: string | null | undefined): boolean {
  const brand = (value ?? '').trim();
  return !brand || /^generic$/i.test(brand);
}

/** The seller's saved brand, exactly as typed (only outer whitespace removed). */
export function cleanSavedBrand(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Where every "Set your brand" link goes. */
export const PROFILE_BRAND_LINK = { path: '/optimize/profile', fragment: 'profile-brand' } as const;
