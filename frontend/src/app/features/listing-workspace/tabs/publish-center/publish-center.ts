import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { WorkspaceStateService } from '../../state/workspace-state.service';
import { MarketplaceService } from '../../services/marketplace.service';
import { ReadinessService } from '../../services/readiness.service';
import { PublishService } from '../../services/publish.service';
import { ExportService } from '../../services/export.service';
import { PublishCard } from '../../components/publish-card/publish-card';
import { MarketplaceId } from '../../models/marketplace.model';

@Component({
  selector: 'app-publish-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublishCard],
  templateUrl: './publish-center.html',
})
export class PublishCenter {
  workspaceState = inject(WorkspaceStateService);
  private marketplaceService = inject(MarketplaceService);
  private readinessService = inject(ReadinessService);
  private publishService = inject(PublishService);
  private exportService = inject(ExportService);
  private toastController = inject(ToastController, { optional: true });

  allMarketplaces = this.marketplaceService.all();
  publishEnabled = signal(this.publishService.isPublishEnabled());

  readinessFor = computed(() => {
    const product = this.workspaceState.product();
    if (!product) return new Map<MarketplaceId, ReturnType<ReadinessService['evaluate']>>();
    const map = new Map<MarketplaceId, ReturnType<ReadinessService['evaluate']>>();
    for (const m of this.marketplaceService.live()) {
      map.set(m.id, this.readinessService.evaluate(product, m.id));
    }
    return map;
  });

  async downloadExcel(marketplaceId: MarketplaceId) {
    const product = this.workspaceState.product();
    if (!product) return;
    const result = this.exportService.exportExcel(product, marketplaceId);
    this.exportService.triggerDownload(result);
  }

  async copyListing(marketplaceId: MarketplaceId) {
    const product = this.workspaceState.product();
    if (!product) return;
    const listing = product.marketplaceListings[marketplaceId as 'amazon' | 'flipkart' | 'meesho'];
    await navigator.clipboard.writeText(JSON.stringify(listing, null, 2));
    await this.showToast('Listing copied to clipboard');
  }

  async publish(marketplaceId: MarketplaceId) {
    const product = this.workspaceState.product();
    if (!product) return;
    const result = await this.publishService.publish(marketplaceId, product);
    await this.showToast(result.message);
  }

  private async showToast(message: string) {
    const toast = await this.toastController?.create?.({ message, duration: 2500 });
    if (toast) await toast.present();
  }
}
