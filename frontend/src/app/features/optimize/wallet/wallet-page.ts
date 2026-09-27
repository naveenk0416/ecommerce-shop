import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { AuthService } from '../../../services/auth';
import { MatIconModule } from '@angular/material/icon';
import { UiCard } from '../../listing-workspace/ui/card/card';
import { LanguageService } from '../../../services/language';
import { WalletService } from '../../../services/wallet';
import { CoinPacks, EarnCoinsCard } from './wallet-ui';

/** "SellAssist saved you about X hours this month" — English/Hindi. */
export function timeSavedText(i18n: LanguageService, hours: number, lastMonth = false): string {
  const h = hours % 1 === 0 ? String(hours) : hours.toFixed(1);
  const en = hours === 1 ? 'hour' : 'hours';
  // Hindi agrees in number: 'आपका 1 घंटा बचाया' / 'आपके 3 घंटे बचाए'.
  const hi = hours === 1 ? `आपका लगभग ${h} घंटा बचाया` : `आपके लगभग ${h} घंटे बचाए`;
  return lastMonth
    ? i18n.t(`Last month SellAssist saved you about ${h} ${en}`, `पिछले महीने SellAssist ने ${hi}`)
    : i18n.t(`SellAssist saved you about ${h} ${en} this month`, `इस महीने SellAssist ने ${hi}`);
}

/** Coins page: balance, free top-up date, time saved, ways to earn, packs, and history. */
@Component({
  selector: 'app-wallet-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatIconModule, UiCard, EarnCoinsCard, CoinPacks],
  template: `
    <div class="wallet">
      <div class="wallet__head">
        <h2 class="wallet__title">{{ i18n.t('Coins', 'Coins') }}</h2>
        <div class="lang" role="group" aria-label="Language / भाषा">
          <button type="button" [class.lang__on]="i18n.lang() === 'en'" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="i18n.lang.set('en')">English</button>
          <button type="button" [class.lang__on]="i18n.lang() === 'hi'" [attr.aria-pressed]="i18n.lang() === 'hi'" (click)="i18n.lang.set('hi')" lang="hi">हिंदी</button>
        </div>
      </div>

      @if (walletService.wallet(); as w) {
        <app-ui-card [elevated]="true">
          <div class="balance">
            <div class="balance__main">
              <span class="balance__label">{{ i18n.t('Your balance', 'आपका balance') }}</span>
              <span class="balance__value" data-testid="coin-balance">{{ w.balance.total }} <small>coins</small></span>
              <span class="balance__split">{{ i18n.t('Free', 'Free') }} {{ w.balance.free }} · {{ i18n.t('Bought', 'खरीदे') }} {{ w.balance.paid }}</span>
            </div>
            <ul class="balance__facts">
              <li><mat-icon aria-hidden="true">auto_awesome</mat-icon>{{ i18n.t('1 AI listing = ' + w.listingCost + ' coin', '1 AI listing = ' + w.listingCost + ' coin') }}</li>
              <li class="topup" data-testid="next-topup">
                <mat-icon aria-hidden="true">event</mat-icon>
                <span>
                  {{ nextTopUpText(w.monthlyTopUpTo, (w.nextTopUpAt | date: 'd MMM' : '+0530') ?? '') }}
                  <small class="topup__note">
                    <mat-icon aria-hidden="true" inline="true">info</mat-icon>
                    {{ i18n.t('Only if your free coins are below ' + w.monthlyTopUpTo + '.', 'सिर्फ़ तब, जब आपके free coins ' + w.monthlyTopUpTo + ' से कम हों।') }}
                  </small>
                </span>
              </li>
              <li><mat-icon aria-hidden="true">bolt</mat-icon>{{ i18n.t('"✨ Improve" and "Fill empty fields with AI" are free (fair use)', '"✨ Improve" और "Fill empty fields with AI" free हैं (fair use)') }}</li>
            </ul>
          </div>
          <!-- Hidden until there's something worth saying (at least half an hour). -->
          @if (w.timeSaved.hours >= 0.5) {
            <p class="time-saved" data-testid="time-saved">
              <mat-icon aria-hidden="true">schedule</mat-icon>
              {{ timeSaved(w.timeSaved.hours) }}
            </p>
          }
        </app-ui-card>

        <div class="wallet__grid">
          <app-ui-card>
            <app-earn-coins-card [wallet]="w" />
          </app-ui-card>
          <app-ui-card>
            <app-coin-packs [wallet]="w" />
          </app-ui-card>
        </div>

        <app-ui-card>
          <h3 class="history__title">{{ i18n.t('Coin history', 'Coin history') }}</h3>
          @if (w.ledger.length === 0) {
            <p class="history__empty">{{ i18n.t('No coin activity yet.', 'अभी कोई coin activity नहीं।') }}</p>
          } @else {
            <div class="history__scroll">
              <table class="history">
                <thead>
                  <tr>
                    <th scope="col">{{ i18n.t('Date', 'तारीख') }}</th>
                    <th scope="col">{{ i18n.t('What', 'विवरण') }}</th>
                    <th scope="col" class="num">{{ i18n.t('Coins', 'Coins') }}</th>
                    <th scope="col" class="num">{{ i18n.t('Balance', 'Balance') }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of w.ledger; track row.id) {
                    <tr>
                      <td class="nowrap">{{ row.createdAt | date: 'd MMM, h:mm a' : '+0530' }}</td>
                      <td>{{ typeLabel(row.type) }}<span class="history__reason">{{ row.type === 'monthly_topup' ? topUpDoneText(w.monthlyTopUpTo, (row.createdAt | date: 'd MMM' : '+0530') ?? '') : row.reason }}</span></td>
                      <td class="num" [class.plus]="row.amount > 0" [class.minus]="row.amount < 0">{{ row.amount > 0 ? '+' : '' }}{{ row.amount }}</td>
                      <td class="num">{{ row.balanceAfter ?? '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-ui-card>
      } @else {
        @if (walletService.loadError(); as error) {
          <div class="wallet__error" role="alert">
            <p>{{ error }}</p>
            <button type="button" (click)="retry()" [disabled]="walletService.loading()">{{ i18n.t('Try again', 'फिर से कोशिश करें') }}</button>
          </div>
        } @else {
          <p class="wallet__loading" role="status">{{ i18n.t('Loading your coins…', 'आपके coins load हो रहे हैं…') }}</p>
        }
      }
    </div>
  `,
  styles: `
    .wallet { display: flex; flex-direction: column; gap: 16px; }
    .wallet__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .wallet__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
    .wallet__loading { color: #64748b; }
    .wallet__error { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 14px; }
    .wallet__error p { margin: 0; flex: 1 1 240px; }
    .wallet__error button { border: 1px solid #fca5a5; background: #fff; color: #991b1b; font-weight: 700; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
    .wallet__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    .lang { display: inline-flex; border: 1px solid #e2e8f0; border-radius: 999px; overflow: hidden; background: #fff; }
    .lang button { border: 0; background: none; padding: 6px 14px; font-size: 13px; font-weight: 700; color: #475569; cursor: pointer; }
    .lang .lang__on { background: #0f172a; color: #fff; }
    .balance { display: flex; gap: 24px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
    .balance__main { display: flex; flex-direction: column; gap: 2px; }
    .balance__label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .balance__value { font-size: 40px; font-weight: 900; color: #ea580c; line-height: 1.1; }
    .balance__value small { font-size: 16px; font-weight: 700; color: #9a3412; }
    .balance__split { font-size: 13px; color: #475569; }
    .balance__facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #334155; }
    .balance__facts li { display: flex; align-items: center; gap: 8px; }
    .balance__facts mat-icon { font-size: 18px; width: 18px; height: 18px; color: #ea580c; flex-shrink: 0; }
    .topup { align-items: flex-start !important; }
    .topup > span { display: flex; flex-direction: column; gap: 2px; }
    .topup__note { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #64748b; }
    .topup__note mat-icon { font-size: 14px; width: 14px; height: 14px; color: #94a3b8; }
    .time-saved { margin: 16px 0 0; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #eff6ff; color: #1e3a8a; font-weight: 700; font-size: 14px; }
    .history__title { margin: 0 0 12px; font-size: 16px; font-weight: 800; color: #0f172a; }
    .history__empty { margin: 0; color: #64748b; font-size: 13px; }
    .history__scroll { overflow-x: auto; }
    .history { width: 100%; border-collapse: collapse; font-size: 13px; }
    .history th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 8px; border-bottom: 1px solid #e2e8f0; }
    .history td { padding: 8px; border-bottom: 1px solid #f1f5f9; color: #0f172a; vertical-align: top; }
    .history__reason { display: block; font-size: 12px; color: #64748b; }
    .num { text-align: right; white-space: nowrap; }
    .nowrap { white-space: nowrap; }
    .plus { color: #15803d; font-weight: 800; }
    .minus { color: #b91c1c; font-weight: 800; }
    @media (max-width: 900px) { .wallet__grid { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 480px) {
      .balance__value { font-size: 32px; }
      .history th:nth-child(4), .history td:nth-child(4) { display: none; }
    }
  `,
})
export class WalletPage {
  readonly i18n = inject(LanguageService);
  readonly walletService = inject(WalletService);

