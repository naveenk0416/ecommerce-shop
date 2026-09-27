import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { OptimizeTabKey, TabResult } from './optimize-session.service';

/** Read-only preview of how the listing reads on each channel (header "Preview" button). */
@Component({
  selector: 'app-listing-preview-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Listing preview</h2>
    <mat-dialog-content class="preview">
      @for (block of blocks; track block.label) {
        @if (block.title || block.body) {
          <section class="preview__block">
            <h3>{{ block.label }}</h3>
            @if (block.title) { <p class="preview__title">{{ block.title }}</p> }
            @if (block.body) { <p class="preview__body">{{ block.body }}</p> }
          </section>
        }
      }
      @if (!hasContent) {
        <p>Generate the listing from a product photo to see a preview.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .preview__block { padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
    .preview__block h3 { margin: 0 0 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #ea580c; }
    .preview__title { margin: 0 0 6px; font-weight: 700; color: #0f172a; }
    .preview__body { margin: 0; white-space: pre-line; color: #475569; font-size: 14px; }
  `,
})
export class ListingPreviewDialog {
  private readonly data = inject<Partial<Record<OptimizeTabKey, TabResult>>>(MAT_DIALOG_DATA);

  private get = (tab: OptimizeTabKey, key: string) => this.data[tab]?.[key]?.values?.[0] ?? '';

  readonly blocks = [
    { label: 'Amazon', title: this.get('amazon', 'seoTitle'), body: [1, 2, 3, 4, 5].map((i) => this.get('amazon', `bulletPoint${i}`)).filter(Boolean).map((b) => `• ${b}`).join('\n') },
    { label: 'Flipkart', title: this.get('flipkart', 'seoTitle'), body: this.get('flipkart', 'description') },
    { label: 'Meesho', title: this.get('meesho', 'listingTitle'), body: this.get('meesho', 'description') },
    { label: 'Instagram', title: '', body: [this.get('instagram', 'caption'), this.get('instagram', 'hashtags')].filter(Boolean).join('\n\n') },
  ];

  readonly hasContent = this.blocks.some((b) => b.title || b.body);
}
