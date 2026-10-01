import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FLIPKART_LISTING_SECTIONS, FLIPKART_SEO_CHECKS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { computeSeoScore } from '../listing-workspace/ui/seo-score-card/seo-score.util';
import { EditableField } from '../listing-workspace/ui/editable-field/editable-field';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { SeoScoreCard } from '../listing-workspace/ui/seo-score-card/seo-score-card';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { OptimizeSessionService } from './optimize-session.service';
import { WalletService } from '../../services/wallet';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { FeatureService } from '../../services/features';
import { LanguageService } from '../../services/language';

@Component({
  selector: 'app-optimize-flipkart-listing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, EditableField, SeoScoreCard, AiTabStatus, MatIconModule, RouterLink],
  templateUrl: './optimize-flipkart-listing.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizeFlipkartListing {
  protected readonly session = inject(OptimizeSessionService);
  protected readonly wallet = inject(WalletService);
  protected readonly features = inject(FeatureService);
  protected readonly i18n = inject(LanguageService);

  constructor() {
    void this.features.load();
  }

  protected readonly sections = FLIPKART_LISTING_SECTIONS;

  results = computed(() => this.session.getResult('flipkart') ?? null);

  seo = computed(() => {
    const result = this.results();
    return result ? computeSeoScore(result, FLIPKART_SEO_CHECKS) : null;
  });

  /** Retries the single combined Gemini call covering this tab and every other tab. */
  generate(): void {
    this.session.generateAll();
  }
}
