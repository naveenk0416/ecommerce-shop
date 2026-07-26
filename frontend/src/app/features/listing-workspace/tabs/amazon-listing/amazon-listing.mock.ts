import { SeoScoreCriterion } from '../../ui/seo-score-card/seo-score-card';
import { SeoCheck } from '../../ui/seo-score-card/seo-score.util';

export interface AmazonFieldConfig {
  key: string;
  label: string;
  maxLength: number;
  multiline?: boolean;
}

export interface AmazonSection {
  title: string;
  icon: string;
  description: string;
  fields: AmazonFieldConfig[];
}

export const AMAZON_LISTING_SECTIONS: readonly AmazonSection[] = [
  {
    title: 'Listing Content',
    icon: 'article',
    description: 'The title, bullet points, and description shown to shoppers.',
    fields: [
      { key: 'seoTitle', label: 'SEO Title', maxLength: 200 },
      { key: 'bulletPoint1', label: 'Bullet Point 1', maxLength: 250 },
      { key: 'bulletPoint2', label: 'Bullet Point 2', maxLength: 250 },
      { key: 'bulletPoint3', label: 'Bullet Point 3', maxLength: 250 },
      { key: 'bulletPoint4', label: 'Bullet Point 4', maxLength: 250 },
      { key: 'bulletPoint5', label: 'Bullet Point 5', maxLength: 250 },
      { key: 'description', label: 'Description', maxLength: 2000, multiline: true },
    ],
  },
  {
    title: 'Search & Discoverability',
    icon: 'manage_search',
    description: 'Hidden and structured terms that help shoppers find this listing.',
    fields: [
      { key: 'backendKeywords', label: 'Backend Keywords', maxLength: 250, multiline: true },
      { key: 'searchTerms', label: 'Search Terms', maxLength: 250, multiline: true },
      { key: 'subjectKeywords', label: 'Subject Keywords', maxLength: 250, multiline: true },
    ],
  },
  {
    title: 'Product Attributes',
    icon: 'sell',
    description: 'Structured attributes used for Amazon’s product catalog and filters.',
    fields: [
      { key: 'brand', label: 'Brand', maxLength: 60 },
      { key: 'material', label: 'Material', maxLength: 60 },
      { key: 'color', label: 'Color', maxLength: 40 },
      { key: 'size', label: 'Size', maxLength: 40 },
      { key: 'variation', label: 'Variation', maxLength: 60 },
      { key: 'warranty', label: 'Warranty', maxLength: 120 },
    ],
  },
];

export const AMAZON_LISTING_MOCK_VALUES: Record<string, string> = {
  seoTitle: 'Flower Shaped Hair Claw Clips for Women, Pack of 6 Multicolor Acrylic Hair Clips for Thick & Thin Hair',
  bulletPoint1: 'SECURE HOLD: Strong metal spring delivers a firm, comfortable grip that stays put all day without slipping.',
  bulletPoint2: 'SET OF 6: Includes 6 vibrant floral colors so you always have a matching clip for any outfit.',
  bulletPoint3: 'GENTLE ON HAIR: Smooth acrylic edges hold hair securely without pulling, snagging, or breakage.',
  bulletPoint4: 'VERSATILE STYLING: Works for thick, thin, curly, or straight hair; perfect for daily wear, work, or parties.',
  bulletPoint5: 'THOUGHTFUL GIFT: A charming, ready-to-gift accessory for daughters, sisters, friends, or yourself.',
  description:
    'Upgrade your everyday hairstyle with this set of 6 flower-shaped hair claw clips. Crafted from durable, lightweight acrylic with a reinforced metal spring, each clip offers a secure hold that lasts from your morning commute to your evening plans. The floral design adds a playful, feminine touch to any look, while the smooth finish protects your hair from damage. Lightweight enough for all-day comfort, these clips work beautifully on thick, thin, straight, or curly hair.',
  backendKeywords: 'hair claw clips, flower hair clips, acrylic claw clips, hair accessories women, big hair clips',
  searchTerms: 'claw clip set, hair clips for thick hair, flower claw clip, cute hair accessories, banana clip alternative',
  subjectKeywords: 'hair clip, claw clip, flower clip, hair accessory, clip set',
  brand: 'Sellassist Basics',
  material: 'Acrylic with Stainless Steel Spring',
  color: 'Multicolor (Blue, Red, Yellow, Orange, Pink, Green)',
  size: 'Medium (7.5 cm)',
  variation: 'Pack of 6 - Floral Multicolor',
  warranty: '6-month manufacturer warranty against defects',
};

