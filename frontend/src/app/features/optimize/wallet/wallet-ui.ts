import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, inject, input, runInInjectionContext, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LanguageService } from '../../../services/language';
import { BonusId, CoinPack, WalletService, WalletSummary } from '../../../services/wallet';

/** English/Hindi labels for the earned bonuses. */
export function bonusLabel(i18n: LanguageService, id: BonusId): string {
  switch (id) {
    case 'welcome': return i18n.t('Welcome bonus (verify your email)', 'स्वागत bonus (email verify करें)');
    case 'mobile': return i18n.t('Add your mobile number', 'अपना mobile number जोड़ें');
    case 'firstInventorySave': return i18n.t('Save your first product to Inventory', 'पहला product Inventory में save करें');
    case 'firstPublish': return i18n.t('Publish your first product to Amazon or Flipkart', 'पहला product Amazon या Flipkart पर publish करें');
  }
}

/** "Earn more coins": each bonus with its coins and a tick when done, plus the referral link. */
@Component({
  selector: 'app-earn-coins-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <section class="earn" [attr.aria-label]="i18n.t('Earn more coins', 'और coins कमाएं')">
      <h3 class="earn__title">{{ i18n.t('Earn more coins', 'और coins कमाएं') }}</h3>
      <ul class="earn__list">
        @for (bonus of bonuses(); track bonus.id) {
          <li class="earn__item" [class.earn__item--done]="bonus.done">
            <mat-icon class="earn__tick" aria-hidden="true">{{ bonus.done ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <span class="earn__label">{{ label(bonus.id) }}</span>
            <span class="earn__coins">+{{ bonus.coins }}</span>
            <span class="sr-only">{{ bonus.done ? i18n.t('Done', 'पूरा हुआ') : i18n.t('Not done yet', 'अभी बाकी') }}</span>
          </li>
        }
      </ul>

      @if (wallet().referral.link; as link) {
        <div class="earn__referral">
          <p class="earn__referral-title">
            {{ i18n.t('Invite a seller: you both get +' + wallet().referral.reward + ' coins when they verify their email and create their first AI listing.',
                      'किसी seller को invite करें: जब वे email verify करके पहली AI listing बनाएंगे, तो आप दोनों को +' + wallet().referral.reward + ' coins मिलेंगे।') }}
          </p>
          <div class="earn__link-row">
            <label class="sr-only" for="referral-link">{{ i18n.t('Your referral link', 'आपका referral link') }}</label>
            <input id="referral-link" class="earn__link" [value]="link" readonly (focus)="$any($event.target).select()" />
            <button mat-stroked-button type="button" (click)="copy(link)">
              <mat-icon aria-hidden="true">{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
              {{ copied() ? i18n.t('Copied', 'Copy हो गया') : i18n.t('Copy', 'Copy करें') }}
            </button>
            <a mat-flat-button class="earn__whatsapp" [href]="whatsappUrl()" target="_blank" rel="noopener">
              <mat-icon aria-hidden="true">share</mat-icon>
              {{ i18n.t('Share on WhatsApp', 'WhatsApp पर share करें') }}
            </a>
          </div>
          <p class="earn__hint">
            {{ i18n.t(wallet().referral.rewardedThisMonth + ' of ' + wallet().referral.maxPerMonth + ' referral rewards used this month.',
                      'इस महीने ' + wallet().referral.maxPerMonth + ' में से ' + wallet().referral.rewardedThisMonth + ' referral rewards मिल चुके हैं।') }}
          </p>
        </div>
      }
    </section>
  `,
  styles: `
    .earn { display: flex; flex-direction: column; gap: 12px; }
    .earn__title { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
    .earn__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .earn__item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #f1f5f9; border-radius: 12px; font-size: 14px; color: #0f172a; }
    .earn__item--done { background: #f0fdf4; border-color: #bbf7d0; }
    .earn__item--done .earn__label { color: #475569; }
    .earn__tick { color: #cbd5e1; flex-shrink: 0; }
    .earn__item--done .earn__tick { color: #16a34a; }
    .earn__label { flex: 1 1 auto; min-width: 0; }
    .earn__coins { flex-shrink: 0; font-weight: 800; color: #c2410c; background: #fff7ed; border-radius: 999px; padding: 2px 10px; font-size: 13px; }
    .earn__referral { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; background: #fff7ed; border: 1px solid #fed7aa; }
    .earn__referral-title { margin: 0; font-size: 13px; color: #7c2d12; font-weight: 600; }
    .earn__link-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .earn__link { flex: 1 1 200px; min-width: 0; height: 36px; padding: 0 10px; border: 1px solid #fdba74; border-radius: 8px; background: #fff; font-size: 13px; color: #0f172a; }
    .earn__whatsapp { background: #16a34a !important; color: #fff !important; }
    .earn__hint { margin: 0; font-size: 12px; color: #9a3412; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `,
})
export class EarnCoinsCard {
  readonly i18n = inject(LanguageService);
  wallet = input.required<WalletSummary>();
  /** Out-of-coins screen: only the bonuses still to earn. */
  pendingOnly = input(false);

  copied = signal(false);

  bonuses = computed(() => this.wallet().bonuses.filter((b) => !this.pendingOnly() || !b.done));

  whatsappUrl = computed(() => {
    const link = this.wallet().referral.link ?? '';
    const reward = this.wallet().referral.reward;
    const text = this.i18n.t(
      `I create Amazon, Flipkart and Meesho listings from one product photo with SellAssist. Sign up with my link and we both get ${reward} free coins: ${link}`,
      `SellAssist से एक product photo से Amazon, Flipkart और Meesho की listing बन जाती है। मेरे link से sign up करें — हम दोनों को ${reward} free coins मिलेंगे: ${link}`,
    );
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  });

  label(id: BonusId): string {
    return bonusLabel(this.i18n, id);
  }

  async copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard blocked — the field is selectable instead.
    }
  }
}

/**
 * Coin packs (only when the backend has COIN_PACKS_ENABLED): the ₹49 starter offer first with its
 * 48-hour countdown, festive packs while they run, then the regular packs. With packs off, a
 * "Notify me when coin packs launch" button (clicks are recorded) — no buy buttons at all.
 */
@Component({
  selector: 'app-coin-packs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule],
  template: `
    @if (wallet().packs.enabled) {
      <section class="packs" [attr.aria-label]="i18n.t('Coin packs', 'Coin packs')">
        <h3 class="packs__title">{{ i18n.t('Buy coins', 'Coins खरीदें') }}</h3>
        @if (wallet().packs.starter; as starter) {
          <div class="pack pack--starter">
            <div class="pack__info">
              <span class="pack__badge">{{ i18n.t('First-purchase offer', 'पहली खरीद का offer') }}</span>
              <span class="pack__name">{{ starter.coins }} coins · ₹{{ starter.priceInr }}</span>
              <span class="pack__timer" role="timer">{{ i18n.t('Ends in', 'खत्म होने में') }} {{ countdown(starter.expiresAt!) }}</span>
            </div>
            <button mat-flat-button color="primary" [disabled]="buying() !== null" (click)="buy(starter)">
              {{ buying() === starter.id ? i18n.t('Opening…', 'खुल रहा है…') : i18n.t('Buy for ₹' + starter.priceInr, '₹' + starter.priceInr + ' में खरीदें') }}
            </button>
          </div>
        }
        @for (pack of otherPacks(); track pack.id) {
          <div class="pack" [class.pack--festive]="!!pack.endsAt">
            <div class="pack__info">
              @if (pack.endsAt) {
                <span class="pack__badge pack__badge--festive">{{ pack.name }}</span>
              }
              <span class="pack__name">{{ pack.coins }} coins · ₹{{ pack.priceInr }}</span>
              @if (pack.endsAt) {
                <span class="pack__timer">{{ i18n.t('Until', 'तक') }} {{ pack.endsAt | date: 'd MMM' : '+0530' }}</span>
              }
            </div>
            <button mat-stroked-button [disabled]="buying() !== null" (click)="buy(pack)">
              {{ buying() === pack.id ? i18n.t('Opening…', 'खुल रहा है…') : i18n.t('Buy', 'खरीदें') }}
            </button>
          </div>
        }
        @if (message(); as m) {
          <p class="packs__message" [class.packs__message--error]="!m.ok" role="status">{{ m.text }}</p>
        }
      </section>
    } @else {
      <section class="packs packs--soon">
        <p class="packs__soon-text">{{ i18n.t('Coin packs are coming soon. Until then you get free coins every month and can earn more.', 'Coin packs जल्द आ रहे हैं। तब तक हर महीने free coins मिलते हैं और आप और coins कमा सकते हैं।') }}</p>
        @if (wallet().notifyRequested) {
          <p class="packs__message" role="status"><mat-icon aria-hidden="true" inline="true">check_circle</mat-icon> {{ i18n.t('Thanks — we\\'ll let you know when packs launch.', 'धन्यवाद — packs आने पर हम आपको बताएंगे।') }}</p>
        } @else {
          <button mat-stroked-button type="button" [disabled]="notifying()" (click)="notify()">
            <mat-icon aria-hidden="true">notifications</mat-icon>
            {{ i18n.t('Notify me when coin packs launch', 'Coin packs आने पर मुझे बताएं') }}
          </button>
        }
      </section>
    }
  `,
  styles: `
    .packs { display: flex; flex-direction: column; gap: 8px; }
    .packs__title { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
    .pack { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
    .pack--starter { border-color: #fb923c; background: #fff7ed; }
    .pack--festive { border-color: #facc15; background: #fefce8; }
    .pack__info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .pack__badge { align-self: flex-start; font-size: 11px; font-weight: 800; color: #c2410c; text-transform: uppercase; letter-spacing: 0.04em; }
    .pack__badge--festive { color: #a16207; }
    .pack__name { font-size: 15px; font-weight: 800; color: #0f172a; }
    .pack__timer { font-size: 12px; color: #9a3412; font-variant-numeric: tabular-nums; }
    .packs__message { margin: 0; font-size: 13px; color: #15803d; }
    .packs__message--error { color: #b91c1c; }
    .packs--soon { padding: 12px; border-radius: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; align-items: flex-start; }
    .packs__soon-text { margin: 0; font-size: 13px; color: #475569; }
  `,
})
export class CoinPacks {
  readonly i18n = inject(LanguageService);
  private readonly walletService = inject(WalletService);
  private readonly injector = inject(Injector);
  wallet = input.required<WalletSummary>();

  buying = signal<string | null>(null);
  notifying = signal(false);
  message = signal<{ ok: boolean; text: string } | null>(null);
  private readonly now = signal(Date.now());

  otherPacks = computed(() => [...this.wallet().packs.festive, ...this.wallet().packs.regular]);

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  countdown(expiresAt: string): string {
    const ms = Math.max(0, new Date(expiresAt).getTime() - this.now());
    const hours = Math.floor(ms / 3600e3);
    const minutes = Math.floor((ms % 3600e3) / 60e3);
    const seconds = Math.floor((ms % 60e3) / 1000);
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  async buy(pack: CoinPack): Promise<void> {
    this.buying.set(pack.id);
    this.message.set(null);
    try {
      const paid = await this.walletService.buyPack(pack.id);
      if (paid) {
        const text = this.i18n.t(`Payment received — ${pack.coins} coins added.`, `Payment मिल गया — ${pack.coins} coins जुड़ गए।`);
        this.message.set({ ok: true, text });
        runInInjectionContext(this.injector, () => inject(MatSnackBar)).open(text, 'OK', { duration: 4000 });
      }
    } catch (error) {
      this.message.set({ ok: false, text: (error instanceof Error && error.message) || this.i18n.t('Payment failed. Please try again.', 'Payment नहीं हो पाया। फिर से कोशिश करें।') });
      await this.walletService.load();
    } finally {
      this.buying.set(null);
    }
  }

  async notify(): Promise<void> {
    this.notifying.set(true);
    try {
      await this.walletService.notifyMe();
    } catch {
      this.message.set({ ok: false, text: this.i18n.t('Could not save that. Please try again.', 'Save नहीं हो पाया। फिर से कोशिश करें।') });
    } finally {
      this.notifying.set(false);
    }
  }
}

