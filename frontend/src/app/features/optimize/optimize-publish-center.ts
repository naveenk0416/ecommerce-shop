import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AMAZON_SEO_CHECKS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_SEO_CHECKS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { MEESHO_SEO_CHECKS } from '../listing-workspace/tabs/meesho-listing/meesho-listing.mock';
import { computeSeoScore, SeoCheck } from '../listing-workspace/ui/seo-score-card/seo-score.util';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { MarketplaceIcon, MarketplaceId } from '../listing-workspace/ui/marketplace-icon/marketplace-icon';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { OptimizeSessionService, OptimizeTabKey } from './optimize-session.service';

interface PublishRow {
  tab: OptimizeTabKey;
  marketplace: MarketplaceId;
  label: string;
  checks: readonly SeoCheck[] | null;
}

const ROWS: readonly PublishRow[] = [
  { tab: 'amazon', marketplace: 'amazon', label: 'Amazon', checks: AMAZON_SEO_CHECKS },
  { tab: 'flipkart', marketplace: 'flipkart', label: 'Flipkart', checks: FLIPKART_SEO_CHECKS },
  { tab: 'meesho', marketplace: 'meesho', label: 'Meesho', checks: MEESHO_SEO_CHECKS },
  { tab: 'instagram', marketplace: 'instagram', label: 'Instagram', checks: null },
];

@Component({
  selector: 'app-optimize-publish-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, MarketplaceIcon, AiTabStatus, MatButtonModule, MatIconModule],
  templateUrl: './optimize-publish-center.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizePublishCenter {
  protected readonly session = inject(OptimizeSessionService);

  private readonly published = signal<Set<OptimizeTabKey>>(new Set());

  rows = computed(() => {
    const all = this.session.allResults();
    const publishedSet = this.published();
    return ROWS.map((row) => {
      const result = all[row.tab];
      const ready = result ? (row.checks ? computeSeoScore(result, row.checks).score >= 70 : true) : false;
      return { ...row, ready, published: publishedSet.has(row.tab) };
    });
  });

  publish(tab: OptimizeTabKey): void {
    this.published.update((current) => new Set(current).add(tab));
  }
}
