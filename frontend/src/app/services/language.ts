import { Injectable, effect, signal } from '@angular/core';

const LANG_KEY = 'sa_lang';

export type SiteLanguage = 'en' | 'hi';

/**
 * Site-wide English/Hindi choice for the marketing surfaces (landing hero, cookie banner,
 * sign-up helper text). Hindi by default for ?lang=hi links and Hindi ad campaigns
 * (utm_campaign containing "hindi", e.g. surat_hindi / delhi_hindi), either in the URL or in the
 * first-touch attribution saved by AnalyticsService. Once the seller picks a language with a
 * toggle, that choice is remembered on this browser and wins.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang = signal<SiteLanguage>(LanguageService.initialLang());
  private readonly initial = this.lang();

  constructor() {
    // Remember an explicit switch (not the automatic campaign default).
    effect(() => {
      const lang = this.lang();
      if (lang === this.initial && !LanguageService.stored()) return;
      try {
        window.localStorage.setItem(LANG_KEY, lang);
      } catch {
        // Storage blocked — the choice lasts for this visit only.
      }
    });
  }

  private static stored(): SiteLanguage | null {
    try {
      const value = window.localStorage.getItem(LANG_KEY);
      return value === 'en' || value === 'hi' ? value : null;
    } catch {
      return null;
    }
  }

  /** Picks the Hindi or English string for the current language. */
  t(en: string, hi: string): string {
    return this.lang() === 'hi' ? hi : en;
  }

  private static initialLang(): SiteLanguage {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('lang') === 'hi' || params.get('lang') === 'en') return params.get('lang') as SiteLanguage;
      const chosen = LanguageService.stored();
      if (chosen) return chosen;
      if (/hindi/i.test(params.get('utm_campaign') || '')) return 'hi';
      const stored = JSON.parse(window.localStorage.getItem('sa_attribution') || 'null') as { utm_campaign?: string } | null;
      if (/hindi/i.test(stored?.utm_campaign || '')) return 'hi';
    } catch {
      // No window/storage — default to English.
    }
    return 'en';
  }
}