export const AMAZON_LISTING_SUGGESTIONS: Record<string, string[]> = {
  seoTitle: [
    'Flower Shaped Hair Claw Clips for Women, Pack of 6 Multicolor Acrylic Hair Clips for Thick & Thin Hair',
    '6 Pcs Flower Hair Claw Clips - Strong Hold Acrylic Clips for Women & Girls, Multicolor',
    'Cute Flower Claw Clips (Set of 6) - Non-Slip Hair Clips for Thick, Curly & Thin Hair',
  ],
  bulletPoint1: [
    'SECURE HOLD: Strong metal spring delivers a firm, comfortable grip that stays put all day without slipping.',
    'ALL-DAY GRIP: Reinforced spring mechanism keeps hair in place through work, workouts, and everything in between.',
    'NO-SLIP DESIGN: Sturdy jaw tension holds even the slipperiest hair securely without loosening.',
  ],
  bulletPoint2: [
    'SET OF 6: Includes 6 vibrant floral colors so you always have a matching clip for any outfit.',
    'VALUE PACK: Six uniquely colored clips give you variety for every mood and outfit change.',
    'COLOR VARIETY: Comes with 6 bright floral shades, perfect for sharing or mixing daily looks.',
  ],
  bulletPoint3: [
    'GENTLE ON HAIR: Smooth acrylic edges hold hair securely without pulling, snagging, or breakage.',
    'DAMAGE-FREE: Rounded, polished edges grip hair firmly while preventing snags and split ends.',
    'HAIR-SAFE MATERIAL: Smooth-finish acrylic protects strands from stress marks and breakage.',
  ],
  bulletPoint4: [
    'VERSATILE STYLING: Works for thick, thin, curly, or straight hair; perfect for daily wear, work, or parties.',
    'STYLE ANYWHERE: Great for gym, office, travel, or date night, on any hair type or length.',
    'EVERYDAY ESSENTIAL: Suited for buns, half-updos, and quick styles on any texture of hair.',
  ],
  bulletPoint5: [
    'THOUGHTFUL GIFT: A charming, ready-to-gift accessory for daughters, sisters, friends, or yourself.',
    'GIFT-READY: Comes in shareable colors, ideal for birthdays, festivals, or a self-care treat.',
    'PERFECT PRESENT: A budget-friendly, delightful gift for the hair-accessory lover in your life.',
  ],
  description: [
    'Upgrade your everyday hairstyle with this set of 6 flower-shaped hair claw clips. Crafted from durable, lightweight acrylic with a reinforced metal spring, each clip offers a secure hold that lasts from your morning commute to your evening plans. The floral design adds a playful, feminine touch to any look, while the smooth finish protects your hair from damage. Lightweight enough for all-day comfort, these clips work beautifully on thick, thin, straight, or curly hair.',
    'Meet your new hair-styling essential: a set of 6 flower-shaped claw clips built for both hold and style. Each clip uses a strong metal spring for a grip that lasts all day, while the smooth acrylic body keeps hair damage-free. With six cheerful floral colors in the pack, you will always have the right shade on hand, whether you are heading to work, the gym, or a night out.',
    'These flower-shaped hair claw clips combine everyday practicality with a feminine, on-trend look. The set of 6 covers a full spectrum of colors, so switching up your style is effortless. A durable spring mechanism keeps the clip firmly in place on any hair type, while the lightweight acrylic build stays comfortable for extended wear.',
  ],
  backendKeywords: [
    'hair claw clips, flower hair clips, acrylic claw clips, hair accessories women, big hair clips',
    'claw clip pack, floral hair clip, strong grip hair clip, hair clip set women, banana clip',
    'hair jaw clip, flower shaped clip, colorful hair clips, thick hair clip, no slip clip',
  ],
  searchTerms: [
    'claw clip set, hair clips for thick hair, flower claw clip, cute hair accessories, banana clip alternative',
    'big claw clips, hair clips pack of 6, floral hair accessory, strong hold clip, girls hair clip',
    'acrylic hair clip set, colorful claw clips, hair styling accessory, everyday hair clip, gift for her',
  ],
  subjectKeywords: [
    'hair clip, claw clip, flower clip, hair accessory, clip set',
    'claw clamp, floral clip, hair grip, styling clip, accessory pack',
    'jaw clip, bloom clip, hair fastener, multicolor clip, six pack clip',
  ],
  brand: ['Sellassist Basics', 'Sellassist Prime', 'Sellassist Craft Co.'],
  material: ['Acrylic with Stainless Steel Spring', 'Premium Acrylic & Alloy Spring', 'Eco Acrylic with Reinforced Metal Spring'],
  color: [
    'Multicolor (Blue, Red, Yellow, Orange, Pink, Green)',
    'Pastel Mix (Lavender, Mint, Peach, Blush, Sky, Cream)',
    'Bold Mix (Red, Black, Gold, Purple, Teal, White)',
  ],
  size: ['Medium (7.5 cm)', 'Large (9 cm)', 'Small (6 cm)'],
  variation: ['Pack of 6 - Floral Multicolor', 'Pack of 4 - Pastel Edition', 'Pack of 6 - Bold Edition'],
  warranty: [
    '6-month manufacturer warranty against defects',
    '3-month replacement warranty for manufacturing defects',
    '1-year limited warranty against spring failure',
  ],
};

/** Deterministic checks used to score AI-generated Amazon listings on /optimize. */
export const AMAZON_SEO_CHECKS: readonly SeoCheck[] = [
  { label: 'Title within 200 characters', test: (get) => get('seoTitle').length > 0 && get('seoTitle').length <= 200 },
  {
    label: 'All 5 bullet points completed',
    test: (get) => [1, 2, 3, 4, 5].every((i) => get(`bulletPoint${i}`).length > 0),
  },
  { label: 'Backend keywords under byte limit', test: (get) => get('backendKeywords').length > 0 && get('backendKeywords').length <= 250 },
  { label: 'Description includes key benefits', test: (get) => get('description').length >= 200 },
  { label: 'Brand field specified', test: (get) => get('brand').length > 0 && get('brand').toLowerCase() !== 'generic' },
  { label: 'Subject keywords used', test: (get) => get('subjectKeywords').split(',').filter((k) => k.trim()).length >= 3 },
];

export const AMAZON_SEO_SCORE = 78;

export const AMAZON_SEO_CRITERIA: readonly SeoScoreCriterion[] = [
  { label: 'Title within 200 characters', passed: true },
  { label: 'All 5 bullet points completed', passed: true },
  { label: 'Backend keywords under byte limit', passed: true },
  { label: 'Description includes key benefits', passed: true },
  { label: 'Brand field specified', passed: true },
  { label: 'High-search subject keywords used', passed: false },
];
