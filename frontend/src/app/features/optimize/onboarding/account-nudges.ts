import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../services/auth';
import { WalletService } from '../../../services/wallet';
import { LanguageService } from '../../../services/language';
import { AnalyticsService } from '../../../services/analytics';
import { ApiError } from '../../../services/api';
import { CATALOG_SIZE_BANDS, GSTIN_RE, INDIAN_STATES_AND_UTS, SELLING_CHANNELS } from '../../../config/signup-options';

/**
 * Two small, dismissible prompts after sign-up — neither blocks anything:
 * - "Verify your email to get 7 more free listings" with "Resend email";
 * - "Tell us about your business (+2 coins)": state, city, product count, where you sell, GST.
 */
@Component({
  selector: 'app-account-nudges',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-nudges.html',
  styleUrl: './account-nudges.css',
})
export class AccountNudges implements OnDestroy {
  protected readonly i18n = inject(LanguageService);
  protected readonly auth = inject(AuthService);
  private readonly walletService = inject(WalletService);
  private readonly analytics = inject(AnalyticsService);
  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);

  readonly states = INDIAN_STATES_AND_UTS;
  readonly bands = CATALOG_SIZE_BANDS;
  readonly channels = SELLING_CHANNELS;

  // ---- Verify email ----
  showVerify = computed(() => this.auth.profile()?.emailVerified === false);
  pendingWelcome = computed(() => this.walletService.wallet()?.pendingWelcome ?? 0);
  resendState = signal<'idle' | 'sending' | 'sent' | 'error'>('idle');
  resendMessage = signal<string | null>(null);
  cooldown = signal(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  verifyText = computed(() => {
    const n = this.pendingWelcome();
    return n > 0
      ? this.t(`Verify your email to get ${n} more free listings`, `${n} और free listings पाने के लिए अपना email verify करें`)
      : this.t('Verify your email to unlock bonus coins and referral rewards', 'Bonus coins और referral rewards के लिए अपना email verify करें');
  });

  async resend(): Promise<void> {
    const email = this.auth.profile()?.email;
    if (!email || this.cooldown() > 0 || this.resendState() === 'sending') return;
    this.resendState.set('sending');
    this.resendMessage.set(null);
    try {
      await this.auth.resendVerification(email);
      this.resendState.set('sent');
      this.startCooldown(60);
    } catch (error) {
      const apiError = error as ApiError;
      const retryAfter = Number((apiError.data as { retryAfter?: number } | undefined)?.retryAfter);
      if (apiError.status === 429) this.startCooldown(retryAfter > 0 ? retryAfter : 60);
      this.resendState.set('error');
      this.resendMessage.set(apiError.status === 429
        ? this.t('Please wait a minute before sending another email.', 'दूसरा email भेजने से पहले एक मिनट रुकें।')
        : this.t('We couldn’t send the email right now. Please try again shortly.', 'अभी email नहीं भेज पाए। थोड़ी देर में फिर try करें।'));
    }
  }

  private startCooldown(seconds: number): void {
    this.cooldown.set(Math.ceil(seconds));
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const next = this.cooldown() - 1;
      this.cooldown.set(Math.max(0, next));
      if (next <= 0 && this.cooldownTimer) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
      }
    }, 1000);
  }

  constructor() {
    // The Resend button waits 60s after the last verification email (the server enforces it too).
    effect(() => {
      const sentAt = this.auth.profile()?.verificationEmailSentAt;
      if (!sentAt) return;
      const wait = Math.ceil((new Date(sentAt).getTime() + 60_000 - Date.now()) / 1000);
      if (wait > 0) untracked(() => this.startCooldown(wait));
    });
  }

  // ---- Business details ----
  private readonly hidden = signal(false);
  showBusiness = computed(() => !!this.auth.profile()?.businessCard?.show && !this.hidden());
  bonus = computed(() => this.auth.profile()?.businessCard?.bonus ?? 2);
  open = signal(false);
  state = signal('');
  city = signal('');
  band = signal('');
  sellsOn = signal<string[]>([]);
  gst = signal('');
  saving = signal(false);
  saveError = signal<string | null>(null);
  saved = signal<string | null>(null);

  gstError = computed(() => {
    const value = this.gst().trim().toUpperCase();
    return !value || GSTIN_RE.test(value) ? '' : this.t('Enter a valid 15-character GSTIN, or leave it blank.', 'सही 15-character GSTIN लिखें, या खाली छोड़ दें।');
  });

  expand(): void {
    const p = this.auth.profile();
    this.state.set(p?.state ?? '');
    this.city.set(p?.city ?? '');
    this.band.set(p?.catalogSizeBand ?? '');
    this.sellsOn.set(p?.sellsOn ?? []);
    this.gst.set(p?.gstNumber ?? '');
    this.open.set(true);
  }

  toggleChannel(channel: string, on: boolean): void {
    this.sellsOn.update((list) => (on ? [...new Set([...list, channel])] : list.filter((c) => c !== channel)));
  }

  async save(): Promise<void> {
    if (this.gstError()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const result = await this.auth.saveBusinessDetails({
        state: this.state(),
        city: this.city().trim(),
        catalogSizeBand: this.band(),
        sellsOn: this.sellsOn(),
        gstNumber: this.gst().trim().toUpperCase(),
      });
      void this.walletService.load();
      if (result.complete) this.analytics.track('onboarding_details_added');
      this.saved.set(result.bonusGranted
        ? this.t(`Saved — +${this.bonus()} coins added!`, `Save हो गया — +${this.bonus()} coins मिले!`)
        : result.bonusPending
          ? this.t(`Saved — +${this.bonus()} coins after you verify your email.`, `Save हो गया — email verify करने पर +${this.bonus()} coins मिलेंगे।`)
          : result.complete
            ? this.t('Saved — thank you!', 'Save हो गया — धन्यवाद!')
            : this.t(`Saved. Add state, product count and where you sell to get +${this.bonus()} coins.`, `Save हो गया। +${this.bonus()} coins के लिए state, products की संख्या और आप कहाँ बेचते हैं — ये भरें।`));
      this.open.set(false);
    } catch (error) {
      this.saveError.set(error instanceof Error && this.i18n.lang() === 'en' ? error.message : this.t('Could not save. Please try again.', 'Save नहीं हुआ। फिर से try करें।'));
    } finally {
      this.saving.set(false);
    }
  }

  async dismiss(): Promise<void> {
    this.hidden.set(true);
    await this.auth.dismissBusinessCard().catch(() => undefined);
  }

  ngOnDestroy(): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }
}
