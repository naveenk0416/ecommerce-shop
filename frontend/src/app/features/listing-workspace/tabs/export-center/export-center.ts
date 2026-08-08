import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';
import * as XLSX from 'xlsx';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { UiCard } from '../../ui/card/card';
import { UiSection } from '../../ui/section/section';
import { MarketplaceIcon } from '../../ui/marketplace-icon/marketplace-icon';
import { ListingService, Listing } from '../../../../services/listing';
import { TemplateService } from '../../../../services/template';
import { buildExportData, fillExportTemplate } from './export-template.util';

type ExportMarketplace = 'amazon' | 'flipkart' | 'meesho';

const EXPORT_MARKETPLACES: readonly { id: ExportMarketplace; label: string }[] = [
  { id: 'amazon', label: 'Amazon' },
  { id: 'flipkart', label: 'Flipkart' },
  { id: 'meesho', label: 'Meesho' },
];

@Component({
  selector: 'app-export-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UiCard, UiSection, MarketplaceIcon, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './export-center.html',
  styleUrls: ['./export-center.scss', '../tab-shell.scss'],
})
export class ExportCenter {
  private readonly listingService = inject(ListingService);
  private readonly templateService = inject(TemplateService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly marketplaces = EXPORT_MARKETPLACES;

  protected readonly listingId = toSignal(
    inject(ActivatedRoute).parent!.paramMap.pipe(map((params) => params.get('listingId') ?? '')),
    { initialValue: '' },
  );

  protected readonly listing = signal<Listing | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly selectedMarketplace = signal<ExportMarketplace | null>(null);
  protected readonly category = signal('');
  protected readonly templateFile = signal<File | null>(null);
  protected readonly exportError = signal<string | null>(null);
  protected readonly exportSuccess = signal(false);
  protected readonly exporting = signal(false);

  constructor() {
    const id = this.listingId();
    if (id) {
      this.loadListing(id);
    }
  }

  private async loadListing(id: string): Promise<void> {
    try {
      const listing = await this.listingService.getListing(id);
      this.listing.set(listing);
      this.category.set(listing.category || '');
    } catch (error) {
      console.error('Failed to load listing for export', error);
      this.loadError.set('Could not load this listing. Please go back and try again.');
    }
  }

  selectMarketplace(id: ExportMarketplace): void {
    this.selectedMarketplace.set(id);
    this.exportError.set(null);
    this.exportSuccess.set(false);
  }

  onTemplateSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.templateFile.set(file);
    this.exportError.set(null);
    this.exportSuccess.set(false);
  }

  canExport(): boolean {
    return !!this.listing() && !!this.selectedMarketplace() && !!this.templateFile() && !!this.category().trim();
  }

  async exportTemplate(): Promise<void> {
    if (!this.isBrowser) return;

    const listing = this.listing();
    const marketplace = this.selectedMarketplace();
    const file = this.templateFile();
    if (!listing || !marketplace || !file || !this.category().trim()) return;

    this.exporting.set(true);
    this.exportError.set(null);
    this.exportSuccess.set(false);

    try {
      const marketplaceFields = this.templateService.templates().find((t) => t.id === marketplace)?.fields ?? [];
      const data = buildExportData(listing, this.category().trim(), marketplace, marketplaceFields);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      fillExportTemplate(workbook, data);

      XLSX.writeFile(workbook, `sellassist-${marketplace}-${listing.id ?? 'listing'}.xlsx`);
      this.exportSuccess.set(true);
    } catch (error) {
      console.error('Export failed', error);
      this.exportError.set(error instanceof Error ? error.message : 'Export failed. Please try again.');
    } finally {
      this.exporting.set(false);
    }
  }
}
