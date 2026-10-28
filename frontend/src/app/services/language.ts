import { Injectable, effect, signal } from '@angular/core';
import { REGIONAL_TEXT } from '../i18n/regional.i18n';

const LANG_KEY = 'sa_lang';

export type SiteLanguage = 'en' | 'hi' | 'te' | 'kn';

/** Every UI language, in the order the language switches show them. */
export const SITE_LANGUAGES: readonly { code: SiteLanguage; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिंदी', short: 'हिं' },
  { code: 'te', label: 'తెలుగు', short: 'తె' },
  { code: 'kn', label: 'ಕನ್ನಡ', short: 'ಕ' },
];

function isSiteLanguage(value: unknown): value is SiteLanguage {
  return value === 'en' || value === 'hi' || value === 'te' || value === 'kn';
}

/**
 * Site-wide language choice: English, Hindi, Telugu or Kannada. Hindi/Telugu/Kannada by default for
 * ?lang= links and regional ad campaigns (utm_campaign containing "hindi", "telugu" or "kannada",
 * e.g. surat_hindi / hyd_telugu / blr_kannada), either in the URL or in the first-touch attribution
 * saved by AnalyticsService. Once the seller picks a language with a toggle (or in Profile), that
 * choice is remembered on this browser and wins.
 *
 * Text is written as t(english, hindi) everywhere. Telugu and Kannada come from the optional third
 * and fourth arguments, else from the shared dictionary (i18n/regional.i18n.ts, keyed by the English
 * text), else English — so a missing translation never shows a blank. Legal pages stay English.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang = signal<SiteLanguage>(LanguageService.initialLang());
  private readonly initial = this.lang();

  constructor() {
    effect(() => {
      try {
        document.documentElement.lang = this.lang();
      } catch {
        // No document (server render) — nothing to update.
      }
    });
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
      return isSiteLanguage(value) ? value : null;
    } catch {
      return null;
    }
  }

  /** Picks the string for the current language (Telugu/Kannada fall back to the dictionary, then English). */
  t(en: string, hi: string, te?: string, kn?: string): string {
    switch (this.lang()) {
      case 'hi': return hi;
      case 'te': return te ?? REGIONAL_TEXT[en]?.te ?? en;
      case 'kn': return kn ?? REGIONAL_TEXT[en]?.kn ?? en;
      default: return en;
    }
  }

  private static initialLang(): SiteLanguage {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('lang');
      if (isSiteLanguage(fromUrl)) return fromUrl;
      const chosen = LanguageService.stored();
      if (chosen) return chosen;
      const fromCampaign = (campaign: string | null | undefined): SiteLanguage | null =>
        /hindi/i.test(campaign || '') ? 'hi' : /telugu/i.test(campaign || '') ? 'te' : /kannada/i.test(campaign || '') ? 'kn' : null;
      const inUrl = fromCampaign(params.get('utm_campaign'));
      if (inUrl) return inUrl;
      const stored = JSON.parse(window.localStorage.getItem('sa_attribution') || 'null') as { utm_campaign?: string } | null;
      const firstTouch = fromCampaign(stored?.utm_campaign);
      if (firstTouch) return firstTouch;
    } catch {
      // No window/storage — default to English.
    }
    return 'en';
  }
}
