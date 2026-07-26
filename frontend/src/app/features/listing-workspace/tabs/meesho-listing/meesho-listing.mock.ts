import { FieldSection } from '../../models/field-section.model';
import { SeoCheck } from '../../ui/seo-score-card/seo-score.util';

/** Field layout for the Meesho tab — shared by the AI-driven /optimize variant. */
export const MEESHO_LISTING_SECTIONS: readonly FieldSection[] = [
  {
    title: 'Listing Content',
    icon: 'article',
    description: 'The title and description shown to shoppers.',
    fields: [
      { key: 'listingTitle', label: 'Listing Title', maxLength: 100 },
      { key: 'description', label: 'Product Description', maxLength: 1500, multiline: true },
    ],
  },
  {
    title: 'Search & Discoverability',
    icon: 'manage_search',
    description: 'Terms that help shoppers find this listing on Meesho.',
    fields: [{ key: 'searchKeywords', label: 'Search Keywords', maxLength: 250, multiline: true }],
  },
  {
    title: 'Product Attributes',
    icon: 'sell',
    description: 'Structured attributes used for Meesho’s product catalog and filters.',
    fields: [
      { key: 'brand', label: 'Brand', maxLength: 60 },
      { key: 'color', label: 'Color', maxLength: 40 },
      { key: 'size', label: 'Size', maxLength: 40 },
    ],
  },
];

/** Deterministic checks used to score AI-generated Meesho listings on /optimize. */
export const MEESHO_SEO_CHECKS: readonly SeoCheck[] = [
  { label: 'Title within 100 characters', test: (get) => get('listingTitle').length > 0 && get('listingTitle').length <= 100 },
  { label: 'Description present', test: (get) => get('description').length >= 80 },
  { label: 'Search keywords under byte limit', test: (get) => get('searchKeywords').length > 0 && get('searchKeywords').length <= 250 },
  { label: 'Brand field specified', test: (get) => get('brand').length > 0 && get('brand').toLowerCase() !== 'generic' },
];
