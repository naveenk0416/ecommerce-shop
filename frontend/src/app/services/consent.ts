import { Injectable, signal } from '@angular/core';

export type ConsentChoice = 'granted' | 'denied';

/** localStorage key — also read by the inline Consent Mode script in index.html. Keep in sync. */
export const CONSENT_STORAGE_KEY = 'sa_cookie_consent';

type Gtag = (...args: unknown[]) => void;

/**
 * Cookie consent. Google tags start in Consent Mode v2 "denied" (set in index.html before gtag/GTM
 * load) and the Meta Pixel is not loaded at all until the visitor accepts.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  /** null = not decided yet (banner shown). */
  readonly choice = signal<ConsentChoice | null>(ConsentService.read());

  accept(): void {
    this.save('granted');
    this.gtag()?.('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
    this.pushDataLayer({ event: 'cookie_consent', consent: 'granted' });
  }

  decline(): void {
    this.save('denied');
    this.pushDataLayer({ event: 'cookie_consent', consent: 'denied' });
  }

  private save(choice: ConsentChoice): void {
    this.choice.set(choice);
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
    } catch {
      // Storage blocked — the choice still applies for this page view.
    }
  }

  private static read(): ConsentChoice | null {
    try {
      const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      return value === 'granted' || value === 'denied' ? value : null;
    } catch {
      return null;
    }
  }

  private gtag(): Gtag | undefined {
    return (window as unknown as { gtag?: Gtag }).gtag;
  }

  private pushDataLayer(payload: Record<string, unknown>): void {
    const w = window as unknown as { dataLayer?: unknown[] };
    (w.dataLayer ??= []).push(payload);
  }
}
