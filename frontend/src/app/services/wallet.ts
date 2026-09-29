import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { apiFetch, ApiError, onCoinBalance } from './api';
import { AuthService } from './auth';
import { LanguageService } from './language';
import { loadRazorpay } from '../utils/razorpay';
import { PAYMENTS_ENABLED } from '../config/site-config';

/** With payments off, coin packs always show as off here too ("Notify me", no buy buttons). */
function withPaymentsFlag(wallet: WalletSummary): WalletSummary {
  return PAYMENTS_ENABLED ? wallet : { ...wallet, packs: { ...wallet.packs, enabled: false, starter: null, regular: [], festive: [], minPriceInr: null } };
}

export type BonusId = 'welcome' | 'mobile' | 'firstInventorySave' | 'firstPublish' | 'businessDetails';

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
  emailVerified?: boolean;
  /** Welcome coins that arrive when the email is verified (0 if none). */
  pendingWelcome?: number;
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
  private readonly i18n = inject(LanguageService);

  readonly wallet = signal<WalletSummary | null>(null);
  readonly loading = signal(false);
  /** Set when the wallet couldn't be loaded, so the page can show it instead of loading forever. */
  readonly loadError = signal<string | null>(null);
  /** Latest balance from any API response (X-Coin-Balance header) — updates the header pill immediately. */
  private readonly live = signal<{ free: number; paid: number } | null>(null);
  readonly balance = computed(() => {
    const live = this.live();
    return live ? live.free + live.paid : this.wallet()?.balance.total ?? null;
  });
  readonly listingCost = computed(() => this.wallet()?.listingCost ?? 1);
  /** True once the balance is known and too low for an AI listing. */
  readonly cannotAffordListing = computed(() => {
    const balance = this.balance();
    return balance !== null && balance < this.listingCost();
  });
  /** "Uses 1 coin · 14 left" (Hindi: "1 coin लगेगा · 14 बचे"), or null until the balance is known. */
  readonly costNote = computed(() => {
    const balance = this.balance();
    if (balance === null) return null;
    const cost = this.listingCost();
    return this.i18n.t(`Uses ${cost} coin${cost === 1 ? '' : 's'} · ${balance} left`, `${cost} coin लगेगा · ${balance} बचे`);
  });
  /** Set when an AI listing was refused for lack of coins — the out-of-coins screen opens. */
  readonly outOfCoins = signal(false);

  /** English/Hindi text for templates that already use the wallet. */
  i18nText(en: string, hi: string): string {
    return this.i18n.t(en, hi);
  }

  private inflight: Promise<WalletSummary | null> | null = null;

  constructor() {
    onCoinBalance((balance) => this.setBalance(balance));
    // Signed out → forget the previous seller's balance.
    effect(() => {
      if (!this.auth.user()) {
        this.live.set(null);
        this.wallet.set(null);
      }
    });
  }

  /** Loads (or reloads) the wallet. Concurrent callers share one request. */
  async load(): Promise<WalletSummary | null> {
    if (!this.auth.user()) return null;
    if (this.inflight) return this.inflight;
    this.loading.set(true);
    this.inflight = apiFetch<WalletSummary>('/wallet')
      .then((wallet) => {
        this.wallet.set(withPaymentsFlag(wallet));
        this.live.set({ free: wallet.balance.free, paid: wallet.balance.paid });
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
    this.live.set(balance);
    const current = this.wallet();
    if (current) this.wallet.set({ ...current, balance: { ...balance, total: balance.free + balance.paid } });
  }

  setWallet(wallet: WalletSummary): void {
    this.wallet.set(withPaymentsFlag(wallet));
    this.live.set({ free: wallet.balance.free, paid: wallet.balance.paid });
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
    const order = await apiFetch<{ orderId: string; amount: number; currency: string; keyId: string; pack: CoinPack }>(`/wallet/packs/${encodeURIComponent(packId)}/order`, { method: 'POST' })
      .catch((error: ApiError) => {
        // Coin packs need a verified email.
        if ((error.data as { code?: string } | undefined)?.code === 'EMAIL_NOT_VERIFIED') {
          error.message = this.i18n.t('Verify your email first.', 'पहले अपना email verify करें।');
        }
        throw error;
      });
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
              if (result.wallet) this.wallet.set(withPaymentsFlag(result.wallet));
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
