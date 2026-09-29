import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentService } from '../../services/consent';
import { AnalyticsService } from '../../services/analytics';
import { LanguageService } from '../../services/language';

/**
 * First-visit cookie consent: a thin bar at the very bottom (≤ 64px on a phone). While it's
 * visible the page gets matching bottom padding and the WhatsApp button sits above it (app.css),
 * so it never covers form fields or buttons.
 */
@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (consent.choice() === null) {
      <div class="cookie-banner" role="region" [attr.aria-label]="i18n.t('Cookie consent', 'Cookie सहमति')" [attr.lang]="i18n.lang()" data-testid="cookie-banner">
        <p class="cookie-banner__text">
          {{ i18n.t('We use cookies to improve SellAssist and measure ads.', 'हम cookies से SellAssist बेहतर बनाते हैं और ads मापते हैं।') }}
          <a routerLink="/privacy">{{ i18n.t('Privacy', 'Privacy') }}</a>
        </p>
        <div class="cookie-banner__actions">
          <button type="button" class="cookie-banner__btn cookie-banner__btn--ghost" (click)="decline()">{{ i18n.t('Decline', 'मना करें') }}</button>
          <button type="button" class="cookie-banner__btn cookie-banner__btn--primary" (click)="accept()">{{ i18n.t('Accept', 'ठीक है') }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    .cookie-banner {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 60;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      min-height: 52px;
      max-height: 64px;
      padding: 0.4rem max(0.75rem, env(safe-area-inset-right)) calc(0.4rem + env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
      background: #0f172a;
      color: #e2e8f0;
      box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.2);
    }
    .cookie-banner__text {
      flex: 1;
      margin: 0 auto;
      max-width: 640px;
      font-size: 12px;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .cookie-banner__text a {
      color: #fdba74;
      font-weight: 700;
      text-decoration: underline;
      white-space: nowrap;
    }
    .cookie-banner__actions {
      display: flex;
      gap: 0.4rem;
      flex-shrink: 0;
    }
    .cookie-banner__btn {
      min-height: 36px;
      padding: 0 0.8rem;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .cookie-banner__btn--ghost {
      color: #cbd5e1;
      border: 1px solid #334155;
    }
    .cookie-banner__btn--primary {
      color: #fff;
      background: linear-gradient(135deg, #f97316, #dc2626);
    }
    @media (max-width: 480px) {
      .cookie-banner__text {
        font-size: 11.5px;
      }
      .cookie-banner__btn {
        padding: 0 0.65rem;
      }
    }
  `,
})
export class CookieBanner {
  readonly consent = inject(ConsentService);
  readonly i18n = inject(LanguageService);
  private analytics = inject(AnalyticsService);

  accept() {
    this.consent.accept();
    this.analytics.enableAdTracking();
  }

  decline() {
    this.consent.decline();
  }
}
