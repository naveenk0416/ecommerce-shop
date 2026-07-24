import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { WorkspaceStateService } from '../../state/workspace-state.service';
import { ScoreCard } from '../../components/score-card/score-card';
import { AISuggestionCard } from '../../components/ai-suggestion-card/ai-suggestion-card';

@Component({
  selector: 'app-ai-insights',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScoreCard, AISuggestionCard],
  templateUrl: './ai-insights.html',
})
export class AiInsightsTab {
  workspaceState = inject(WorkspaceStateService);

  insights = computed(() => this.workspaceState.product()?.aiInsights ?? null);

  dismissSuggestion(index: number) {
    this.workspaceState.update(p => ({
      ...p,
      aiInsights: {
        ...p.aiInsights,
        improvementSuggestions: p.aiInsights.improvementSuggestions.filter((_, i) => i !== index),
      },
    }));
  }
}
