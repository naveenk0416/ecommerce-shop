import { Injectable, signal, inject, PLATFORM_ID, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { apiFetch, ApiError, clearAuthToken, getAuthToken, setAuthToken } from './api';
import type { Attribution } from './analytics';

export type UserRole = 'FREE' | 'PAID_PRO' | 'ADMIN';

export interface UserProfile extends AdditionalUserData {
  uid: string;
  email: string | null;
  role: UserRole;
  usageCount: number;
  lastLogin: string;
  dailyStats?: {
    date: string;
    count: number;
  };
  /** Explicit WhatsApp updates/alerts consent (sent when adding a phone number later). */
  whatsapp_opt_in?: boolean;
  emailVerified?: boolean;
  verificationEmailSentAt?: string | null;
  signupMethod?: 'email' | 'google' | null;
  /** "Tell us about your business (+2 coins)" card after sign-up. */
  businessCard?: { show: boolean; done: boolean; bonus: number };
  /** "Where do you sell?" (MARKETPLACE_OPTIONS values) — null until answered. */
  marketplaces?: string[] | null;
  marketplacesOther?: string | null;
  /** One-time dashboard card for accounts that never answered or dismissed the question. */
  marketplacesCard?: { show: boolean };
}

/** /register response: the new seller is signed in straight away (email verified later).
 * emailSent is false when the verification email couldn't be delivered. */
export interface RegisterResult {
  token: string;
  email: string;
  emailSent?: boolean;
  emailError?: string;
}

/** Server-side email check on blur: typo suggestion, disposable domain, domain without MX. */
export interface EmailCheckResult {
  ok: boolean;
  code?: 'INVALID_EMAIL' | 'DISPOSABLE_EMAIL' | 'EMAIL_DOMAIN_INVALID' | 'EMAIL_TYPO';
  error?: string;
  suggestion?: string;
}

/** Google sign-in step 1: signed in, or a new account that still needs mobile + terms. */
export type GoogleSignInResult =
  | { signedIn: true }
  | { signedIn: false; pendingToken: string; email: string; name: string };

export interface BusinessDetails {
  state?: string;
  city?: string;
  catalogSizeBand?: string;
  sellsOn?: string[];
  /** Sent only when something is selected — skipping keeps any earlier answer. */
  marketplaces?: string[];
  marketplacesOther?: string;
  gstNumber?: string;
}

export interface AdditionalUserData {
  displayName?: string | null;
  phoneNumber?: string;
  gstNumber?: string;
  state?: string;
  city?: string;
  sellsOn?: string[];
  /** "How many products do you sell?" band: 1-10, 11-50, 51-200, 200+. */
  catalogSizeBand?: string;
  termsAccepted?: boolean;
  whatsappOptIn?: boolean;
  attribution?: Attribution | null;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private platformId = inject(PLATFORM_ID);
  user = signal<AuthUser | null>(null);
  profile = signal<UserProfile | null>(null);
  isAuthReady = signal(false);
  
  private handleAPIError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('API Error:', message);
    throw error;
  }

  isAdmin = computed(() => this.profile()?.role === 'ADMIN');
  isPro = computed(() => this.profile()?.role === 'PAID_PRO' || this.profile()?.role === 'ADMIN');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Restore session from token if present
      (async () => {
        const token = getAuthToken();
        if (token) {
          try {
            await this.syncUserProfileFromAPI();
          } catch (err) {
            console.error('Session restore failed', err);
            clearAuthToken();
            this.user.set(null);
            this.profile.set(null);
          }
        }
        this.isAuthReady.set(true);
      })();
    } else {
      this.isAuthReady.set(true);
    }
  }

  /** Re-reads /me (e.g. after verifying the email or saving business details). */
  refreshProfile(): Promise<void> {
    return this.syncUserProfileFromAPI();
  }

  private async syncUserProfileFromAPI() {
    try {
      const body = await apiFetch<{ user: UserProfile }>('/me');
      this.profile.set(body.user);
      this.user.set({ uid: body.user.uid, email: body.user.email, displayName: body.user.displayName });
    } catch (err) {
      this.handleAPIError(err);
    }
  }

  /** Creates the account and signs the seller in straight away; verifying the email later
   * unlocks the rest of the welcome coins. */
  async registerWithEmail(email: string, password: string, additionalData: AdditionalUserData = {}): Promise<RegisterResult> {
    try {
      const result = await apiFetch<RegisterResult>('/register', {
        method: 'POST',
        body: {
          email,
          password,
          displayName: additionalData.displayName,
          phoneNumber: additionalData.phoneNumber,
          gstNumber: additionalData.gstNumber,
          state: additionalData.state,
          city: additionalData.city,
          sellsOn: additionalData.sellsOn,
          catalogSizeBand: additionalData.catalogSizeBand,
          termsAccepted: additionalData.termsAccepted,
          whatsappOptIn: additionalData.whatsappOptIn,
          attribution: additionalData.attribution ?? undefined,
        },
      });
      setAuthToken(result.token, true);
      await this.syncUserProfileFromAPI();
      return result;
    } catch (error) {
      const apiError = error as ApiError & { code?: string };
      // The backend returns 409 for both a duplicate email and a duplicate phone number — check
      // which one it actually was (code PHONE_TAKEN) rather than assuming email.
      if (apiError.status === 409) {
        const phoneTaken = (apiError.data as { code?: string } | undefined)?.code === 'PHONE_TAKEN' || /phone|number/i.test(apiError.message);
        apiError.code = phoneTaken ? 'auth/phone-already-in-use' : 'auth/email-already-in-use';
      } else if (apiError.status === 429) {
        apiError.code = 'auth/too-many-requests';
      } else {
        const code = (apiError.data as { code?: string } | undefined)?.code;
        if (code) apiError.code = code;
      }
      console.error('Registration failed:', error);
      throw apiError;
    }
  }

  checkEmail(email: string): Promise<EmailCheckResult> {
    return apiFetch<EmailCheckResult>('/check-email', { method: 'POST', body: { email } });
  }

  /** "Continue with Google": signs in an existing account, or returns a pending token for a new one. */
  async signInWithGoogle(credential: string): Promise<GoogleSignInResult> {
    const body = await apiFetch<{ token?: string; needsProfile?: boolean; pendingToken?: string; email?: string; name?: string }>('/auth/google', {
      method: 'POST',
      body: { credential },
    });
    if (body.token) {
      setAuthToken(body.token, true);
      await this.syncUserProfileFromAPI();
      return { signedIn: true };
    }
    return { signedIn: false, pendingToken: body.pendingToken ?? '', email: body.email ?? '', name: body.name ?? '' };
  }

  /** New Google account: only the mobile number and terms are asked. */
  async completeGoogleSignup(data: { pendingToken: string; phoneNumber: string; termsAccepted: boolean; whatsappOptIn: boolean; attribution?: Attribution | null }): Promise<void> {
    try {
      const body = await apiFetch<{ token: string }>('/auth/google/complete', { method: 'POST', body: { ...data, attribution: data.attribution ?? undefined } });
      setAuthToken(body.token, true);
      await this.syncUserProfileFromAPI();
    } catch (error) {
      const apiError = error as ApiError & { code?: string };
      if (apiError.status === 409 && (apiError.data as { code?: string } | undefined)?.code === 'PHONE_TAKEN') apiError.code = 'auth/phone-already-in-use';
      throw apiError;
    }
  }

  /** Onboarding card. Returns whether the +2 was granted now or waits for email verification. */
  async saveBusinessDetails(details: BusinessDetails): Promise<{ bonusGranted: boolean; bonusPending: boolean; complete: boolean }> {
    const result = await apiFetch<{ bonusGranted: boolean; bonusPending: boolean; complete: boolean }>('/me/business', { method: 'PATCH', body: details });
    await this.syncUserProfileFromAPI();
    return result;
  }

  async dismissBusinessCard(): Promise<void> {
    await apiFetch('/me/business', { method: 'PATCH', body: { dismiss: true } });
    const profile = this.profile();
    if (profile?.businessCard) this.profile.set({ ...profile, businessCard: { ...profile.businessCard, show: false }, marketplacesCard: { show: false } });
  }

  /** Saves "Where do you sell?" (Profile → My marketplaces, or the one-time dashboard card). */
  async saveMarketplaces(marketplaces: string[], other: string): Promise<void> {
    const result = await apiFetch<{ marketplaces: string[]; marketplacesOther: string | null }>('/me/marketplaces', { method: 'PUT', body: { marketplaces, other } });
    const profile = this.profile();
    if (profile) this.profile.set({ ...profile, marketplaces: result.marketplaces, marketplacesOther: result.marketplacesOther, marketplacesCard: { show: false } });
  }

  /** Closes the one-time "where do you sell?" card without answering; it doesn't come back. */
  async dismissMarketplacesCard(): Promise<void> {
    const profile = this.profile();
    if (profile) this.profile.set({ ...profile, marketplacesCard: { show: false } });
    await apiFetch('/me/marketplaces', { method: 'PUT', body: { dismiss: true } });
  }

  async loginWithEmail(email: string, password: string, rememberMe = true) {
    try {
      const body = await apiFetch<{ token: string }>('/login', {
        method: 'POST',
        body: { email, password },
      });
      setAuthToken(body.token, rememberMe);
      await this.syncUserProfileFromAPI();
      return this.user();
    } catch (error) {
      const apiError = error as ApiError & { code?: string };
      if (apiError.status === 401) apiError.code = 'auth/wrong-password';
      if (apiError.status === 403 && /not been verified/i.test(apiError.message)) apiError.code = 'auth/email-not-verified';
      if (apiError.status === 429) apiError.code = 'auth/too-many-requests';
      console.error('Login failed:', error);
      throw apiError;
    }
  }

  /** Verifies the emailed token and, on success, signs the user in — they just proved ownership
   * of the email, so there's no need to make them type their password again. */
  async verifyEmail(token: string, rememberMe = true) {
    const body = await apiFetch<{ token: string }>('/verify-email', {
      method: 'POST',
      body: { token },
    });
    setAuthToken(body.token, rememberMe);
    await this.syncUserProfileFromAPI();
    return this.user();
  }

  async resendVerification(email: string): Promise<void> {
    await apiFetch('/resend-verification', {
      method: 'POST',
      body: { email },
    });
  }

  async logout() {
    try {
      clearAuthToken();
      this.user.set(null);
      this.profile.set(null);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    try {
      await apiFetch('/forgot-password', {
        method: 'POST',
        body: { email },
      });
    } catch (error) {
      console.error('Forgot password failed:', error);
      throw error;
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    try {
      await apiFetch('/reset-password', {
        method: 'POST',
        body: { token, password },
      });
    } catch (error) {
      console.error('Reset password failed:', error);
      throw error;
    }
  }

  async incrementUsage() {
    const p = this.profile();
    const u = this.user();
    if (!p || !u || !getAuthToken()) return;
    try {
      await apiFetch(`/users/${u.uid}`, {
        method: 'PATCH',
        body: { incrementUsage: true },
      });
      // Refresh profile
      await this.syncUserProfileFromAPI();
    } catch (error) {
      this.handleAPIError(error);
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiFetch('/change-password', { method: 'POST', body: { currentPassword, newPassword } });
  }

  /** Permanently deletes the account and all its data, then signs out locally. */
  async deleteAccount(password: string): Promise<void> {
    await apiFetch('/me', { method: 'DELETE', body: { password } });
    clearAuthToken();
    this.user.set(null);
    this.profile.set(null);
  }

  async updateProfile(data: Partial<UserProfile>) {
    const u = this.user();
    if (!u || !getAuthToken()) return;
    try {
      await apiFetch(`/users/${u.uid}`, {
        method: 'PATCH',
        body: data,
      });
      await this.syncUserProfileFromAPI();
    } catch (error) {
      this.handleAPIError(error);
    }
  }

  private cleanData(obj: Record<string, unknown>): Record<string, unknown> {
    const cleaned = { ...obj };
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === undefined) {
        delete cleaned[key];
      }
    });
    return cleaned;
  }
}
