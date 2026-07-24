import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { WorkspaceStateService } from '../../state/workspace-state.service';
import { ExportService } from '../../services/export.service';
import { ExportCard } from '../../components/export-card/export-card';

@Component({
  selector: 'app-export-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExportCard],
  templateUrl: './export-center.html',
})
export class ExportCenter {
  workspaceState = inject(WorkspaceStateService);
  private exportService = inject(ExportService);
  private toastController = inject(ToastController, { optional: true });

  downloadExcel(marketplaceId: 'amazon' | 'flipkart' | 'meesho') {
    const product = this.workspaceState.product();
    if (!product) return;
    this.exportService.triggerDownload(this.exportService.exportExcel(product, marketplaceId));
  }

  downloadCSV() {
    const product = this.workspaceState.product();
    if (!product) return;
    this.exportService.triggerDownload(this.exportService.exportCSV(product, 'amazon'));
  }

  downloadJSON() {
    const product = this.workspaceState.product();
    if (!product) return;
    this.exportService.triggerDownload(this.exportService.exportJSON(product));
  }

  downloadPDF() {
    this.exportService.exportPDF();
  }

  async copyJSON() {
    const product = this.workspaceState.product();
    if (!product) return;
    await this.exportService.copyJSON(product);
    await this.showToast('Listing JSON copied to clipboard');
  }

  async copyListing() {
    const product = this.workspaceState.product();
    if (!product) return;
    await navigator.clipboard.writeText(product.marketplaceListings.amazon.seoTitle);
    await this.showToast('Listing title copied to clipboard');
  }

  print() {
    if (typeof window !== 'undefined') window.print();
  }

  async share() {
    const product = this.workspaceState.product();
    if (!product) return;
    await this.exportService.share(product);
  }

  private async showToast(message: string) {
    const toast = await this.toastController?.create?.({ message, duration: 2000 });
    if (toast) await toast.present();
  }
}
