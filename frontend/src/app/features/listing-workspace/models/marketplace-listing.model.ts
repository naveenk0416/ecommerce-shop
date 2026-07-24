export interface AmazonListing {
  seoTitle: string;
  bulletPoints: string[];
  longDescription: string;
  backendSearchTerms: string;
  searchKeywords: string[];
  subjectKeywords: string[];
  brand: string;
  manufacturer: string;
  material: string;
  color: string;
  size: string;
  style: string;
  pattern: string;
  occasion: string;
  targetAudience: string;
  includedComponents: string;
  careInstructions: string;
  warranty: string;
  variationTheme: string;
  parentSku: string;
  childSku: string;
  charCount: number;
  keywordCount: number;
  seoScore: number;
}

export interface FlipkartListing {
  seoTitle: string;
  description: string;
  highlights: string[];
  brand: string;
  model: string;
  color: string;
  material: string;
  idealFor: string;
  packOf: string;
  salesPackage: string;
  warranty: string;
  weight: string;
  dimensions: string;
  categoryAttributes: Record<string, string>;
}

export interface MeeshoListing {
  title: string;
  description: string;
  highlights: string[];
  material: string;
  color: string;
  fabric: string;
  pattern: string;
  fit: string;
  occasion: string;
  netQuantity: string;
  packOf: string;
  weight: string;
  dispatchTime: string;
  packageContents: string;
  categoryAttributes: Record<string, string>;
}

export interface InstagramContent {
  shortCaption: string;
  longCaption: string;
  storyCaption: string;
  reelCaption: string;
  cta: string;
  emojiVersion: string;
  seoCaption: string;
  hashtags: string[];
  trendingHashtags: string[];
  suggestedPostingTime: string;
  suggestedMusic: string;
  imagePrompt: string;
  videoPrompt: string;
}

export type MarketplaceListing = AmazonListing | FlipkartListing | MeeshoListing;
