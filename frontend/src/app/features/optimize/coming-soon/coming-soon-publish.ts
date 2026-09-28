import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FeatureService, NotifyFeature } from '../../../services/features';
import { LanguageService } from '../../../services/language';

export type ComingSoonChannel = 'flipkart' | 'meesho' | 'instagram';

export const CHANNEL_LABELS: Record<ComingSoonChannel, string> = { flipkart: 'Flipkart', meesho: 'Meesho', instagram: 'Instagram' };

/** "Coming soon" badge + "Notify me" for a channel whose publishing isn't live yet. */
@Component({
  selector: 'app-coming-soon-publish',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <span class="coming-soon">
      <span class="coming-soon__badge" data-testid="coming-soon-badge">{{ i18n.t('Coming soon', 'जल्द आ रहा है') }}</span>
      @if (requested()) {
        <span class="coming-soon__done" role="status" data-testid="notify-done">
          <mat-icon inline="true" aria-hidden="true">check_circle</mat-icon>
          {{ i18n.t('We’ll let you know', 'हम आपको बताएंगे') }}
        </span>
      } @else {
        <button
          mat-stroked-button
          type="button"
          class="coming-soon__notify"
          data-testid="notify-me"
          [disabled]="saving()"
          [attr.aria-label]="i18n.t('Notify me when ' + label() + ' publishing is live', label() + ' publishing live होने पर मुझे बताएं')"
          (click)="notify()"
        >
          <mat-icon aria-hidden="true">notifications</mat-icon>
          {{ i18n.t('Notify me', 'मुझे बताएं') }}
        </button>
      }
      @if (error()) {
        <span class="coming-soon__error" role="alert">{{ error() }}</span>
      }
    </span>
  `,
  styles: [`
    .coming-soon { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
    .coming-soon__badge {
      font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
      padding: 4px 10px; border-radius: 999px; background: #fef3c7; color: #92400e; white-space: nowrap;
    }
    .coming-soon__done { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #15803d; }
    .coming-soon__error { flex-basis: 100%; text-align: right; font-size: 12px; color: #b91c1c; }
  `],
})
export class ComingSoonPublish {
  protected readonly i18n = inject(LanguageService);
  private readonly features = inject(FeatureService);

  readonly channel = input.required<ComingSoonChannel>();

  protected readonly label = computed(() => CHANNEL_LABELS[this.channel()]);
  protected readonly requested = computed(() => this.features.notified().has(`${this.channel()}_publish`));
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async notify(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.features.notifyMe(`${this.channel()}_publish` as NotifyFeature);
    } catch {
      this.error.set(this.i18n.t('Couldn’t save — please try again.', 'Save नहीं हुआ — फिर से try करें।'));
    } finally {
      this.saving.set(false);
    }
  }
}
