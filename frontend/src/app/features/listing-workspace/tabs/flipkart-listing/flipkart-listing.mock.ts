import { FieldSection } from '../../models/field-section.model';
import { SeoCheck } from '../../ui/seo-score-card/seo-score.util';

/** Field layout for the Flipkart tab — shared by the AI-driven /optimize variant. */
export const FLIPKART_LISTING_SECTIONS: readonly FieldSection[] = [
  {
    title: 'Listing Content',
    icon: 'article',
    description: 'The title, highlights, and description shown to shoppers.',
    fields: [
      { key: 'seoTitle', label: 'SEO Title', maxLength: 200 },
      { key: 'keyHighlight1', label: 'Key Highlight 1', maxLength: 250 },
      { key: 'keyHighlight2', label: 'Key Highlight 2', maxLength: 250 },
      { key: 'keyHighlight3', label: 'Key Highlight 3', maxLength: 250 },
      { key: 'keyHighlight4', label: 'Key Highlight 4', maxLength: 250 },
      { key: 'keyHighlight5', label: 'Key Highlight 5', maxLength: 250 },
      { key: 'description', label: 'Description', maxLength: 2000, multiline: true },
    ],
  },
  {
    title: 'Search & Discoverability',
    icon: 'manage_search',
    description: 'Terms that help shoppers find this listing on Flipkart.',
    fields: [{ key: 'searchKeywords', label: 'Search Keywords', maxLength: 250, multiline: true }],
  },
  {
    title: 'Product Attributes',
    icon: 'sell',
    description: 'Structured attributes used for Flipkart’s product catalog and filters.',
    fields: [
      { key: 'brand', label: 'Brand', maxLength: 60 },
      { key: 'material', label: 'Material', maxLength: 60 },
      { key: 'color', label: 'Color', maxLength: 40 },
      { key: 'size', label: 'Size', maxLength: 40 },
      { key: 'warranty', label: 'Warranty', maxLength: 120 },
    ],
  },
];

/** Deterministic checks used to score AI-generated Flipkart listings on /optimize. */
export const FLIPKART_SEO_CHECKS: readonly SeoCheck[] = [
  { label: 'Title within 200 characters', test: (get) => get('seoTitle').length > 0 && get('seoTitle').length <= 200 },
  {
    label: 'All 5 key highlights completed',
    test: (get) => [1, 2, 3, 4, 5].every((i) => get(`keyHighlight${i}`).length > 0),
  },
  { label: 'Search keywords under byte limit', test: (get) => get('searchKeywords').length > 0 && get('searchKeywords').length <= 250 },
  { label: 'Description present', test: (get) => get('description').length >= 150 },
  { label: 'Brand field specified', test: (get) => get('brand').length > 0 && get('brand').toLowerCase() !== 'generic' },
];
