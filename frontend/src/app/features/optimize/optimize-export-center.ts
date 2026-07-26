import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UiCard } from '../listing-workspace/ui/card/card';
import { UiSection } from '../listing-workspace/ui/section/section';
import { AiTabStatus } from '../listing-workspace/ui/ai-tab-status/ai-tab-status';
import { OptimizeSessionService } from './optimize-session.service';

interface ExportFormat {
  id: 'json' | 'csv' | 'excel';
  label: string;
  icon: string;
  available: boolean;
}

const FORMATS: readonly ExportFormat[] = [
  { id: 'csv', label: 'CSV', icon: 'table_chart', available: true },
  { id: 'json', label: 'JSON', icon: 'data_object', available: true },
  { id: 'excel', label: 'Excel', icon: 'grid_on', available: false },
];

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

@Component({
  selector: 'app-optimize-export-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiCard, UiSection, AiTabStatus, MatButtonModule, MatIconModule],
  templateUrl: './optimize-export-center.html',
  styleUrls: ['../listing-workspace/tabs/tab-shell.scss'],
})
export class OptimizeExportCenter {
  protected readonly session = inject(OptimizeSessionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly formats = FORMATS;

  hasContent = computed(() => Object.keys(this.session.allResults()).length > 0);

  export(format: ExportFormat): void {
    if (!this.isBrowser || !format.available) return;

    const results = this.session.allResults();
    if (format.id === 'json') {
      this.download('sellassist-listing.json', JSON.stringify(results, null, 2), 'application/json');
      return;
    }

    if (format.id === 'csv') {
      const rows = [['Tab', 'Field', 'Value', 'Confidence', 'Reason']];
      for (const [tab, fields] of Object.entries(results)) {
        for (const [key, field] of Object.entries(fields)) {
          rows.push([tab, key, field.values[0] ?? '', String(field.confidence), field.reason]);
        }
      }
      const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
      this.download('sellassist-listing.csv', csv, 'text/csv');
    }
  }

  private download(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
