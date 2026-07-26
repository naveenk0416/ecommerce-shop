import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiCard } from '../../ui/card/card';
import { UiSection } from '../../ui/section/section';
import { EditableField } from '../../ui/editable-field/editable-field';
import { SeoScoreCard } from '../../ui/seo-score-card/seo-score-card';
import {
  AMAZON_LISTING_MOCK_VALUES,
  AMAZON_LISTING_SECTIONS,
  AMAZON_LISTING_SUGGESTIONS,
  AMAZON_SEO_CRITERIA,
  AMAZON_SEO_SCORE,
} from './amazon-listing.mock';

@Component({
  selector: 'app-amazon-listing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, EditableField, SeoScoreCard],
  templateUrl: './amazon-listing.html',
  styleUrl: '../tab-shell.scss',
})
export class AmazonListing {
  protected readonly sections = AMAZON_LISTING_SECTIONS;
  protected readonly fieldValues = AMAZON_LISTING_MOCK_VALUES;
  protected readonly seoScore = AMAZON_SEO_SCORE;
  protected readonly seoCriteria = AMAZON_SEO_CRITERIA;

  protected suggestionsFor(key: string): string[] {
    return AMAZON_LISTING_SUGGESTIONS[key] ?? [];
  }
}
