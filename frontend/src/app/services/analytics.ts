import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { META_PIXEL_IDS } from '../config/site-config';
import { ConsentService } from './consent';
import { apiFetch } from './api';

/** First-touch marketing attribution captured from the landing URL. */
export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  fbclid?: string;
  /** Referral code from a sellassist.in/?ref=CODE link. */
  ref?: string;
  landingPath?: string;
  capturedAt?: string;
}

const ATTRIBUTION_KEY = 'sa_attribution';
const ATTRIBUTION_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'] as const;

/** Sign-up funnel steps (GA4 events; the browser-side ones are also stored on the server). */
export type FunnelStep =
  | 'landing_view' | 'signup_view' | 'sign_up_start' | 'signup_submit' | 'sign_up' | 'email_verified'
  | 'first_listing_created' | 'onboarding_details_added'
  | 'guest_try_start' | 'guest_try_success' | 'guest_try_signup_click';

/** Steps the server can't see on its own — sent to POST /api/events. */
const STORED_FROM_BROWSER = new Set<FunnelStep>(['landing_view', 'signup_view', 'sign_up_start', 'signup_submit', 'guest_try_start', 'guest_try_success', 'guest_try_signup_click']);
/** Counted once per page load (views and "started typing"). */
const ONCE_PER_PAGE_LOAD = new Set<FunnelStep>(['landing_view', 'signup_view', 'sign_up_start']);

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };

/**
 * Ad tracking for paid campaigns: Meta Pixel (PageView on every SPA route change, Lead,
 * CompleteRegistration), GA4 `sign_up`, and dataLayer events so GTM-managed tags can react to
 * the same moments. The pixel is loaded directly because tags aren't managed in code via GTM;
 * with META_PIXEL_IDS empty nothing is loaded and every call is a no-op.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private router = inject(Router);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private consent = inject(ConsentService);
  private initialized = false;
  private pixelStarted = false;

  init(): void {
    if (!this.isBrowser || this.initialized) return;
    this.initialized = true;

    this.captureAttribution();

    // Meta Pixel only after cookie consent — accepted on an earlier visit, or later via
    // enableAdTracking() when the banner's Accept is clicked.
    if (this.consent.choice() === 'granted') {
      this.startPixel();
    }

    // The first NavigationEnd is the initial load, already counted above.
    let first = true;
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      if (first) {
        first = false;
        return;
      }
      this.fbq('track', 'PageView');
    });
  }

  /** Called when the visitor accepts cookies: loads the pixel and counts the current page. */
  enableAdTracking(): void {
    if (!this.isBrowser) return;
    this.startPixel();
  }

  private startPixel(): void {
    if (META_PIXEL_IDS.length === 0 || this.pixelStarted) return;
    this.pixelStarted = true;
    this.loadPixel();
    for (const id of META_PIXEL_IDS) this.fbq('init', id);
    this.fbq('track', 'PageView');
  }

  /** "Start Free" / "Get Started" / "Create your free account" clicks. */
  trackLead(source: string): void {
    this.fbq('track', 'Lead', { content_name: source });
    this.pushDataLayer({ event: 'lead', lead_source: source });
  }

  /** Called once the backend has accepted a new registration. */
  trackSignUp(method: 'email' | 'google' = 'email'): void {
    this.fbq('track', 'CompleteRegistration');
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.('event', 'sign_up', { method, ...this.utmParams() });
    this.pushDataLayer({ event: 'sign_up', method, ...this.utmParams() });
  }

  private sentThisPageLoad = new Set<FunnelStep>();

  /**
   * One funnel step: a GA4 event with utm_source / utm_campaign, and — for steps only the browser
   * sees — a row on the server for the admin funnel table. Never throws.
   */
  track(step: FunnelStep, params: Record<string, unknown> = {}): void {
    if (!this.isBrowser) return;
    if (ONCE_PER_PAGE_LOAD.has(step)) {
      if (this.sentThisPageLoad.has(step)) return;
      this.sentThisPageLoad.add(step);
    }
    const utm = this.utmParams();
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.('event', step, { ...utm, ...params });
    this.pushDataLayer({ event: step, ...utm, ...params });
    if (STORED_FROM_BROWSER.has(step)) {
      apiFetch('/events', { method: 'POST', body: { name: step, ...utm }, keepalive: true }).catch(() => undefined);
    }
  }

  /** "Free account बनाएं — पूरी listing देखें" under the guest preview: a Meta Lead too. */
  trackGuestSignupClick(): void {
    this.fbq('track', 'Lead', { content_name: 'guest_try' });
    this.track('guest_try_signup_click');
  }

  private utmParams(): { utm_source?: string; utm_campaign?: string } {
    const attribution = this.getAttribution();
    let source = attribution?.utm_source;
    let campaign = attribution?.utm_campaign;
    try {
      const params = new URLSearchParams(window.location.search);
      source = source || params.get('utm_source') || undefined;
      campaign = campaign || params.get('utm_campaign') || undefined;
    } catch {
      // No URL access — use what was stored.
    }
    return { ...(source ? { utm_source: source } : {}), ...(campaign ? { utm_campaign: campaign } : {}) };
  }

  getAttribution(): Attribution | null {
    if (!this.isBrowser) return null;
    try {
      const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
      return raw ? (JSON.parse(raw) as Attribution) : null;
    } catch {
      return null;
    }
  }

  /**
   * First touch wins: saved only when the URL carries campaign params and nothing is stored yet.
   * A referral code (?ref=) is added to the stored attribution even when UTM params came first.
   */
  private captureAttribution(): void {
    try {
      const params = new URLSearchParams(window.location.search);
      const found: Attribution = {};
      for (const key of ATTRIBUTION_PARAMS) {
        const value = params.get(key);
        if (value) found[key] = value.slice(0, 200);
      }
      if (Object.keys(found).length > 0 && !window.localStorage.getItem(ATTRIBUTION_KEY)) {
        found.landingPath = window.location.pathname.slice(0, 200);
        found.capturedAt = new Date().toISOString();
        window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(found));
      }

      const ref = params.get('ref')?.trim().toUpperCase();
      if (ref && /^[A-Z0-9]{4,16}$/.test(ref)) {
        const stored = this.getAttribution();
        if (!stored?.ref) {
          const base: Attribution = stored ?? { landingPath: window.location.pathname.slice(0, 200), capturedAt: new Date().toISOString() };
          window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...base, ref }));
        }
      }
    } catch {
      // Storage blocked (private mode, disabled cookies) — attribution is best-effort.
    }
  }

  private fbq(...args: unknown[]): void {
    if (!this.isBrowser || META_PIXEL_IDS.length === 0 || !this.pixelStarted) return;
    (window as unknown as { fbq?: Fbq }).fbq?.(...args);
  }

  private pushDataLayer(payload: Record<string, unknown>): void {
    if (!this.isBrowser) return;
    const w = window as unknown as { dataLayer?: unknown[] };
    (w.dataLayer ??= []).push(payload);
  }

  /** Meta's standard base code, minus the automatic init/PageView (done in init()). */
  private loadPixel(): void {
    const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
    if (w.fbq) return;
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    w.fbq = fbq;
    w._fbq ??= fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
}
