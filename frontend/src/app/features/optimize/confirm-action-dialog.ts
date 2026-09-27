import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmActionData {
  title: string;
  intro: string;
  /** One row per marketplace/item, each listing exactly what will be published or changed. */
  items: { heading: string; lines: string[] }[];
  confirmLabel: string;
  /** Optional caution shown above the buttons (e.g. "This updates your live Amazon listing"). */
  warning?: string;
}

/** Confirmation before anything that publishes to, or changes, a live marketplace listing. */
@Component({
  selector: 'app-confirm-action-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="confirm__intro">{{ data.intro }}</p>
      @for (item of data.items; track item.heading) {
        <section class="confirm__item">
          <h3>{{ item.heading }}</h3>
          <ul>
            @for (line of item.lines; track $index) { <li>{{ line }}</li> }
          </ul>
        </section>
      }
      @if (data.warning) {
        <p class="confirm__warning" role="note"><mat-icon aria-hidden="true">warning</mat-icon>{{ data.warning }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button [mat-dialog-close]="false">Cancel</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="true" cdkFocusInitial>{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .confirm__intro { margin: 0 0 12px; color: #475569; }
    .confirm__item { padding: 10px 12px; margin-bottom: 8px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; }
    .confirm__item h3 { margin: 0 0 4px; font-size: 14px; font-weight: 800; color: #0f172a; }
    .confirm__item ul { margin: 0; padding-left: 18px; font-size: 13px; color: #334155; }
    .confirm__warning { display: flex; gap: 6px; align-items: flex-start; margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: 13px; }
    .confirm__warning mat-icon { flex-shrink: 0; font-size: 18px; width: 18px; height: 18px; }
  `,
})
export class ConfirmActionDialog {
  readonly data = inject<ConfirmActionData>(MAT_DIALOG_DATA);
}
