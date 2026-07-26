import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UiCard } from '../card/card';

export interface SeoScoreCriterion {
  label: string;
  passed: boolean;
}

type ScoreTier = 'good' | 'fair' | 'poor';

@Component({
  selector: 'app-seo-score-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, UiCard],
  templateUrl: './seo-score-card.html',
  styleUrl: './seo-score-card.scss',
})
export class SeoScoreCard {
  score = input.required<number>();
  criteria = input<readonly SeoScoreCriterion[]>([]);

  tier = computed<ScoreTier>(() => {
    const value = this.score();
    if (value >= 80) return 'good';
    if (value >= 50) return 'fair';
    return 'poor';
  });

  tierLabel = computed(() => {
    switch (this.tier()) {
      case 'good':
        return 'Good';
      case 'fair':
        return 'Needs Improvement';
      default:
        return 'Poor';
    }
  });

  passedCount = computed(() => this.criteria().filter((c) => c.passed).length);
}
