import { ChangeDetectionStrategy, Component, Injector, computed, inject, runInInjectionContext, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmActionData, ConfirmActionDialog } from './confirm-action-dialog';
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
import { FeatureService } from '../../services/features';
import { LanguageService } from '../../services/language';
import { ComingSoonPublish } from './coming-soon/coming-soon-publish';

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
  imports: [UiCard, UiSection, MarketplaceIcon, AiTabStatus, MatButtonModule, MatIconModule, ComingSoonPublish],
  templateUrl: './optimize-publish-center.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizePublishCenter {
  protected readonly session = inject(OptimizeSessionService);
  protected readonly features = inject(FeatureService);
  protected readonly i18n = inject(LanguageService);
  private readonly injector = inject(Injector);

  constructor() {
    void this.features.load();
  }

  private readonly published = signal<Set<OptimizeTabKey>>(new Set());

  rows = computed(() => {
    const all = this.session.allResults();
    const publishedSet = this.published();
    return ROWS.map((row) => {
      const result = all[row.tab];
      const ready = result ? (row.checks ? computeSeoScore(result, row.checks).score >= 70 : true) : false;
      // Channels whose publishing isn't live (FLIPKART_/MEESHO_/INSTAGRAM_PUBLISH_ENABLED) show "Coming soon".
      const live = this.features.isLive(row.marketplace as 'amazon' | 'flipkart' | 'meesho' | 'instagram');
      return { ...row, ready, live, published: publishedSet.has(row.tab) };
    });
  });

  /** Always confirms first, listing exactly what would be published for that channel. */
  publish(tab: OptimizeTabKey): void {
    const row = ROWS.find((r) => r.tab === tab);
    if (!row || !this.features.isLive(row.marketplace as 'amazon' | 'flipkart' | 'meesho' | 'instagram')) return;
    const result = this.session.getResult(tab) ?? {};
    const general = this.session.getResult('general') ?? {};
    const get = (r: Record<string, { values?: string[] }>, key: string) => r[key]?.values?.[0]?.trim() ?? '';
    const title = get(result, 'seoTitle') || get(result, 'listingTitle') || get(general, 'productTitle') || 'Untitled product';
    const price = get(general, 'sellingPrice');
    const stock = get(general, 'stock');
    const lines = tab === 'instagram'
      ? [`Caption: ${get(result, 'caption').slice(0, 80) || '—'}${get(result, 'caption').length > 80 ? '…' : ''}`, `Hashtags: ${get(result, 'hashtags').split(/s+/).filter(Boolean).length}`]
      : [`Title: ${title}`, `Price: ${price ? '₹' + price : 'not set'}`, `Stock: ${stock || 'not set'}`, 'Description, highlights and keywords from this listing'];
    const data: ConfirmActionData = {
      title: `Publish to ${row.label}?`,
      intro: 'Review what will be published:',
      items: [{ heading: row.label, lines }],
      confirmLabel: `Publish to ${row.label}`,
      warning: 'This Publish Center is not yet connected to live marketplaces — it marks the channel as published in SellAssist only. Use Inventory → Publish to update a live Amazon/Flipkart listing.',
    };
    runInInjectionContext(this.injector, () => inject(MatDialog))
      .open<ConfirmActionDialog, ConfirmActionData, boolean>(ConfirmActionDialog, { data, width: '480px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.published.update((current) => new Set(current).add(tab));
      });
  }
}
