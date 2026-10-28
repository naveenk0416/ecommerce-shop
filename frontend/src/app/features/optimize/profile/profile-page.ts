import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth';
import { LanguageService, SITE_LANGUAGES, SiteLanguage } from '../../../services/language';
import { AnalyticsService } from '../../../services/analytics';
import { WalletService } from '../../../services/wallet';
import { MarketplacePicker } from '../onboarding/marketplace-picker';
import { CATALOG_SIZE_BANDS, INDIAN_MOBILE_RE, INDIAN_STATES_AND_UTS, initialMarketplaces, normalizeIndianMobile } from '../../../config/signup-options';
import { BUSINESS } from '../../../config/site-config';
import { ApiError } from '../../../services/api';

/**
 * Profile: business details (name, mobile, state/city, product count, where you sell — saving them
 * completes "Tell us about your business +2"), listing defaults (brand, language), and account
 * actions (sign out, delete account, data request under the DPDP Act).
 */
@Component({
  selector: 'app-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarketplacePicker, RouterLink],
  template: `
    <section class="profile" [attr.lang]="i18n.lang()">
      <h2 class="profile__title">{{ t('Profile', 'Profile', 'Profile', 'Profile') }}</h2>
      @if (auth.profile(); as p) {
        <p class="profile__meta">{{ p.email }}</p>
      }

      <form class="profile__card" (submit)="$event.preventDefault(); save()" novalidate aria-labelledby="business-title" data-testid="my-marketplaces">
        <div class="profile__head">
          <h3 id="business-title" class="profile__h">{{ t('Your business', 'आपका business', 'మీ business', 'ನಿಮ್ಮ business') }}</h3>
          @if (auth.profile()?.businessCard; as card) {
            <span class="profile__task" [class.profile__task--done]="card.done" data-testid="business-task">
              {{ card.done ? t('+' + card.bonus + ' coins earned', '+' + card.bonus + ' coins मिले', '+' + card.bonus + ' coins వచ్చాయి', '+' + card.bonus + ' coins ಸಿಕ್ಕಿವೆ') : t('Fill state, product count and where you sell: +' + card.bonus + ' coins', 'State, products की संख्या और कहाँ बेचते हैं भरें: +' + card.bonus + ' coins', 'State, products సంఖ్య, ఎక్కడ అమ్ముతారో నింపండి: +' + card.bonus + ' coins', 'State, products ಸಂಖ್ಯೆ, ಎಲ್ಲಿ ಮಾರುತ್ತೀರಿ ತುಂಬಿ: +' + card.bonus + ' coins') }}
            </span>
          }
        </div>

        <div class="profile__grid">
          <label class="field">
            <span class="field__label">{{ t('Business name', 'Business का नाम', 'Business పేరు', 'Business ಹೆಸರು') }}</span>
            <input class="field__input" type="text" maxlength="120" autocomplete="organization" [value]="businessName()" (input)="businessName.set($any($event.target).value)" data-testid="profile-business-name" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('Mobile number', 'Mobile number', 'Mobile number', 'Mobile number') }}</span>
            <span class="field__phone">
              <span class="field__prefix">+91</span>
              <input class="field__input" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" [value]="phone()" (input)="phone.set($any($event.target).value)" data-testid="profile-phone" />
            </span>
          </label>
          <label class="field">
            <span class="field__label">{{ t('State', 'State', 'State', 'State') }}</span>
            <select class="field__input" [value]="state()" (change)="state.set($any($event.target).value)" data-testid="profile-state">
              <option value="">{{ t('Select your state', 'अपना state चुनें', 'మీ state ఎంచుకోండి', 'ನಿಮ್ಮ state ಆರಿಸಿ') }}</option>
              @for (s of states; track s) { <option [value]="s" [selected]="s === state()">{{ s }}</option> }
            </select>
          </label>
          <label class="field">
            <span class="field__label">{{ t('City', 'शहर', 'నగరం', 'ನಗರ') }}</span>
            <input class="field__input" type="text" maxlength="80" autocomplete="address-level2" [value]="city()" (input)="city.set($any($event.target).value)" data-testid="profile-city" />
          </label>
          <label class="field">
            <span class="field__label">{{ t('How many products do you sell?', 'आप कितने products बेचते हैं?', 'మీరు ఎన్ని products అమ్ముతారు?', 'ನೀವು ಎಷ್ಟು products ಮಾರುತ್ತೀರಿ?') }}</span>
            <select class="field__input" [value]="band()" (change)="band.set($any($event.target).value)" data-testid="profile-band">
              <option value="">—</option>
              @for (b of bands; track b.value) { <option [value]="b.value" [selected]="b.value === band()">{{ b.label }}</option> }
            </select>
          </label>
        </div>

        <app-marketplace-picker [(selected)]="selected" [(other)]="other" />

        <h3 class="profile__h profile__h--spaced">{{ t('Listing defaults', 'Listing defaults', 'Listing defaults', 'Listing defaults') }}</h3>
        <div class="profile__grid">
          <label class="field">
            <span class="field__label">{{ t('Default brand', 'Default brand', 'Default brand', 'Default brand') }}</span>
            <input class="field__input" type="text" maxlength="100" [value]="brand()" (input)="brand.set($any($event.target).value)" data-testid="profile-brand" />
            <span class="field__hint">{{ t('Used in every listing and bulk file, exactly as typed (e.g. "Pure Essentials").', 'हर listing और bulk file में बिल्कुल ऐसे ही लिखा जाएगा (जैसे "Pure Essentials")।', 'ప్రతి listing, bulk file లో ఇలాగే రాస్తాం (ఉదా. "Pure Essentials").', 'ಪ್ರತಿ listing, bulk file‌ನಲ್ಲಿ ಹೀಗೆಯೇ ಬರೆಯುತ್ತೇವೆ (ಉದಾ. "Pure Essentials").') }}</span>
          </label>
          <label class="field">
            <span class="field__label">{{ t('Preferred language', 'पसंदीदा भाषा', 'ఇష్టమైన భాష', 'ಆದ್ಯತೆಯ ಭಾಷೆ') }}</span>
            <select class="field__input" [value]="language()" (change)="language.set($any($event.target).value)" data-testid="profile-language">
              @for (l of languages; track l.code) { <option [value]="l.code" [selected]="l.code === language()" [attr.lang]="l.code">{{ l.label }}</option> }
            </select>
          </label>
        </div>

        @if (error()) { <p class="profile__err" role="alert">{{ error() }}</p> }
        <div class="profile__actions">
          @if (savedNote()) { <span class="profile__ok" role="status" data-testid="my-marketplaces-saved">{{ savedNote() }}</span> }
          <button type="submit" class="profile__btn" [disabled]="saving()" data-testid="my-marketplaces-save">{{ saving() ? t('Saving…', 'Save हो रहा है…') : t('Save', 'Save करें') }}</button>
        </div>
      </form>

      <section class="profile__card" aria-labelledby="account-title">
        <h3 id="account-title" class="profile__h">{{ t('Account', 'Account', 'Account', 'Account') }}</h3>
        <div class="profile__account">
          <button type="button" class="profile__btn profile__btn--ghost" (click)="signOut()" data-testid="profile-sign-out">{{ t('Sign out', 'Logout करें', 'Logout చేయండి', 'Logout ಮಾಡಿ') }}</button>
          <a routerLink="/settings" class="profile__link" data-testid="profile-delete-account">{{ t('Delete my account', 'मेरा account delete करें', 'నా account delete చేయండి', 'ನನ್ನ account delete ಮಾಡಿ') }}</a>
          <a [href]="dataRequestHref" class="profile__link" data-testid="profile-data-request">{{ t('Request a copy or deletion of my data (DPDP Act)', 'मेरे data की copy या deletion माँगें (DPDP Act)', 'నా data copy లేదా deletion కోరండి (DPDP Act)', 'ನನ್ನ data copy ಅಥವಾ deletion ಕೇಳಿ (DPDP Act)') }}</a>
        </div>
      </section>
    </section>
  `,
  styles: `
    :host { display: block; }
    .profile { max-width: 720px; display: flex; flex-direction: column; gap: 12px; }
    .profile__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
    .profile__meta { margin: -6px 0 0; font-size: 13px; color: #64748b; word-break: break-all; }
    .profile__card { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
    .profile__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .profile__h { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
    .profile__h--spaced { margin-top: 6px; }
    .profile__task { font-size: 12px; font-weight: 700; color: #9a3412; background: #fff7ed; border-radius: 999px; padding: 4px 10px; }
    .profile__task--done { color: #15803d; background: #f0fdf4; }
    .profile__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .field__label { font-size: 13px; font-weight: 800; color: #334155; }
    .field__input { width: 100%; height: 40px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 10px; background: #f8fafc; font-size: 16px; color: #0f172a; box-sizing: border-box; }
    .field__phone { display: flex; gap: 6px; }
    .field__prefix { display: inline-flex; align-items: center; padding: 0 10px; border-radius: 10px; background: #f1f5f9; font-weight: 700; color: #475569; }
    .field__hint { font-size: 12px; color: #64748b; }
    .profile__actions { display: flex; justify-content: flex-end; align-items: center; gap: 12px; flex-wrap: wrap; }
    .profile__btn { min-height: 40px; padding: 0 18px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #f97316, #dc2626); color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; }
    .profile__btn:disabled { opacity: 0.6; }
    .profile__btn--ghost { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }
    .profile__account { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
    .profile__link { font-size: 13px; font-weight: 700; color: #b91c1c; }
    .profile__ok { font-size: 13px; font-weight: 700; color: #15803d; }
    .profile__err { margin: 0; font-size: 13px; font-weight: 700; color: #b91c1c; }
    @media (max-width: 560px) { .profile__grid { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(LanguageService);
  private readonly analytics = inject(AnalyticsService);
  private readonly wallet = inject(WalletService);
  private readonly router = inject(Router);
  protected readonly t = (en: string, hi: string, te?: string, kn?: string) => this.i18n.t(en, hi, te, kn);
  protected readonly states = INDIAN_STATES_AND_UTS;
  protected readonly bands = CATALOG_SIZE_BANDS;
  protected readonly languages = SITE_LANGUAGES;
  protected readonly dataRequestHref = `mailto:${BUSINESS.supportEmail}?subject=${encodeURIComponent('Data request (DPDP Act)')}`;

  selected = signal<string[]>([]);
  other = signal('');
  businessName = signal('');
  phone = signal('');
  state = signal('');
  city = signal('');
  band = signal('');
  brand = signal('');
  language = signal<SiteLanguage>(this.i18n.lang());
  saving = signal(false);
  savedNote = signal<string | null>(null);
  error = signal<string | null>(null);
  private filled = false;

  constructor() {
    // Fill the form once the profile is in (it may still be loading on a hard refresh).
    effect(() => {
      const p = this.auth.profile();
      if (!p || this.filled) return;
      this.filled = true;
      untracked(() => {
        this.selected.set(initialMarketplaces(p));
        this.other.set(p.marketplacesOther ?? '');
        this.businessName.set(p.businessName ?? '');
        this.phone.set((p.phoneNumber ?? '').replace(/^\+91/, ''));
        this.state.set(p.state ?? '');
        this.city.set(p.city ?? '');
        this.band.set(p.catalogSizeBand ?? '');
        this.brand.set(p.defaultBrand ?? '');
        if (p.preferredLanguage) this.language.set(p.preferredLanguage);
      });
    });
  }

  async save(): Promise<void> {
    this.error.set(null);
    this.savedNote.set(null);
    const profile = this.auth.profile();
    const phone = normalizeIndianMobile(this.phone());
    if (phone && !INDIAN_MOBILE_RE.test(phone)) {
      this.error.set(this.t('Enter a valid 10-digit mobile number (starts with 6–9).', '10 अंकों का सही mobile number लिखें (6–9 से शुरू)।'));
      return;
    }
    this.saving.set(true);
    try {
      const phoneChanged = !!phone && `+91${phone}` !== profile?.phoneNumber;
      await this.auth.updateProfile({
        businessName: this.businessName().trim(),
        preferredLanguage: this.language(),
        defaultBrand: this.brand().replace(/\s+/g, ' ').trim(),
        ...(phoneChanged ? { phoneNumber: phone } : {}),
      });
      // "Where do you sell?" first (an empty answer is allowed), then state/city/product count —
      // the server credits "Tell us about your business" once all three are there.
      await this.auth.saveMarketplaces(this.selected(), this.other().trim());
      const result = await this.auth.saveBusinessDetails({ state: this.state(), city: this.city().trim(), catalogSizeBand: this.band() || undefined });
      const saved = this.auth.profile()?.marketplaces ?? [];
      if (saved.length) this.analytics.track('marketplaces_selected', { marketplaces: saved.join(',') });
      this.i18n.lang.set(this.language());
      void this.wallet.load();
      this.savedNote.set(result.bonusGranted
        ? this.t('Saved — coins added!', 'Save हो गया — coins जुड़ गए!', 'Save అయింది — coins జమ అయ్యాయి!', 'Save ಆಯಿತು — coins ಸೇರಿವೆ!')
        : result.bonusPending
          ? this.t('Saved — coins after you verify your email.', 'Save हो गया — email verify करने पर coins मिलेंगे।', 'Save అయింది — email verify చేశాక coins వస్తాయి.', 'Save ಆಯಿತು — email verify ಮಾಡಿದ ನಂತರ coins ಸಿಗುತ್ತವೆ.')
          : this.t('Saved', 'Save हो गया'));
    } catch (error) {
      const data = (error as ApiError).data as { code?: string } | undefined;
      this.error.set(data?.code === 'PHONE_TAKEN'
        ? this.t('This number is already registered. Login instead?', 'यह number पहले से registered है। Login करें?')
        : (error instanceof Error && error.message) || this.t('Could not save. Please try again.', 'Save नहीं हुआ। फिर से try करें।'));
    } finally {
      this.saving.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/home']);
  }
}
