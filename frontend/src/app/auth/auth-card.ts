import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth';
import { AnalyticsService } from '../services/analytics';
import { LanguageService } from '../services/language';
import { GuestListingService } from '../services/guest-listing';
import { WalletService } from '../services/wallet';
import { ApiError } from '../services/api';
import { INDIAN_MOBILE_RE, normalizeIndianMobile } from '../config/signup-options';
import { GOOGLE_CLIENT_ID } from '../config/site-config';
import { DASHBOARD_PATH, safeReturnUrl } from '../guards/auth.guard';

type Mode = 'signup' | 'login';

interface GoogleId {
  initialize(options: Record<string, unknown>): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}

/** Kept in sync with the backend's STRONG_PASSWORD_RE in auth.ts. */
const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let gisScript: Promise<void> | null = null;
function loadGoogleIdentity(): Promise<void> {
  gisScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScript = null;
      reject(new Error('Google sign-in could not load.'));
    };
    document.head.appendChild(script);
  });
  return gisScript;
}

/**
 * Short, one-screen sign-up (name, mobile, email, password, terms) and login, in English or
 * Hindi (follows the site language). "Continue with Google" on top; a new Google account is asked
 * only for mobile + terms. After sign-up the seller lands on the photo upload screen (or on the
 * listing they made as a guest on the landing page).
 */
@Component({
  selector: 'app-auth-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './auth-card.html',
  styleUrl: './auth-card.css',
})
export class AuthCard implements AfterViewInit {
  readonly mode = input<Mode>('signup');

  protected readonly i18n = inject(LanguageService);
  private readonly auth = inject(AuthService);
  private readonly analytics = inject(AnalyticsService);
  private readonly guest = inject(GuestListingService);
  private readonly wallet = inject(WalletService);
  private readonly router = inject(Router);

  private readonly googleSlot = viewChild<ElementRef<HTMLElement>>('googleSlot');
  protected readonly googleEnabled = !!GOOGLE_CLIENT_ID;
  protected readonly googleLoading = signal(false);
  /** Set after Google sign-in for a new account: only mobile + terms are asked. */
  protected readonly googlePending = signal<{ pendingToken: string; email: string; name: string } | null>(null);
  protected readonly guestPending = signal(false);

  name = signal('');
  phone = signal('');
  whatsapp = signal(true);
  email = signal('');
  password = signal('');
  showPassword = signal(false);
  terms = signal(false);
  rememberMe = signal(true);

  touched = signal<Record<string, boolean>>({});
  submitted = signal(false);
  busy = signal(false);
  formError = signal<string | null>(null);
  phoneTaken = signal(false);
  emailTaken = signal(false);
  /** Server-side email check (typo / disposable / no MX), shown under the email field. */
  emailServer = signal<{ error: string; suggestion?: string } | null>(null);
  private started = false;

  protected readonly t = (en: string, hi: string) => this.i18n.t(en, hi);

  nameError = computed(() => (this.name().trim().length < 2 ? this.t('Enter your full name.', 'अपना पूरा नाम लिखें।') : ''));
  phoneError = computed(() => {
    const digits = normalizeIndianMobile(this.phone());
    if (!digits) return this.t('Enter your mobile number.', 'अपना mobile number लिखें।');
    return INDIAN_MOBILE_RE.test(digits) ? '' : this.t('Enter a valid 10-digit mobile number (starts with 6–9).', '10 अंकों का सही mobile number लिखें (6–9 से शुरू)।');
  });
  emailError = computed(() => {
    const value = this.email().trim();
    if (!value) return this.t('Enter your email address.', 'अपना email address लिखें।');
    return EMAIL_RE.test(value) ? '' : this.t('Enter a valid email address.', 'सही email address लिखें।');
  });
  passwordError = computed(() => {
    if (this.mode() === 'login') return this.password() ? '' : this.t('Enter your password.', 'अपना password लिखें।');
    return STRONG_PASSWORD_RE.test(this.password())
      ? ''
      : this.t('At least 8 characters, with A–Z, a–z, a number and a symbol.', 'कम से कम 8 characters: A–Z, a–z, एक number और एक symbol।');
  });
  termsError = computed(() => (this.terms() ? '' : this.t('Please agree to the Terms and Privacy Policy.', 'Terms और Privacy Policy से सहमत हों।')));

  /** Errors appear after the field is left (blur) or on submit — never while typing. */
  show(field: string): boolean {
    return this.submitted() || !!this.touched()[field];
  }

