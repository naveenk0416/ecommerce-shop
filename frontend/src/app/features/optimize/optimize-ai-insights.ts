import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GENERAL_DETAILS_SECTIONS } from '../listing-workspace/tabs/general-details/general-details.mock';
import { AMAZON_LISTING_SECTIONS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_LISTING_SECTIONS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { MEESHO_LISTING_SECTIONS } from '../listing-workspace/tabs/meesho-listing/meesho-listing.mock';
import { INSTAGRAM_CONTENT_SECTIONS } from '../listing-workspace/tabs/instagram-content/instagram-content.mock';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { SeoScoreCard } from '../listing-workspace/ui/seo-score-card/seo-score-card';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { OptimizeSessionService, OptimizeTabKey } from './optimize-session.service';

const TAB_LABELS: Record<OptimizeTabKey, string> = {
  general: 'General Details',
  amazon: 'Amazon Listing',
  flipkart: 'Flipkart Listing',
  meesho: 'Meesho Listing',
  instagram: 'Instagram Content',
};

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...GENERAL_DETAILS_SECTIONS, ...AMAZON_LISTING_SECTIONS, ...FLIPKART_LISTING_SECTIONS, ...MEESHO_LISTING_SECTIONS, ...INSTAGRAM_CONTENT_SECTIONS]
    .flatMap((section) => section.fields)
    .map((field) => [field.key, field.label]),
);

interface ReviewItem {
  tab: string;
  label: string;
  confidence: number;
  reason: string;
}

@Component({
  selector: 'app-optimize-ai-insights',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, SeoScoreCard, AiTabStatus],
  templateUrl: './optimize-ai-insights.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss', './optimize-ai-insights.scss'],
})
export class OptimizeAiInsights {
  protected readonly session = inject(OptimizeSessionService);

  private readonly tabKeys: OptimizeTabKey[] = ['general', 'amazon', 'flipkart', 'meesho', 'instagram'];

  summary = computed(() => {
    const all = this.session.allResults();
    const generatedTabs = this.tabKeys.filter((tab) => all[tab]);

    let totalFields = 0;
    let confidenceSum = 0;
    const reviewItems: ReviewItem[] = [];

    for (const tab of generatedTabs) {
      const result = all[tab]!;
      for (const key of Object.keys(result)) {
        const field = result[key];
        totalFields++;
        confidenceSum += field.confidence;
        if (field.confidence < 50) {
          reviewItems.push({ tab: TAB_LABELS[tab], label: FIELD_LABELS[key] ?? key, confidence: field.confidence, reason: field.reason });
        }
      }
    }

    reviewItems.sort((a, b) => a.confidence - b.confidence);

    return {
      generatedCount: generatedTabs.length,
      totalTabs: this.tabKeys.length,
      avgConfidence: totalFields ? Math.round(confidenceSum / totalFields) : 0,
      criteria: this.tabKeys.map((tab) => ({ label: `${TAB_LABELS[tab]} generated`, passed: !!all[tab] })),
      reviewItems,
    };
  });
}
