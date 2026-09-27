import { Injectable, computed, inject, signal } from '@angular/core';
import { apiFetch } from './api';
import { AuthService } from './auth';
import { loadRazorpay } from '../utils/razorpay';

export type BonusId = 'welcome' | 'mobile' | 'firstInventorySave' | 'firstPublish';

export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  priceInr: number;
  startsAt?: string;
  endsAt?: string;
  /** Starter offer only. */
  expiresAt?: string;
}

export interface WalletLedgerRow {
  id: string;
  type: string;
  amount: number;
  reason: string;
  createdAt: string;
  balanceAfter: number | null;
}

export interface TimeSaved {
  month: string;
  hours: number;
  minutes: number;
  counts: { aiListings: number; autofills: number; gstLookups: number };
}

/** GET /api/wallet — every number comes from the backend's config/coins.json. */
export interface WalletSummary {
  balance: { free: number; paid: number; total: number };
  listingCost: number;
  monthlyTopUpTo: number;
  nextTopUpAt: string;
  bonuses: { id: BonusId; coins: number; done: boolean }[];
  referral: { code: string | null; link: string | null; reward: number; maxPerMonth: number; rewardedThisMonth: number; rewardedTotal: number };
  packs: {
    enabled: boolean;
    lowBalanceThreshold: number;
    starter: CoinPack | null;
    regular: CoinPack[];
    festive: CoinPack[];
    minPriceInr: number | null;
    hasPurchased: boolean;
  };
  notifyRequested: boolean;
  timeSaved: TimeSaved;
  lastMonthTimeSaved: TimeSaved;
  catalog: { band: string | null; promptDismissed: boolean; bands: string[] };
  freeAssists: { fieldFixPerListing: number; autofillPerListingPerMarketplace: number; perUserPerDay: number; usedToday: number };
  blockedFieldPatterns: string[];
  ledger: WalletLedgerRow[];
}

export interface AssistsLeft {
  left: number;
  limit: number;
  dayLeft: number;
  dayLimit: number;
}

export interface AutofillField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'select' | 'bullets' | 'number';
  options?: string[];
}

function normalizeFieldName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/**
 * Mirrors the backend's isBlockedAutofillField: brand, MRP, origin, manufacturer, weight,
 * dimensions, GTIN, compliance … are never filled by the AI (the server refuses them anyway).
 */
export function isBlockedAiField(key: string, label: string, patterns: readonly string[]): boolean {
  const haystack = `_${normalizeFieldName(key)}_${normalizeFieldName(label)}_`;
  return patterns.some((pattern) => haystack.includes(`_${normalizeFieldName(pattern)}`));
}

/** The seller's coin wallet: balance, bonuses, referral link, packs, and the free AI assists. */
@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly auth = inject(AuthService);

  readonly wallet = signal<WalletSummary | null>(null);
  readonly loading = signal(false);
  /** Set when the wallet couldn't be loaded, so the page can show it instead of loading forever. */
  readonly loadError = signal<string | null>(null);
  readonly balance = computed(() => this.wallet()?.balance.total ?? null);
  /** Set when an AI listing was refused for lack of coins — the out-of-coins screen opens. */
  readonly outOfCoins = signal(false);

  private inflight: Promise<WalletSummary | null> | null = null;

  /** Loads (or reloads) the wallet. Concurrent callers share one request. */
  async load(): Promise<WalletSummary | null> {
    if (!this.auth.user()) return null;
    if (this.inflight) return this.inflight;
    this.loading.set(true);
    this.inflight = apiFetch<WalletSummary>('/wallet')
      .then((wallet) => {
        this.wallet.set(wallet);
        this.loadError.set(null);
        return wallet;
      })
      .catch((error) => {
        console.error('Could not load the coin wallet', error);
        const status = (error as { status?: number })?.status;
        this.loadError.set(status === 404
          ? 'The coin wallet isn\'t available on the server yet. Please try again later.'
          : (error instanceof Error && error.message) || 'Could not load your coins.');
        return this.wallet();
      })
      .finally(() => {
        this.loading.set(false);
        this.inflight = null;
      });
    return this.inflight;
  }

  /** After a spend the server returns the new balance — show it without a full reload. */
  setBalance(balance: { free: number; paid: number }): void {
    const current = this.wallet();
    if (current) this.wallet.set({ ...current, balance: { ...balance, total: balance.free + balance.paid } });
  }

  setWallet(wallet: WalletSummary): void {
    this.wallet.set(wallet);
  }

  async notifyMe(): Promise<void> {
    await apiFetch('/wallet/notify-me', { method: 'POST' });
    const current = this.wallet();
    if (current) this.wallet.set({ ...current, notifyRequested: true });
  }

  async setCatalogSize(band: string): Promise<void> {
    await apiFetch('/wallet/catalog-size', { method: 'POST', body: { band } });
    const current = this.wallet();
    if (current) this.wallet.set({ ...current, catalog: { ...current.catalog, band, promptDismissed: true } });
  }

  async dismissCatalogPrompt(): Promise<void> {
    await apiFetch('/wallet/catalog-size', { method: 'POST', body: { dismiss: true } });
    const current = this.wallet();
    if (current) this.wallet.set({ ...current, catalog: { ...current.catalog, promptDismissed: true } });
  }

  /**
   * Opens Razorpay checkout for a coin pack. Resolves true once the payment is verified and the
   * coins are credited, false if the seller closed checkout. The price always comes from the server.
   */
  async buyPack(packId: string): Promise<boolean> {
    const order = await apiFetch<{ orderId: string; amount: number; currency: string; keyId: string; pack: CoinPack }>(`/wallet/packs/${encodeURIComponent(packId)}/order`, { method: 'POST' });
    const Razorpay = await loadRazorpay();
    const user = this.auth.user();
    return new Promise<boolean>((resolve, reject) => {
      const checkout = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'SellAssist',
        description: `${order.pack.name} — ${order.pack.coins} coins`,
        order_id: order.orderId,
        prefill: { name: user?.displayName || '', email: user?.email || '' },
        theme: { color: '#ea580c' },
        handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          apiFetch<{ ok: boolean; wallet: WalletSummary }>('/wallet/packs/verify', { method: 'POST', body: response })
            .then((result) => {
              if (result.wallet) this.wallet.set(result.wallet);
              resolve(true);
            })
            .catch(reject);
        },
        modal: { ondismiss: () => resolve(false) },
      });
      checkout.open();
    });
  }

  // ---- Free AI assists ----

  assists(kind: 'field_fix' | 'marketplace_autofill', listingKey: string, marketplace?: string): Promise<AssistsLeft> {
    const params = new URLSearchParams({ kind, listingKey, ...(marketplace ? { marketplace } : {}) });
    return apiFetch<AssistsLeft>(`/ai/assists?${params}`);
  }

  fieldFix(input: {
    listingKey: string; tab: string; fieldKey: string; label: string; value: string; maxLength: number;
    context: { title?: string; category?: string; description?: string };
  }): Promise<{ value: string; assists: AssistsLeft }> {
    return apiFetch('/ai/field-fix', { method: 'POST', body: input });
  }

  marketplaceAutofill(listingId: string, marketplace: 'amazon' | 'flipkart', fields: AutofillField[]): Promise<{ values: Record<string, string | number>; blocked: string[]; assists: AssistsLeft }> {
    return apiFetch('/ai/marketplace-autofill', { method: 'POST', body: { listingId, marketplace, fields } });
  }
}
