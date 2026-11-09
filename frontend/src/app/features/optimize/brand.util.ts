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

/** Marketplace tabs that carry a Brand field (checked by SEO, Readiness and the exports). */
export const BRAND_TABS = ['amazon', 'flipkart', 'meesho'] as const;

/** Accepts both the editor's AiFieldExtraction and the saved DraftResults shape. */
interface BrandField { values: string[]; confidence: number | null; reason: string | null }
type Results = Partial<Record<string, Record<string, BrandField>>>;

/**
 * The listing has one brand: the General tab's (what the seller typed), else the Profile default,
 * else a real brand a marketplace tab still holds from generation. "Generic" never counts.
 */
export function resolveListingBrand(results: Results, profileBrand: string | null | undefined): { value: string; from: 'general' | 'profile' | 'tab' | null } {
  const general = cleanSavedBrand(results['general']?.['brand']?.values?.[0]);
  if (!isMissingBrand(general)) return { value: general, from: 'general' };
  const saved = cleanSavedBrand(profileBrand);
  if (!isMissingBrand(saved)) return { value: saved, from: 'profile' };
  for (const tab of BRAND_TABS) {
    const own = cleanSavedBrand(results[tab]?.['brand']?.values?.[0]);
    if (!isMissingBrand(own)) return { value: own, from: 'tab' };
  }
  return { value: '', from: null };
}

/**
 * The marketplace tabs as they should be read: each one's Brand is the listing's brand (above), so
 * a brand typed on General or saved in Profile reaches Amazon, Flipkart, Meesho, Readiness and the
 * Excel exports without regenerating. Other AI candidates are kept for Regenerate.
 */
export function withListingBrand<T extends Results>(results: T, profileBrand: string | null | undefined): T {
  const brand = resolveListingBrand(results, profileBrand);
  const reason = brand.from === 'general' ? 'Your brand from General.'
    : brand.from === 'profile' ? 'Your default brand from Profile.'
      : brand.from === 'tab' ? null
        : 'Brand not set — enter it on General, or set a default brand in Profile.';
  let out: T | null = null;
  for (const tab of BRAND_TABS) {
    const fields = results[tab];
    if (!fields) continue;
    const current = fields['brand'];
    if (brand.from === 'tab' && !isMissingBrand(current?.values?.[0])) continue;
    if (current?.values?.[0] === brand.value && current.reason === (reason ?? current.reason)) continue;
    const rest = (current?.values ?? []).slice(1).filter((v) => v !== brand.value);
    out ??= { ...results };
    (out as Results)[tab] = {
      ...fields,
      brand: { values: [brand.value, ...rest], confidence: brand.value ? 100 : 0, reason: reason ?? current?.reason ?? '' },
    };
  }
  return out ?? results;
}

/** Where every "Set your brand" link goes. */
export const PROFILE_BRAND_LINK = { path: '/optimize/profile', fragment: 'profile-brand' } as const;
