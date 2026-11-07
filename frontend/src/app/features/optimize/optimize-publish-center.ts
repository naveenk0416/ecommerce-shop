import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AMAZON_SEO_CHECKS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_SEO_CHECKS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { MEESHO_SEO_CHECKS } from '../listing-workspace/tabs/meesho-listing/meesho-listing.mock';
import { SeoCheck } from '../listing-workspace/ui/seo-score-card/seo-score.util';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { MarketplaceIcon, MarketplaceId } from '../listing-workspace/ui/marketplace-icon/marketplace-icon';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { OptimizeSessionService, OptimizeTabKey } from './optimize-session.service';
import { FeatureService } from '../../services/features';
import { LanguageService } from '../../services/language';
import { ComingSoonPublish } from './coming-soon/coming-soon-publish';
import { evaluateReadiness } from './optimize-readiness.util';

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

/**
 * Where each channel stands for this product. There is no pretend "publish" here: Amazon is
 * published for real from Inventory (Seller Central connection, Amazon's own accept/reject result),
 * so this page hands the product over to that flow; channels that aren't live show "Coming soon".
 */
@Component({
  selector: 'app-optimize-publish-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, MarketplaceIcon, AiTabStatus, MatButtonModule, MatIconModule, ComingSoonPublish, RouterLink],
  templateUrl: './optimize-publish-center.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizePublishCenter {
  protected readonly session = inject(OptimizeSessionService);
  protected readonly features = inject(FeatureService);
  protected readonly i18n = inject(LanguageService);

  constructor() {
    void this.features.load();
  }

  /** The inventory item this listing was saved as; Amazon publishing needs it. */
  protected readonly inventoryId = computed(() => this.session.inventoryListingId());

  rows = computed(() => {
    const all = this.session.allResults();
    return ROWS.map((row) => {
      const readiness = evaluateReadiness(all[row.tab], row.checks);
      // Only Amazon has a real new-listing publish today; the others follow their *_PUBLISH_ENABLED flag.
      const live = row.marketplace === 'amazon' || this.features.isLive(row.marketplace as 'flipkart' | 'meesho' | 'instagram');
      return { ...row, live, status: readiness.status };
    });
  });
}
