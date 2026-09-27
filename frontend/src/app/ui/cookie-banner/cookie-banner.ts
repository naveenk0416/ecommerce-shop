import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentService } from '../../services/consent';
import { AnalyticsService } from '../../services/analytics';
import { LanguageService } from '../../services/language';

/**
 * First-visit cookie consent bar. Kept deliberately short (two lines on a 375px phone) so it never
 * sits over the hero CTA; while it's visible the WhatsApp button is lifted above it (see app.css).
 */
@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (consent.choice() === null) {
      <div class="cookie-banner" role="region" aria-label="Cookie consent" [attr.lang]="i18n.lang()">
        <p class="cookie-banner__text">
          {{ i18n.t('We use cookies to improve SellAssist and measure our ads.', 'हम SellAssist को बेहतर बनाने और अपने ads मापने के लिए cookies का उपयोग करते हैं.') }}
          <a routerLink="/privacy">{{ i18n.t('Privacy Policy', 'Privacy Policy') }}</a>
        </p>
        <div class="cookie-banner__actions">
          <button type="button" class="cookie-banner__btn cookie-banner__btn--ghost" (click)="decline()">{{ i18n.t('Decline', 'मना करें') }}</button>
          <button type="button" class="cookie-banner__btn cookie-banner__btn--primary" (click)="accept()">{{ i18n.t('Accept', 'स्वीकार करें') }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    .cookie-banner {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom));
      z-index: 60;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      max-width: 720px;
      margin: 0 auto;
      padding: 0.65rem 0.75rem 0.65rem 1rem;
      border-radius: 1.1rem;
      background: #0f172a;
      color: #e2e8f0;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.3);
    }
    .cookie-banner__text {
      flex: 1;
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
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
      padding: 0.5rem 0.8rem;
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
      .cookie-banner {
        flex-direction: column;
        align-items: stretch;
        gap: 0.5rem;
        padding: 0.6rem 0.75rem;
      }
      .cookie-banner__actions {
        justify-content: flex-end;
      }
      .cookie-banner__btn {
        padding: 0.4rem 0.9rem;
      }
    }
    /* Short phones (iPhone SE and similar): the hero's "Start Free" button sits in the bottom
       band of the first screen, so a bottom bar would cover it. Dock under the header instead,
       over the hero's empty top padding. Keep 72px in sync with the mobile header height. */
    @media (max-width: 480px) and (max-height: 759px) {
      .cookie-banner {
        top: 72px;
        bottom: auto;
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
