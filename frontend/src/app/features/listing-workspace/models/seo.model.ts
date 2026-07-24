export interface SEOAnalysis {
  seoScore: number;
  readabilityScore: number;
  listingQualityScore: number;
  duplicateContentScore: number;
  keywordDensity: number;
  charCount: number;
  missingKeywords: string[];
  trendingKeywords: string[];
  competitorSuggestions: string[];
  expectedSearchVisibility: string;
  estimatedConversionScore: number;
  expectedRanking: string;
  contentSentiment: string;
  marketplaceOptimizationScore: number;
  aiSuggestions: string[];
}
