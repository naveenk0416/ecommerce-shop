import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AMAZON_LISTING_SECTIONS, AMAZON_SEO_CHECKS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { computeSeoScore } from '../listing-workspace/ui/seo-score-card/seo-score.util';
import { EditableField } from '../listing-workspace/ui/editable-field/editable-field';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { SeoScoreCard } from '../listing-workspace/ui/seo-score-card/seo-score-card';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { OptimizeSessionService } from './optimize-session.service';

@Component({
  selector: 'app-optimize-amazon-listing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, EditableField, SeoScoreCard, AiTabStatus],
  templateUrl: './optimize-amazon-listing.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizeAmazonListing {
  protected readonly session = inject(OptimizeSessionService);

  protected readonly sections = AMAZON_LISTING_SECTIONS;

  results = computed(() => this.session.getResult('amazon') ?? null);

  seo = computed(() => {
    const result = this.results();
    return result ? computeSeoScore(result, AMAZON_SEO_CHECKS) : null;
  });

  /** Retries the single combined Gemini call covering this tab and every other tab. */
  generate(): void {
    this.session.generateAll();
  }
}
