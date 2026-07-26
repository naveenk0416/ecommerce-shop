import { AMAZON_SEO_CHECKS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_SEO_CHECKS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { MEESHO_SEO_CHECKS } from '../listing-workspace/tabs/meesho-listing/meesho-listing.mock';
import { INSTAGRAM_SEO_CHECKS } from '../listing-workspace/tabs/instagram-content/instagram-content.mock';
import { computeSeoScore, SeoCheck } from '../listing-workspace/ui/seo-score-card/seo-score.util';
import { MarketplaceId } from '../listing-workspace/ui/marketplace-icon/marketplace-icon';
import { OptimizeTabKey, TabResult } from './optimize-session.service';

export interface MarketplaceReadinessRow {
  tab: OptimizeTabKey;
  marketplace: MarketplaceId;
  label: string;
  score: number | null;
  ready: boolean;
}

type Marketplace = 'amazon' | 'flipkart' | 'meesho' | 'instagram';

const CHECKS: Record<Marketplace, readonly SeoCheck[]> = {
  amazon: AMAZON_SEO_CHECKS,
  flipkart: FLIPKART_SEO_CHECKS,
  meesho: MEESHO_SEO_CHECKS,
  instagram: INSTAGRAM_SEO_CHECKS,
};

const LABELS: Record<Marketplace, string> = {
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  meesho: 'Meesho',
  instagram: 'Instagram',
};

const MARKETPLACES: readonly Marketplace[] = ['amazon', 'flipkart', 'meesho', 'instagram'];

/** Live per-marketplace readiness, scored from whatever's been generated so far in this session. */
export function computeMarketplaceRows(results: Partial<Record<OptimizeTabKey, TabResult>>): MarketplaceReadinessRow[] {
  return MARKETPLACES.map((tab) => {
    const result = results[tab];
    if (!result) {
      return { tab, marketplace: tab, label: LABELS[tab], score: null, ready: false };
    }
    const { score } = computeSeoScore(result, CHECKS[tab]);
    return { tab, marketplace: tab, label: LABELS[tab], score, ready: score >= 70 };
  });
}
