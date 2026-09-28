import { Injectable, effect, inject, signal } from '@angular/core';
import { apiFetch } from './api';
import { AuthService } from './auth';

export type PublishChannel = 'amazon' | 'flipkart' | 'meesho' | 'instagram';
export type NotifyFeature = 'flipkart_publish' | 'meesho_publish' | 'instagram_publish';

/** Until the server answers, only Amazon counts as live — a missing flag never enables a channel. */
const DEFAULT_PUBLISH: Record<PublishChannel, boolean> = { amazon: true, flipkart: false, meesho: false, instagram: false };

/**
 * Which channels can really be published to, read from the backend's *_PUBLISH_ENABLED flags
 * (GET /api/features), plus the "Notify me" requests this seller has already made.
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
    effect(() => {
      const user = this.auth.user();
      if (!user) {
        this.notified.set(new Set());
        this.notifiedFor = null;
        return;
      }
      void this.loadNotified(user.uid);
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

  private async loadNotified(uid: string): Promise<void> {
    if (this.notifiedFor === uid) return;
    this.notifiedFor = uid;
    try {
      const res = await apiFetch<{ features: string[] }>('/features/notify-me');
      if (this.notifiedFor === uid) this.notified.set(new Set(res.features));
    } catch (error) {
      console.warn('Could not load "Notify me" requests', error);
      this.notifiedFor = null;
    }
  }

  /** Records the request once on the server (repeat clicks are a no-op there too). */
  async notifyMe(feature: NotifyFeature): Promise<void> {
    await apiFetch('/features/notify-me', { method: 'POST', body: { feature } });
    this.notified.update((current) => new Set(current).add(feature));
  }
}
