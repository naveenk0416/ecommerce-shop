import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { META_PIXEL_ID } from '../config/site-config';

/** First-touch marketing attribution captured from the landing URL. */
export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  fbclid?: string;
  landingPath?: string;
  capturedAt?: string;
}

const ATTRIBUTION_KEY = 'sa_attribution';
const ATTRIBUTION_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'] as const;

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };

/**
 * Ad tracking for paid campaigns: Meta Pixel (PageView on every SPA route change, Lead,
 * CompleteRegistration), GA4 `sign_up`, and dataLayer events so GTM-managed tags can react to
 * the same moments. The pixel is loaded directly because tags aren't managed in code via GTM;
 * with META_PIXEL_ID empty nothing is loaded and every call is a no-op.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private router = inject(Router);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private initialized = false;

  init(): void {
    if (!this.isBrowser || this.initialized) return;
    this.initialized = true;

    this.captureAttribution();

    if (META_PIXEL_ID) {
      this.loadPixel();
      this.fbq('init', META_PIXEL_ID);
      this.fbq('track', 'PageView');
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

  /** "Start Free" / "Get Started" / "Create your free account" clicks. */
  trackLead(source: string): void {
    this.fbq('track', 'Lead', { content_name: source });
    this.pushDataLayer({ event: 'lead', lead_source: source });
  }

  /** Called once the backend has accepted a new registration. */
  trackSignUp(): void {
    this.fbq('track', 'CompleteRegistration');
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.('event', 'sign_up', { method: 'email' });
    this.pushDataLayer({ event: 'sign_up', method: 'email' });
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

  /** First touch wins: saved only when the URL carries campaign params and nothing is stored yet. */
  private captureAttribution(): void {
    try {
      const params = new URLSearchParams(window.location.search);
      const found: Attribution = {};
      for (const key of ATTRIBUTION_PARAMS) {
        const value = params.get(key);
        if (value) found[key] = value.slice(0, 200);
      }
      if (Object.keys(found).length === 0) return;
      if (window.localStorage.getItem(ATTRIBUTION_KEY)) return;
      found.landingPath = window.location.pathname.slice(0, 200);
      found.capturedAt = new Date().toISOString();
      window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(found));
    } catch {
      // Storage blocked (private mode, disabled cookies) — attribution is best-effort.
    }
  }

  private fbq(...args: unknown[]): void {
    if (!this.isBrowser || !META_PIXEL_ID) return;
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
