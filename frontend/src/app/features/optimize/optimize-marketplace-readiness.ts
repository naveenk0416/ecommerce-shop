import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AMAZON_SEO_CHECKS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_SEO_CHECKS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { MEESHO_SEO_CHECKS } from '../listing-workspace/tabs/meesho-listing/meesho-listing.mock';
import { SeoCheck } from '../listing-workspace/ui/seo-score-card/seo-score.util';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { MarketplaceIcon, MarketplaceId } from '../listing-workspace/ui/marketplace-icon/marketplace-icon';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { OptimizeSessionService, OptimizeTabKey } from './optimize-session.service';
import { evaluateReadiness } from './optimize-readiness.util';

interface ReadinessRow {
  tab: OptimizeTabKey;
  marketplace: MarketplaceId;
  label: string;
  checks: readonly SeoCheck[] | null;
}

const ROWS: readonly ReadinessRow[] = [
  { tab: 'amazon', marketplace: 'amazon', label: 'Amazon', checks: AMAZON_SEO_CHECKS },
  { tab: 'flipkart', marketplace: 'flipkart', label: 'Flipkart', checks: FLIPKART_SEO_CHECKS },
  { tab: 'meesho', marketplace: 'meesho', label: 'Meesho', checks: MEESHO_SEO_CHECKS },
  { tab: 'instagram', marketplace: 'instagram', label: 'Instagram', checks: null },
];

/** Plain-language reason for a failed check (what the seller should do). */
const ISSUE_TEXT: Record<string, string> = {
  'Brand field specified': 'Brand is empty or "Generic" — enter your approved brand.',
};

@Component({
  selector: 'app-optimize-marketplace-readiness',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, MarketplaceIcon, AiTabStatus, RouterLink],
  templateUrl: './optimize-marketplace-readiness.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizeMarketplaceReadiness {
  protected readonly session = inject(OptimizeSessionService);

  rows = computed(() => {
    const all = this.session.allResults();
    return ROWS.map((row) => {
      const r = evaluateReadiness(all[row.tab], row.checks);
      return {
        ...row,
        status: r.status,
        score: r.score,
        issues: r.issues.map((issue) => ({ ...issue, text: ISSUE_TEXT[issue.label] ?? `${issue.label} — not met.` })),
      };
    });
  });
}