  private readonly auth = inject(AuthService);

  constructor() {
    // Load once the session is restored (a refresh on this page starts before sign-in is known).
    effect(() => {
      if (this.auth.user()) untracked(() => void this.walletService.load());
    });
  }

  retry(): void {
    void this.walletService.load();
  }

  /** "Next free top-up: up to 3 coins on 1 Oct" */
  nextTopUpText(target: number, date: string): string {
    return this.i18n.t(`Next free top-up: up to ${target} coins on ${date}`, `अगला free top-up: ${date} को ${target} coins तक`);
  }

  /** History line for a top-up that actually happened: "Topped up to 3 free coins on 1 Oct". */
  topUpDoneText(target: number, date: string): string {
    return this.i18n.t(`Topped up to ${target} free coins on ${date}`, `${date} को ${target} free coins तक top-up हुआ`);
  }

  timeSaved(hours: number): string {
    return timeSavedText(this.i18n, hours);
  }

  typeLabel(type: string): string {
    const labels: Record<string, [string, string]> = {
      welcome_bonus: ['Welcome bonus', 'स्वागत bonus'],
      monthly_topup: ['Monthly free coins', 'मासिक free coins'],
      earned_bonus: ['Bonus earned', 'Bonus मिला'],
      referral: ['Referral reward', 'Referral reward'],
      referral_reversal: ['Referral reversed', 'Referral वापस लिया गया'],
      spend: ['AI listing', 'AI listing'],
      refund: ['Refund', 'Refund'],
      purchase: ['Coins bought', 'Coins खरीदे'],
      admin_adjust: ['Adjustment', 'Adjustment'],
    };
    const label = labels[type] ?? [type, type];
    return this.i18n.t(label[0], label[1]);
  }
}