  constructor() {
    this.guestPending.set(this.guest.hasPendingListing());
    effect(() => {
      if (this.mode() === 'signup') this.analytics.track('signup_view');
    });
    // Re-draw the Google button when the language changes.
    effect(() => {
      this.i18n.lang();
      this.mode();
      if (!this.googlePending()) queueMicrotask(() => this.renderGoogle());
    });
  }

  ngAfterViewInit(): void {
    this.renderGoogle();
  }

  blur(field: string): void {
    this.touched.update((t) => ({ ...t, [field]: true }));
    if (field === 'email' && this.mode() === 'signup' && !this.emailError()) void this.checkEmailOnServer();
  }

  /** sign_up_start: the first time any field is focused. */
  focusField(): void {
    if (this.started || this.mode() !== 'signup') return;
    this.started = true;
    this.analytics.track('sign_up_start');
  }

  private async checkEmailOnServer(): Promise<void> {
    const email = this.email().trim();
    try {
      const result = await this.auth.checkEmail(email);
      if (this.email().trim() !== email) return;
      this.emailServer.set(result.ok ? null : { error: this.emailCheckMessage(result.code, result.suggestion), suggestion: result.suggestion });
    } catch {
      this.emailServer.set(null); // The server re-checks on submit anyway.
    }
  }

  private emailCheckMessage(code?: string, suggestion?: string): string {
    switch (code) {
      case 'EMAIL_TYPO': {
        const domain = suggestion?.split('@')[1] ?? '';
        return this.t(`Did you mean ${domain}?`, `क्या आपका मतलब ${domain} है?`);
      }
      case 'DISPOSABLE_EMAIL':
        return this.t('Please use your real email address.', 'कृपया अपना असली email address डालें।');
      case 'EMAIL_DOMAIN_INVALID':
        return this.t('This email address can’t receive mail. Please check it.', 'इस email पर mail नहीं जा सकता — कृपया check करें।');
      default:
        return this.t('Enter a valid email address.', 'सही email address लिखें।');
    }
  }

  useSuggestion(): void {
    const suggestion = this.emailServer()?.suggestion;
    if (!suggestion) return;
    this.email.set(suggestion);
    this.emailServer.set(null);
  }

