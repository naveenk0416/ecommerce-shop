import { AMAZON_SEO_CHECKS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_SEO_CHECKS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { MEESHO_SEO_CHECKS } from '../listing-workspace/tabs/meesho-listing/meesho-listing.mock';
import { INSTAGRAM_SEO_CHECKS } from '../listing-workspace/tabs/instagram-content/instagram-content.mock';
import { computeSeoScore, SeoCheck } from '../listing-workspace/ui/seo-score-card/seo-score.util';
import { MarketplaceId } from '../listing-workspace/ui/marketplace-icon/marketplace-icon';
import { OptimizeTabKey, TabResult } from './optimize-session.service';
import { orderTabsByMarketplaces } from '../../config/signup-options';

/** Below this score a marketplace needs attention even when no blocking check fails. */
export const READY_SCORE = 70;

export type ReadinessStatus = 'not_generated' | 'ready' | 'attention';

/** One failed check, with the field to fix (null when it isn't a single field). */
export interface ReadinessIssue {
  label: string;
  field: string | null;
  blocking: boolean;
}

export interface Readiness {
  status: ReadinessStatus;
  score: number | null;
  issues: ReadinessIssue[];
}

/**
 * READY only when the score is high enough AND no blocking check (e.g. brand empty or "Generic")
 * fails — a listing with a failed brand check is never shown as ready.
 */
export function evaluateReadiness(result: TabResult | undefined, checks: readonly SeoCheck[] | null): Readiness {
  if (!result) return { status: 'not_generated', score: null, issues: [] };
  if (!checks) return { status: 'ready', score: null, issues: [] };
  const { score, criteria } = computeSeoScore(result, checks);
  const issues: ReadinessIssue[] = checks
    .filter((_, i) => !criteria[i].passed)
    .map((check) => ({ label: check.label, field: check.field ?? null, blocking: !!check.blocking }));
  const status: ReadinessStatus = issues.some((i) => i.blocking) || score < READY_SCORE ? 'attention' : 'ready';
  return { status, score, issues };
}

export interface MarketplaceReadinessRow {
  tab: OptimizeTabKey;
  marketplace: MarketplaceId;
  label: string;
  score: number | null;
  ready: boolean;
  status: ReadinessStatus;
  issues: ReadinessIssue[];
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

/**
 * Live per-marketplace readiness, scored from whatever's been generated so far in this session.
 * The seller's own marketplaces ("where do you sell?") come first; every tab is always listed.
 */
export function computeMarketplaceRows(results: Partial<Record<OptimizeTabKey, TabResult>>, sellerMarketplaces?: readonly string[] | null): MarketplaceReadinessRow[] {
  return orderTabsByMarketplaces(MARKETPLACES, (tab) => tab, sellerMarketplaces).map((tab) => {
    const r = evaluateReadiness(results[tab], CHECKS[tab]);
    return { tab, marketplace: tab, label: LABELS[tab], score: r.score, ready: r.status === 'ready', status: r.status, issues: r.issues };
  });
}
