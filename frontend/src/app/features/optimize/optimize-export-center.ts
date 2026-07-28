import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import * as XLSX from 'xlsx';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { MarketplaceIcon, MarketplaceId } from '../listing-workspace/ui/marketplace-icon/marketplace-icon';
import { AMAZON_LISTING_SECTIONS } from '../listing-workspace/tabs/amazon-listing/amazon-listing.mock';
import { FLIPKART_LISTING_SECTIONS } from '../listing-workspace/tabs/flipkart-listing/flipkart-listing.mock';
import { MEESHO_LISTING_SECTIONS } from '../listing-workspace/tabs/meesho-listing/meesho-listing.mock';
import { OptimizeSessionService, OptimizeTabKey } from './optimize-session.service';
import { FieldConfig } from '../listing-workspace/models/field-section.model';

type MarketplaceTab = Extract<OptimizeTabKey, 'amazon' | 'flipkart' | 'meesho'>;

interface MarketplaceExport {
  tab: MarketplaceTab;
  marketplace: MarketplaceId;
  label: string;
  fields: readonly FieldConfig[];
}

const MARKETPLACE_EXPORTS: readonly MarketplaceExport[] = [
  { tab: 'amazon', marketplace: 'amazon', label: 'Amazon', fields: AMAZON_LISTING_SECTIONS.flatMap((s) => s.fields) },
  { tab: 'flipkart', marketplace: 'flipkart', label: 'Flipkart', fields: FLIPKART_LISTING_SECTIONS.flatMap((s) => s.fields) },
  { tab: 'meesho', marketplace: 'meesho', label: 'Meesho', fields: MEESHO_LISTING_SECTIONS.flatMap((s) => s.fields) },
];

@Component({
  selector: 'app-optimize-export-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, AiTabStatus, MarketplaceIcon, MatButtonModule, MatIconModule],
  templateUrl: './optimize-export-center.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizeExportCenter {
  protected readonly session = inject(OptimizeSessionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly marketplaces = MARKETPLACE_EXPORTS;

  hasResult(tab: MarketplaceTab): boolean {
    return !!this.session.getResult(tab);
  }

  /** Downloads one marketplace's generated fields as a single-row Excel sheet, ready for that
   * marketplace's bulk-listing upload template. */
  exportExcel(entry: MarketplaceExport): void {
    if (!this.isBrowser) return;
    const result = this.session.getResult(entry.tab);
    if (!result) return;

    const row: Record<string, string> = {};
    for (const field of entry.fields) {
      row[field.label] = result[field.key]?.values?.[0] ?? '';
    }

    const worksheet = XLSX.utils.json_to_sheet([row]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, entry.label);
    XLSX.writeFile(workbook, `sellassist-${entry.tab}-listing.xlsx`);
  }
}