  setEmail(value: string): void {
    this.email.set(value);
    this.emailServer.set(null);
    this.emailTaken.set(false);
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.formError.set(null);
    this.phoneTaken.set(false);
    this.emailTaken.set(false);
    if (this.googlePending()) return this.completeGoogle();
    if (this.mode() === 'login') return this.login();

    this.analytics.track('signup_submit');
    if (this.nameError() || this.phoneError() || this.emailError() || this.passwordError() || this.termsError() || this.emailServer()) return;

    this.busy.set(true);
    try {
      await this.auth.registerWithEmail(this.email().trim(), this.password(), {
        displayName: this.name().trim(),
        phoneNumber: normalizeIndianMobile(this.phone()),
        whatsappOptIn: this.whatsapp(),
        termsAccepted: this.terms(),
        attribution: this.analytics.getAttribution(),
      });
      this.analytics.trackSignUp('email');
      await this.afterSignIn(true);
    } catch (error) {
      this.showServerError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private async login(): Promise<void> {
    if (this.emailError() || this.passwordError()) return;
    this.busy.set(true);
    try {
      await this.auth.loginWithEmail(this.email().trim(), this.password(), this.rememberMe());
      await this.afterSignIn(false);
    } catch (error) {
      const status = (error as ApiError).status;
      this.formError.set(status === 429
        ? this.t('Too many attempts. Please wait 15 minutes and try again.', 'बहुत बार try किया गया। 15 मिनट बाद फिर try करें।')
        : status === 401
          ? this.t('Incorrect email or password.', 'Email या password गलत है।')
          : this.fallbackMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private showServerError(error: unknown): void {
    const apiError = error as ApiError & { code?: string };
    const data = apiError.data as { code?: string; suggestion?: string } | undefined;
    const code = apiError.code || data?.code;
    if (code === 'auth/phone-already-in-use' || code === 'PHONE_TAKEN') {
      this.phoneTaken.set(true);
      this.formError.set(this.t('This number is already registered. Login instead?', 'यह number पहले से registered है। Login करें?'));
    } else if (code === 'auth/email-already-in-use') {
      this.emailTaken.set(true);
      this.formError.set(this.t('This email is already registered. Login instead?', 'यह email पहले से registered है। Login करें?'));
    } else if (code === 'EMAIL_TYPO' || code === 'DISPOSABLE_EMAIL' || code === 'EMAIL_DOMAIN_INVALID' || code === 'INVALID_EMAIL') {
      this.emailServer.set({ error: this.emailCheckMessage(code, data?.suggestion), suggestion: data?.suggestion });
    } else if (code === 'auth/too-many-requests') {
      this.formError.set(this.t('Too many sign-ups from this network. Please try again later.', 'इस network से बहुत sign-ups हुए हैं। थोड़ी देर बाद try करें।'));
    } else if (code === 'INVALID_PHONE') {
      this.touched.update((t) => ({ ...t, phone: true }));
      this.formError.set(this.phoneError() || this.t('Enter a valid 10-digit mobile number (starts with 6–9).', '10 अंकों का सही mobile number लिखें (6–9 से शुरू)।'));
    } else {
      this.formError.set(this.fallbackMessage(error));
    }
  }

  private fallbackMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (this.i18n.lang() === 'en' && /\s/.test(message) && message.length < 200 && !/fetch/i.test(message)) return message;
    return this.t('Something went wrong. Please try again.', 'कुछ गड़बड़ हो गई। कृपया फिर से try करें।');
  }

  /** Attaches a guest listing (if any), then opens it — or the photo upload screen for new sellers. */
  private async afterSignIn(isNew: boolean): Promise<void> {
    void this.wallet.load();
    const draftId = await this.guest.claimPending();
    if (draftId) {
      await this.router.navigate(['/optimize/general'], { queryParams: { id: draftId } });
      return;
    }
    if (isNew) {
      await this.router.navigate(['/optimize/general'], { queryParams: { welcome: 1 } });
      return;
    }
    const returnUrl = safeReturnUrl(this.router.parseUrl(this.router.url).queryParamMap.get('returnUrl'));
    await this.router.navigateByUrl(returnUrl ?? DASHBOARD_PATH);
  }

  // ---- Google ----

  private async renderGoogle(): Promise<void> {
    const slot = this.googleSlot()?.nativeElement;
    if (!this.googleEnabled || !slot) return;
    try {
      await loadGoogleIdentity();
      const google = (window as unknown as { google?: { accounts?: { id?: GoogleId } } }).google?.accounts?.id;
      if (!google) return;
      google.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r: { credential?: string }) => this.onGoogleCredential(r.credential), ux_mode: 'popup' });
      slot.innerHTML = '';
      google.renderButton(slot, {
        theme: 'outline', size: 'large', shape: 'pill', logo_alignment: 'center',
        text: this.mode() === 'login' ? 'signin_with' : 'continue_with',
        width: Math.min(slot.clientWidth || 320, 400),
        locale: this.i18n.lang() === 'hi' ? 'hi' : 'en',
      });
    } catch (error) {
      console.warn('Google sign-in unavailable', error);
    }
  }

  private async onGoogleCredential(credential?: string): Promise<void> {
    if (!credential) return;
    this.formError.set(null);
    this.googleLoading.set(true);
    try {
      const result = await this.auth.signInWithGoogle(credential);
      if (result.signedIn) {
        await this.afterSignIn(false);
      } else {
        this.analytics.track('sign_up_start');
        this.googlePending.set(result);
        this.submitted.set(false);
      }
    } catch (error) {
      this.formError.set(this.t('Google sign-in failed. Please try again.', 'Google से login नहीं हो पाया। फिर से try करें।'));
      console.error('Google sign-in failed', error);
    } finally {
      this.googleLoading.set(false);
    }
  }

  private async completeGoogle(): Promise<void> {
    const pending = this.googlePending();
    if (!pending || this.phoneError() || this.termsError()) return;
    this.analytics.track('signup_submit');
    this.busy.set(true);
    try {
      await this.auth.completeGoogleSignup({
        pendingToken: pending.pendingToken,
        phoneNumber: normalizeIndianMobile(this.phone()),
        termsAccepted: this.terms(),
        whatsappOptIn: this.whatsapp(),
        attribution: this.analytics.getAttribution(),
      });
      this.analytics.trackSignUp('google');
      await this.afterSignIn(true);
    } catch (error) {
      const status = (error as ApiError).status;
      if (status === 401) {
        this.googlePending.set(null);
        this.formError.set(this.t('Your Google sign-in expired. Please try again.', 'Google sign-in expire हो गया। फिर से try करें।'));
      } else {
        this.showServerError(error);
      }
    } finally {
      this.busy.set(false);
    }
  }

  cancelGoogle(): void {
    this.googlePending.set(null);
    this.formError.set(null);
    queueMicrotask(() => this.renderGoogle());
  }
}
