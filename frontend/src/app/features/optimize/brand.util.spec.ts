import { AMAZON_SEO_CHECKS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_SEO_CHECKS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { resolveListingBrand, withListingBrand } from './brand.util';
import { evaluateReadiness } from './optimize-readiness.util';

const f = (v: string) => ({ values: [v], confidence: 80, reason: 'AI' });
const empty = { values: [''], confidence: 0, reason: 'Brand not set — add it in Profile.' };

/** A listing generated with no brand, then "Pure Essentials" typed on General. */
const edited = () => ({
  general: { productTitle: f('Steel Water Bottle 1L'), brand: f('Pure Essentials') },
  amazon: { title: f('Steel Water Bottle 1 Litre'), brand: empty },
  flipkart: { title: f('Steel Water Bottle'), brand: empty },
  meesho: { title: f('Steel Water Bottle'), brand: f('Generic') },
});

describe('one brand per listing', () => {
  it('a brand typed on General reaches Amazon, Flipkart and Meesho without regenerating', () => {
    const out = withListingBrand(edited(), null);
    expect(out.amazon.brand.values[0]).toBe('Pure Essentials');
    expect(out.flipkart.brand.values[0]).toBe('Pure Essentials');
    expect(out.meesho.brand.values[0]).toBe('Pure Essentials');
    expect(out.amazon.brand.reason).not.toContain('Brand not set');
  });

  it('an empty General brand falls back to the Profile default, exactly as typed', () => {
    const results = { ...edited(), general: { brand: empty } };
    expect(resolveListingBrand(results, '  Pure Essentials ')).toEqual({ value: 'Pure Essentials', from: 'profile' });
    expect(withListingBrand(results, 'Pure Essentials').flipkart.brand.values[0]).toBe('Pure Essentials');
  });

  it('a brand changed on General wins over the Profile default', () => {
    const results = { ...edited(), general: { brand: f('Rangoli') } };
    expect(withListingBrand(results, 'Pure Essentials').amazon.brand.values[0]).toBe('Rangoli');
  });

  it('never resolves to "Generic"; with no brand anywhere the field stays empty and says where to fix it', () => {
    const results = { general: { brand: f('Generic') }, amazon: { brand: f('Generic') } };
    const out = withListingBrand(results, null);
    expect(out.amazon.brand.values[0]).toBe('');
    expect(out.amazon.brand.reason).toContain('General');
  });

  it('Readiness passes the brand check once the brand is set on General', () => {
    const before = edited();
    expect(evaluateReadiness(before.amazon, AMAZON_SEO_CHECKS).issues.map((i) => i.label)).toContain('Brand field specified');
    const after = withListingBrand(before, null);
    expect(evaluateReadiness(after.amazon, AMAZON_SEO_CHECKS).issues.map((i) => i.label)).not.toContain('Brand field specified');
    expect(evaluateReadiness(after.flipkart, FLIPKART_SEO_CHECKS).issues.map((i) => i.label)).not.toContain('Brand field specified');
  });

  it('returns the same object when nothing changes (no extra re-renders)', () => {
    const once = withListingBrand(edited(), null);
    expect(withListingBrand(once, null)).toBe(once);
  });
});
