import { Injectable } from '@angular/core';
import { Product } from '../models/product.model';
import { SEOAnalysis } from '../models/seo.model';

@Injectable({ providedIn: 'root' })
export class SEOService {
  /**
   * Deterministic pieces (char count, keyword count, density) are computed here
   * from the actual generated text. Speculative pieces (expected ranking, conversion
   * score, competitor suggestions, sentiment) come from product.aiInsights, which is
   * either AI-generated (once AIListingService wires it) or mock data — never invented
   * client-side, since there is no real marketplace analytics source to compute them from.
   */
  analyze(product: Product): SEOAnalysis {
    const amazon = product.marketplaceListings.amazon;
    const text = [amazon.seoTitle, amazon.longDescription, ...amazon.bulletPoints].join(' ');
    const charCount = text.length;
    const keywords = amazon.searchKeywords ?? [];
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const keywordHits = keywords.reduce((count, kw) => {
      const kwWords = kw.toLowerCase().split(/\s+/);
      return count + (words.join(' ').includes(kw.toLowerCase()) ? kwWords.length : 0);
    }, 0);
    const keywordDensity = words.length === 0 ? 0 : Math.round((keywordHits / words.length) * 1000) / 10;

    const insights = product.aiInsights;
    return {
      seoScore: insights.seoScore,
      readabilityScore: insights.readabilityScore,
      listingQualityScore: insights.listingQualityScore,
      duplicateContentScore: insights.duplicateContentScore,
      keywordDensity,
      charCount,
      missingKeywords: insights.missingKeywords,
      trendingKeywords: insights.trendingKeywords,
      competitorSuggestions: insights.competitorSuggestions,
      expectedSearchVisibility: insights.expectedSearchVisibility,
      estimatedConversionScore: insights.estimatedConversionScore,
      expectedRanking: insights.expectedRanking,
      contentSentiment: insights.contentSentiment,
      marketplaceOptimizationScore: insights.marketplaceOptimizationScore,
      aiSuggestions: insights.aiSuggestions,
    };
  }
}
