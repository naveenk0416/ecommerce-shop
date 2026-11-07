import { Injectable, effect, inject, signal } from '@angular/core';
import { apiFetch } from './api';
import { AuthService } from './auth';

export type PublishChannel = 'amazon' | 'flipkart' | 'meesho' | 'instagram';
export type NotifyFeature = 'flipkart_publish' | 'meesho_publish' | 'instagram_publish';

/** Until the server answers, only Amazon counts as live — a missing flag never enables a channel. */
const DEFAULT_PUBLISH: Record<PublishChannel, boolean> = { amazon: true, flipkart: false, meesho: false, instagram: false };

/**
 * Which channels can really be published to, read from the backend's *_PUBLISH_ENABLED flags
 * (GET /api/features), plus the "Notify me" requests this seller made in this visit.
 *
 * "Notify me" is only sent when the seller clicks it: the POST is idempotent on the server (a
 * repeat click answers alreadyRequested), so nothing needs to be fetched on page load.
 */
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly auth = inject(AuthService);

  readonly publish = signal<Record<PublishChannel, boolean>>(DEFAULT_PUBLISH);
  /** Features this seller asked to be told about (so "Notify me" shows "We'll let you know"). */
  readonly notified = signal<ReadonlySet<string>>(new Set());

  private flagsRequest: Promise<void> | null = null;
  private notifiedFor: string | null = null;

  constructor() {
    // A different (or no) account starts with a clean "Notify me" state.
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (uid === this.notifiedFor) return;
      this.notifiedFor = uid;
      this.notified.set(new Set());
    });
  }

  isLive(channel: PublishChannel): boolean {
    return this.publish()[channel];
  }

  /** Loads the flags once per page load; concurrent callers share one request. */
  load(): Promise<void> {
    this.flagsRequest ??= apiFetch<{ publish: Partial<Record<PublishChannel, boolean>> }>('/features')
      .then((res) => this.publish.set({ ...DEFAULT_PUBLISH, ...res.publish, amazon: true }))
      .catch((error) => {
        // Keep the safe defaults; try again next time something asks.
        console.warn('Could not load feature flags', error);
        this.flagsRequest = null;
      });
    return this.flagsRequest;
  }

  /** Records the request once on the server (repeat clicks are a no-op there too). */
  async notifyMe(feature: NotifyFeature): Promise<void> {
    await apiFetch('/features/notify-me', { method: 'POST', body: { feature } });
    this.notified.update((current) => new Set(current).add(feature));
  }
}
