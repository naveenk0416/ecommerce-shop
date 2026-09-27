import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, runInInjectionContext, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../services/auth';
import { LanguageService } from '../../../services/language';
import { WalletService } from '../../../services/wallet';
import { OutOfCoinsDialog } from './out-of-coins-dialog';
import { timeSavedText } from './wallet-page';

/** English/Hindi labels for the product-count bands. */
export const CATALOG_BAND_LABELS: Record<string, string> = { '1-10': '1–10', '11-50': '11–50', '51-200': '51–200', '200+': '200+' };

function istDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked — the nudge just shows again next time.
  }
}

/**
 * Small wallet prompts shown above the dashboard content:
 * - low balance (only with coin packs on), at most once a day, dismissible;
 * - "How many products do you sell?" once, for accounts created before sign-up asked it;
 * - once a month, how many hours SellAssist saved last month;
 * - the out-of-coins screen when an AI listing is refused.
 */
@Component({
  selector: 'app-wallet-nudges',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (showLowBalance()) {
      <div class="nudge nudge--warn" role="status">
        <mat-icon aria-hidden="true">savings</mat-icon>
        <span class="nudge__text">
          {{ lowBalanceText() }}
          <a routerLink="/optimize/wallet">{{ i18n.t('See packs', 'Packs देखें') }}</a>
        </span>
        <button mat-icon-button (click)="dismissLowBalance()" [attr.aria-label]="i18n.t('Dismiss', 'बंद करें')"><mat-icon>close</mat-icon></button>
      </div>
    }

    @if (showCatalogPrompt()) {
      <div class="nudge" role="group" [attr.aria-label]="i18n.t('How many products do you sell?', 'आप कितने products बेचते हैं?')">
        <mat-icon aria-hidden="true">inventory_2</mat-icon>
        <div class="nudge__text">
          <strong>{{ i18n.t('How many products do you sell?', 'आप कितने products बेचते हैं?') }}</strong>
          <div class="chips">
            @for (band of bands(); track band) {
              <button type="button" class="chip" [disabled]="savingBand()" (click)="chooseBand(band)">{{ bandLabel(band) }}</button>
            }
          </div>
        </div>
        <button mat-icon-button (click)="dismissCatalog()" [attr.aria-label]="i18n.t('Dismiss', 'बंद करें')"><mat-icon>close</mat-icon></button>
      </div>
    }

    @if (showMonthlySaved()) {
      <div class="nudge nudge--info" role="status">
        <mat-icon aria-hidden="true">schedule</mat-icon>
        <span class="nudge__text">{{ monthlySavedText() }}</span>
        <button mat-icon-button (click)="dismissMonthly()" [attr.aria-label]="i18n.t('Dismiss', 'बंद करें')"><mat-icon>close</mat-icon></button>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; margin: 0 32px; }
    :host:empty { display: none; }
    .nudge { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; font-size: 13px; color: #334155; margin-bottom: 8px; }
    .nudge > mat-icon { color: #ea580c; flex-shrink: 0; }
    .nudge--warn { background: #fff7ed; border-color: #fed7aa; color: #7c2d12; }
    .nudge--info { background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a; }
    .nudge--info > mat-icon { color: #2563eb; }
    .nudge__text { flex: 1 1 auto; min-width: 0; }
    .nudge__text a { font-weight: 700; color: inherit; margin-left: 4px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .chip { border: 1px solid #fdba74; background: #fff7ed; color: #9a3412; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 999px; cursor: pointer; min-height: 32px; }
    .chip:hover:not(:disabled), .chip:focus-visible { background: #ffedd5; }
    @media (max-width: 1024px) { :host { margin: 0 16px; } }
  `,
})
export class WalletNudges {
  readonly i18n = inject(LanguageService);
  private readonly walletService = inject(WalletService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  /** Day (IST) the low-balance banner was last shown — it appears at most once a day. */
  private readonly lowBalanceShownDay = signal<string | null>(null);
  private readonly lowBalanceThisVisit = signal(false);
  private readonly lowBalanceDismissed = signal(false);
  private readonly monthlySeen = signal<string | null>(null);
  private readonly catalogHidden = signal(false);
  savingBand = signal(false);

  private uid = computed(() => this.auth.user()?.uid ?? '');
  private wallet = this.walletService.wallet;

  bands = computed(() => this.wallet()?.catalog.bands ?? []);

  showLowBalance = computed(() => {
    const w = this.wallet();
    if (!w || !w.packs.enabled || w.balance.total > w.packs.lowBalanceThreshold || this.lowBalanceDismissed()) return false;
    return this.lowBalanceThisVisit() || this.lowBalanceShownDay() !== istDay();
  });

  lowBalanceText = computed(() => {
    const w = this.wallet()!;
    const n = w.balance.total;
    const price = w.packs.minPriceInr;
    const packs = price !== null ? this.i18n.t(` Packs from ₹${price}.`, ` Packs ₹${price} से शुरू।`) : '';
    return this.i18n.t(`Running low — ${n} coin${n === 1 ? '' : 's'} left.`, `Coins कम हैं — सिर्फ़ ${n} coins बचे हैं।`) + packs;
  });

  showCatalogPrompt = computed(() => {
    const w = this.wallet();
    return !!w && !w.catalog.band && !w.catalog.promptDismissed && !this.catalogHidden();
  });

  showMonthlySaved = computed(() => {
    const w = this.wallet();
    if (!w || w.lastMonthTimeSaved.hours < 0.5) return false;
    return this.monthlySeen() !== w.timeSaved.month;
  });

  monthlySavedText = computed(() => timeSavedText(this.i18n, this.wallet()!.lastMonthTimeSaved.hours, true));

  constructor() {
    effect(() => {
      const uid = this.uid();
      if (!uid) return;
      untracked(() => {
        this.lowBalanceShownDay.set(readFlag(`sa_low_balance_${uid}`));
        this.monthlySeen.set(readFlag(`sa_time_saved_${uid}`));
        void this.walletService.load();
      });
    });

    // Record the day the banner is first shown, so it stays for this visit but not the next one today.
    effect(() => {
      if (!this.showLowBalance() || this.lowBalanceThisVisit()) return;
      untracked(() => {
        this.lowBalanceThisVisit.set(true);
        writeFlag(`sa_low_balance_${this.uid()}`, istDay());
      });
    });

    effect(() => {
      if (!this.walletService.outOfCoins()) return;
      untracked(() => {
        this.walletService.outOfCoins.set(false);
        runInInjectionContext(this.injector, () => inject(MatDialog)).open(OutOfCoinsDialog, { width: '560px', maxWidth: '95vw', autoFocus: 'dialog' });
      });
    });
  }

  bandLabel(band: string): string {
    return CATALOG_BAND_LABELS[band] ?? band;
  }

  dismissLowBalance(): void {
    this.lowBalanceDismissed.set(true);
    writeFlag(`sa_low_balance_${this.uid()}`, istDay());
  }

  dismissMonthly(): void {
    const month = this.wallet()?.timeSaved.month ?? '';
    this.monthlySeen.set(month);
    writeFlag(`sa_time_saved_${this.uid()}`, month);
  }

  async chooseBand(band: string): Promise<void> {
    this.savingBand.set(true);
    try {
      await this.walletService.setCatalogSize(band);
    } finally {
      this.savingBand.set(false);
      this.catalogHidden.set(true);
    }
  }

  async dismissCatalog(): Promise<void> {
    this.catalogHidden.set(true);
    await this.walletService.dismissCatalogPrompt().catch(() => undefined);
  }
}
