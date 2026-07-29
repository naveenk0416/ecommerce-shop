import { Injectable, signal, inject, PLATFORM_ID, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { apiFetch, ApiError } from './api';

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
}

export interface AdditionalUserData {
  displayName?: string | null;
  phoneNumber?: string;
  gstNumber?: string;
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
        const token = window.localStorage.getItem('auth_token');
        if (token) {
          try {
            await this.syncUserProfileFromAPI();
          } catch (err) {
            console.error('Session restore failed', err);
            window.localStorage.removeItem('auth_token');
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

  private async syncUserProfileFromAPI() {
    try {
      const body = await apiFetch<{ user: UserProfile }>('/me');
      this.profile.set(body.user);
      this.user.set({ uid: body.user.uid, email: body.user.email, displayName: body.user.displayName });
    } catch (err) {
      this.handleAPIError(err);
    }
  }

  async registerWithEmail(email: string, password: string, additionalData: AdditionalUserData = {}) {
    try {
      const body = await apiFetch<{ token: string }>('/register', {
        method: 'POST',
        body: { email, password, displayName: additionalData.displayName, phoneNumber: additionalData.phoneNumber, gstNumber: additionalData.gstNumber },
      });
      window.localStorage.setItem('auth_token', body.token);
      await this.syncUserProfileFromAPI();
      return this.user();
    } catch (error) {
      const apiError = error as ApiError & { code?: string };
      if (apiError.status === 409) apiError.code = 'auth/email-already-in-use';
      console.error('Registration failed:', error);
      throw apiError;
    }
  }

  async loginWithEmail(email: string, password: string) {
    try {
      const body = await apiFetch<{ token: string }>('/login', {
        method: 'POST',
        body: { email, password },
      });
      window.localStorage.setItem('auth_token', body.token);
      await this.syncUserProfileFromAPI();
      return this.user();
    } catch (error) {
      const apiError = error as ApiError & { code?: string };
      if (apiError.status === 401) apiError.code = 'auth/wrong-password';
      console.error('Login failed:', error);
      throw apiError;
    }
  }

  async logout() {
    try {
      window.localStorage.removeItem('auth_token');
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
    if (!p || !u || !window.localStorage.getItem('auth_token')) return;
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

  async updateProfile(data: Partial<UserProfile>) {
    const u = this.user();
    if (!u || !window.localStorage.getItem('auth_token')) return;
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
