import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, alertCircle, closeCircle } from 'ionicons/icons';
import { WorkspaceStateService } from '../../state/workspace-state.service';
import { ReadinessService } from '../../services/readiness.service';
import { MarketplaceService } from '../../services/marketplace.service';
import { ProgressBar } from '../../components/progress-bar/progress-bar';
import { MarketplaceStatus } from '../../components/marketplace-status/marketplace-status';

@Component({
  selector: 'app-marketplace-readiness',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ProgressBar, MarketplaceStatus],
  templateUrl: './marketplace-readiness.html',
})
export class MarketplaceReadinessTab {
  workspaceState = inject(WorkspaceStateService);
  private readinessService = inject(ReadinessService);
  private marketplaceService = inject(MarketplaceService);

  liveMarketplaces = this.marketplaceService.live();

  results = computed(() => {
    const product = this.workspaceState.product();
    if (!product) return [];
    return this.liveMarketplaces.map(marketplace => ({
      marketplace,
      result: this.readinessService.evaluate(product, marketplace.id),
    }));
  });

  overallScore = computed(() => {
    const all = this.results();
    if (all.length === 0) return 0;
    return Math.round(all.reduce((sum, r) => sum + r.result.readinessPercent, 0) / all.length);
  });

  constructor() {
    addIcons({ 'checkmark-circle': checkmarkCircle, 'alert-circle': alertCircle, 'close-circle': closeCircle });
  }
}
