import { Injectable, Injector, computed, inject, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { apiFetch } from './api';
import { LanguageService } from './language';
import { Variant } from '../config/size-presets';

/** Details shared by every product of a batch ("common details" step). */
export interface BatchCommon {
  category?: string;
  brand?: string;
  price?: number;
  mrp?: number;
  costPrice?: number;
  gstHandling?: 'inclusive' | 'exclusive';
  sizePreset?: string;
  sizes?: string[];
  /** Stock per size ("" = the product has no sizes). */
  stock?: Record<string, number>;
  sizePrices?: Record<string, number>;
  lowStockThreshold?: number;
}

export type BatchItemStatus = 'uploading' | 'queued' | 'generating' | 'ready' | 'failed';

export interface BatchItemView {
  id: string;
  index: number;
  status: BatchItemStatus;
  error: string | null;
  attempts: number;
  coinCharged: boolean;
  photoCount: number;
  photoUrls: string[];
  approved: boolean;
  inventoryListingId: string | null;
  listing: {
    id: string;
    title: string;
    category: string;
    price: number | null;
    mrp: number | null;
    stock: number | null;
    variants: Variant[] | null;
  } | null;
}

export interface BatchView {
  id: string;
  status: 'uploading' | 'queued' | 'running' | 'paused' | 'done' | 'cancelled';
  pauseReason: 'ai_busy' | 'coins' | null;
  pausedUntil: string | null;
  total: number;
  done: number;
  failed: number;
  common: BatchCommon;
  createdAt: string;
  finishedAt: string | null;
  seen: boolean;
  items: BatchItemView[];
}

export interface BatchDefaults {
  common: BatchCommon;
  balance: number;
  listingCost: number;
  maxPhotos: number;
  maxItems: number;
}

const POLL_MS = 4000;

/**
 * "Add many products". The batch runs on the server, so the seller can leave the page: this
 * service keeps polling while a batch is running (from anywhere in /optimize), drives the
 * sidebar badge and shows a notification when it finishes.
 */
@Injectable({ providedIn: 'root' })
export class BatchService {
  private readonly i18n = inject(LanguageService);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);

  readonly active = signal<BatchView | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watching = false;

  readonly running = computed(() => {
    const b = this.active();
    return !!b && ['queued', 'running', 'paused'].includes(b.status);
  });
  /** Sidebar badge: "3/12" while running, "✓" when finished and not opened yet. */
  readonly badge = computed(() => {
    const b = this.active();
    if (!b || b.status === 'uploading' || b.status === 'cancelled') return null;
    if (this.running()) return `${b.done + b.failed}/${b.total}`;
    return b.status === 'done' && !b.seen ? '✓' : null;
  });

  defaults(): Promise<BatchDefaults> {
    return apiFetch<BatchDefaults>('/batch/defaults');
  }

  create(body: { prompt: string; schema: Record<string, unknown>; items: { photoCount: number }[]; common: BatchCommon }): Promise<{ id: string; items: { id: string; index: number; photoCount: number }[] }> {
    return apiFetch('/batch', { method: 'POST', body });
  }

  uploadPhoto(batchId: string, itemId: string, n: number, image: string): Promise<{ ok: boolean }> {
    return apiFetch(`/batch/${batchId}/items/${itemId}/photos/${n}`, { method: 'PUT', body: { image } });
  }

  async start(batchId: string): Promise<BatchView> {
    const { batch } = await apiFetch<{ batch: BatchView }>(`/batch/${batchId}/start`, { method: 'POST' });
    this.active.set(batch);
    this.watch();
    return batch;
  }

  cancel(batchId: string): Promise<unknown> {
    return apiFetch(`/batch/${batchId}/cancel`, { method: 'POST' }).then(() => this.active.set(null));
  }

  async retry(batchId: string, itemId: string): Promise<BatchView> {
    const { batch } = await apiFetch<{ batch: BatchView }>(`/batch/${batchId}/items/${itemId}/retry`, { method: 'POST' });
    this.active.set(batch);
    this.watch();
    return batch;
  }

  async approve(batchId: string, itemIds?: string[], approved = true): Promise<BatchView> {
    const { batch } = await apiFetch<{ batch: BatchView }>(`/batch/${batchId}/approve`, { method: 'POST', body: { ...(itemIds ? { itemIds } : {}), approved } });
    this.active.set(batch);
    return batch;
  }

  async addToInventory(batchId: string, itemIds?: string[]): Promise<{ results: { itemId: string; ok: boolean; inventoryListingId?: string; error?: string }[]; batch: BatchView }> {
    const res = await apiFetch<{ results: { itemId: string; ok: boolean; inventoryListingId?: string; error?: string }[]; batch: BatchView }>(`/batch/${batchId}/inventory`, { method: 'POST', body: itemIds ? { itemIds } : {} });
    this.active.set(res.batch);
    return res;
  }

  async get(batchId: string): Promise<BatchView> {
    const { batch } = await apiFetch<{ batch: BatchView }>(`/batch/${batchId}`);
    return batch;
  }

  /** The review screen was opened: the "ready" badge goes away. */
  async markSeen(batch: BatchView): Promise<void> {
    if (batch.seen || batch.status !== 'done') return;
    await apiFetch(`/batch/${batch.id}/seen`, { method: 'POST' }).catch(() => undefined);
    this.active.update((b) => (b && b.id === batch.id ? { ...b, seen: true } : b));
  }

  /** Loads the current batch and keeps polling while it runs. */
  async refresh(): Promise<BatchView | null> {
    try {
      const { batch } = await apiFetch<{ batch: BatchView | null }>('/batch/active');
      const before = this.active();
      this.active.set(batch);
      if (before && batch && before.id === batch.id && ['queued', 'running', 'paused'].includes(before.status) && batch.status === 'done') {
        this.notifyDone(batch);
      }
      return batch;
    } catch {
      return this.active();
    }
  }

  watch(): void {
    if (this.watching) return;
    this.watching = true;
    const loop = async () => {
      const batch = await this.refresh();
      if (batch && ['queued', 'running', 'paused'].includes(batch.status)) {
        this.timer = setTimeout(loop, POLL_MS);
      } else {
        this.watching = false;
        this.timer = null;
      }
    };
    void loop();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watching = false;
  }

  /** Asked when a batch starts, so we can tell the seller when it's done even on another tab. */
  askNotificationPermission(): void {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
    } catch {
      // Not supported — the in-app message is enough.
    }
  }

  private notifyDone(batch: BatchView): void {
    const text = batch.failed
      ? this.i18n.t(`${batch.done} listings ready, ${batch.failed} failed`, `${batch.done} listings तैयार, ${batch.failed} नहीं बनीं`)
      : this.i18n.t(`${batch.done} listings ready`, `${batch.done} listings तैयार`);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        const n = new Notification('SellAssist', { body: text, tag: `batch-${batch.id}` });
        n.onclick = () => {
          window.focus();
          void this.router.navigate(['/optimize/batch']);
        };
      }
    } catch {
      // Ignore — the snackbar below still shows.
    }
    const snack = runInInjectionContext(this.injector, () => inject(MatSnackBar));
    snack.open(text, this.i18n.t('Review', 'देखें'), { duration: 10000 }).onAction().subscribe(() => void this.router.navigate(['/optimize/batch']));
  }
}
