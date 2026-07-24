import { Injectable, signal, inject, PLATFORM_ID, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

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

  private get apiBase() {
    if (!isPlatformBrowser(this.platformId)) {
      return '';
    }
    const hostname = window.location.hostname;
    
    return `${window.location.protocol}//${hostname}:4000`;
  }

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Restore session from token if present
      (async () => {
        const token = window.localStorage.getItem('auth_token');
        if (token) {
          try {
            const res = await fetch(this.apiBase + '/api/me', {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
              const body = await res.json();
              this.user.set({ uid: body.user.uid, email: body.user.email, displayName: body.user.displayName });
              this.profile.set(body.user as UserProfile);
            } else {
              window.localStorage.removeItem('auth_token');
              this.user.set(null);
              this.profile.set(null);
            }
          } catch (err) {
            console.error('Session restore failed', err);
          }
        }
        this.isAuthReady.set(true);
      })();
    } else {
      this.isAuthReady.set(true);
    }
  }

  private async syncUserProfileFromAPI(token: string) {
    try {
      const res = await fetch(this.apiBase + '/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch profile');
      const body = await res.json();
      this.profile.set(body.user as UserProfile);
      this.user.set({ uid: body.user.uid, email: body.user.email, displayName: body.user.displayName });
    } catch (err) {
      this.handleAPIError(err);
    }
  }

  async registerWithEmail(email: string, password: string, additionalData: AdditionalUserData = {}) {
    try {
      const res = await fetch(this.apiBase + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName: additionalData.displayName, phoneNumber: additionalData.phoneNumber, gstNumber: additionalData.gstNumber })
      });
      const body = await res.json();
      if (!res.ok) {
        const err = new Error(body.error || 'Registration failed') as Error & { code?: string };
        err.code = res.status === 409 ? 'auth/email-already-in-use' : undefined;
        throw err;
      }
      window.localStorage.setItem('auth_token', body.token);
      await this.syncUserProfileFromAPI(body.token);
      return this.user();
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  async loginWithEmail(email: string, password: string) {
    try {
      const res = await fetch(this.apiBase + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const body = await res.json();
      if (!res.ok) {
        const err = new Error(body.error || 'Login failed') as Error & { code?: string };
        err.code = res.status === 401 ? 'auth/wrong-password' : undefined;
        throw err;
      }
      window.localStorage.setItem('auth_token', body.token);
      await this.syncUserProfileFromAPI(body.token);
      return this.user();
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
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
      const res = await fetch(this.apiBase + '/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to send reset email');
      }
    } catch (error) {
      console.error('Forgot password failed:', error);
      throw error;
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    try {
      const res = await fetch(this.apiBase + '/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Reset password failed:', error);
      throw error;
    }
  }

  async incrementUsage() {
    const p = this.profile();
    const u = this.user();
    if (!p || !u) return;
    try {
      const token = window.localStorage.getItem('auth_token');
      if (!token) return;
      const res = await fetch(this.apiBase + `/api/users/${u.uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ incrementUsage: true })
      });
      if (!res.ok) throw new Error('Failed to increment usage');
      // Refresh profile
      await this.syncUserProfileFromAPI(token);
    } catch (error) {
      this.handleAPIError(error);
    }
  }

  async updateProfile(data: Partial<UserProfile>) {
    const u = this.user();
    if (!u) return;
    try {
      const token = window.localStorage.getItem('auth_token');
      if (!token) return;
      const res = await fetch(this.apiBase + `/api/users/${u.uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to update profile');
      await this.syncUserProfileFromAPI(token);
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
