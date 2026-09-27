import { Injectable, signal } from '@angular/core';

export type SiteLanguage = 'en' | 'hi';

/**
 * Site-wide English/Hindi choice for the marketing surfaces (landing hero, cookie banner,
 * sign-up helper text). Hindi by default for ?lang=hi links and Hindi ad campaigns
 * (utm_campaign containing "hindi", e.g. surat_hindi / delhi_hindi), either in the URL or in the
 * first-touch attribution saved by AnalyticsService.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang = signal<SiteLanguage>(LanguageService.initialLang());

  /** Picks the Hindi or English string for the current language. */
  t(en: string, hi: string): string {
    return this.lang() === 'hi' ? hi : en;
  }

  private static initialLang(): SiteLanguage {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('lang') === 'hi') return 'hi';
      if (/hindi/i.test(params.get('utm_campaign') || '')) return 'hi';
      const stored = JSON.parse(window.localStorage.getItem('sa_attribution') || 'null') as { utm_campaign?: string } | null;
      if (/hindi/i.test(stored?.utm_campaign || '')) return 'hi';
    } catch {
      // No window/storage — default to English.
    }
    return 'en';
  }
}
