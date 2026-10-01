import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../services/auth';
import { LanguageService } from '../../../services/language';
import { AnalyticsService } from '../../../services/analytics';
import { MarketplacePicker } from '../onboarding/marketplace-picker';
import { initialMarketplaces } from '../../../config/signup-options';

/** Profile → "My marketplaces": change the "where do you sell?" answer at any time. */
@Component({
  selector: 'app-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarketplacePicker],
  template: `
    <section class="profile" [attr.lang]="i18n.lang()">
      <h2 class="profile__title">{{ t('Profile', 'Profile') }}</h2>
      @if (auth.profile(); as p) {
        <p class="profile__meta">{{ p.email }}</p>
      }

      <form class="profile__card" (submit)="$event.preventDefault(); save()" novalidate aria-labelledby="my-marketplaces-title" data-testid="my-marketplaces">
        <h3 id="my-marketplaces-title" class="profile__h">{{ t('My marketplaces', 'मेरे marketplaces') }}</h3>
        <p class="profile__hint">{{ t('Your marketplaces are shown first in every listing.', 'आपके marketplaces हर listing में सबसे पहले दिखेंगे।') }}</p>
        <app-marketplace-picker [(selected)]="selected" [(other)]="other" />
        @if (error()) { <p class="profile__err" role="alert">{{ error() }}</p> }
        <div class="profile__actions">
          @if (savedNote()) { <span class="profile__ok" role="status" data-testid="my-marketplaces-saved">{{ savedNote() }}</span> }
          <button type="submit" class="profile__btn" [disabled]="saving()" data-testid="my-marketplaces-save">{{ saving() ? t('Saving…', 'Save हो रहा है…') : t('Save', 'Save करें') }}</button>
        </div>
      </form>
    </section>
  `,
  styles: `
    :host { display: block; }
    .profile { max-width: 720px; display: flex; flex-direction: column; gap: 12px; }
    .profile__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
    .profile__meta { margin: -6px 0 0; font-size: 13px; color: #64748b; word-break: break-all; }
    .profile__card { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
    .profile__h { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
    .profile__hint { margin: -4px 0 0; font-size: 13px; color: #64748b; }
    .profile__actions { display: flex; justify-content: flex-end; align-items: center; gap: 12px; flex-wrap: wrap; }
    .profile__btn { min-height: 40px; padding: 0 18px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #f97316, #dc2626); color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; }
    .profile__btn:disabled { opacity: 0.6; }
    .profile__ok { font-size: 13px; font-weight: 700; color: #15803d; }
    .profile__err { margin: 0; font-size: 13px; font-weight: 700; color: #b91c1c; }
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(LanguageService);
  private readonly analytics = inject(AnalyticsService);
  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);

  selected = signal<string[]>([]);
  other = signal('');
  saving = signal(false);
  savedNote = signal<string | null>(null);
  error = signal<string | null>(null);
  private filled = false;

  constructor() {
    // Fill the chips once the profile is in (it may still be loading on a hard refresh).
    effect(() => {
      const p = this.auth.profile();
      if (!p || this.filled) return;
      this.filled = true;
      untracked(() => {
        this.selected.set(initialMarketplaces(p));
        this.other.set(p.marketplacesOther ?? '');
      });
    });
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.savedNote.set(null);
    try {
      await this.auth.saveMarketplaces(this.selected(), this.other().trim());
      const saved = this.auth.profile()?.marketplaces ?? [];
      this.selected.set([...saved]);
      this.other.set(this.auth.profile()?.marketplacesOther ?? '');
      if (saved.length) this.analytics.track('marketplaces_selected', { marketplaces: saved.join(',') });
      this.savedNote.set(this.t('Saved', 'Save हो गया'));
    } catch {
      this.error.set(this.t('Could not save. Please try again.', 'Save नहीं हुआ। फिर से try करें।'));
    } finally {
      this.saving.set(false);
    }
  }
}
