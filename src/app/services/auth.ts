import { Injectable, signal, inject, PLATFORM_ID, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile as firebaseUpdateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

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

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private platformId = inject(PLATFORM_ID);
  user = signal<User | null>(null);
  profile = signal<UserProfile | null>(null);
  isAuthReady = signal(false);
  
  private handleFirestoreError(error: unknown, operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write', path: string | null = null) {
    const message = error instanceof Error ? error.message : String(error);
    const info = {
      error: message,
      operationType,
      path,
      authInfo: {
        userId: this.user()?.uid || 'anonymous',
        email: this.user()?.email || 'N/A',
        emailVerified: this.user()?.emailVerified || false,
        isAnonymous: this.user()?.isAnonymous || false,
        providerInfo: this.user()?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || ''
        })) || []
      }
    };
    const errorStr = JSON.stringify(info);
    console.error('Firestore Error Details:', errorStr);
    throw new Error(errorStr);
  }

  isAdmin = computed(() => this.profile()?.role === 'ADMIN');
  isPro = computed(() => true);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      onAuthStateChanged(auth, async (user) => {
        this.user.set(user);
        if (user) {
          await this.syncUserProfile(user);
        } else {
          this.profile.set(null);
        }
        this.isAuthReady.set(true);
      });
    } else {
      this.isAuthReady.set(true);
    }
  }

  private async syncUserProfile(user: User, additionalData: AdditionalUserData = {}) {
    const userRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(userRef);
      let role: UserRole = 'FREE';
      let usageCount = 0;
      let dailyStats = undefined;
      
      // Bootstrap admin
      if (user.email === 'naveenkumar0416@gmail.com') {
        role = 'ADMIN';
      }

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        role = data.role || role;
        usageCount = data.usageCount || 0;
        dailyStats = data.dailyStats || undefined;
      }

      const profile: UserProfile = {
        uid: user.uid,
        email: user.email,
        role: role,
        usageCount: usageCount,
        lastLogin: new Date().toISOString(),
        ...additionalData
      };

      if (dailyStats) {
        profile.dailyStats = dailyStats;
      }

      await setDoc(userRef, profile, { merge: true });
      this.profile.set(profile);
    } catch (error: unknown) {
      this.handleFirestoreError(error, 'write', userRef.path);
    }
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        await this.syncUserProfile(result.user);
      }
    } catch (error) {
      console.error('Google login failed:', error);
      throw error;
    }
  }

  async registerWithEmail(email: string, password: string, additionalData: AdditionalUserData = {}) {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      if (result.user) {
        if (additionalData.displayName) {
          await firebaseUpdateProfile(result.user, { displayName: additionalData.displayName });
        }
        await this.syncUserProfile(result.user, additionalData);
      }
      return result.user;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  async loginWithEmail(email: string, password: string) {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      if (result.user) {
        await this.syncUserProfile(result.user);
      }
      return result.user;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  /**
   * Sends a passwordless login link to the specified email.
   */
  async sendLoginLink(email: string): Promise<void> {
    const url = new URL(window.location.href);
    url.search = ''; // Clean up query params
    url.hash = '';

    const actionCodeSettings = {
      // URL you want to redirect back to. The domain (www.example.com) for this
      // URL must be whitelisted in the Firebase Console.
      url: url.toString(),
      // This must be true.
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Save the email locally so you don't have to ask the user for it again
      // if they open the link on the same device.
      window.localStorage.setItem('emailForSignIn', email);
    } catch (error) {
      console.error('Failed to send login link:', error);
      throw error;
    }
  }

  /**
   * Checks if the incoming URL is a sign-in link.
   */
  isLoginLink(url: string): boolean {
    return isSignInWithEmailLink(auth, url);
  }

  /**
   * Completes the sign-in with the link.
   */
  async signInWithLink(email: string, url: string): Promise<User | null> {
    try {
      const result = await signInWithEmailLink(auth, email, url);
      window.localStorage.removeItem('emailForSignIn');
      if (result.user) {
        await this.syncUserProfile(result.user);
      }
      return result.user;
    } catch (error) {
      console.error('Sign in with link failed:', error);
      throw error;
    }
  }

  async incrementUsage() {
    const p = this.profile();
    const u = this.user();
    if (!p || !u) return;

    const userRef = doc(db, 'users', u.uid);
    const today = new Date().toISOString().split('T')[0];
    
    let dailyCount = 1;
    if (p.dailyStats && p.dailyStats.date === today) {
      dailyCount = (p.dailyStats.count || 0) + 1;
    }

    const update = this.cleanData({
      usageCount: (p.usageCount || 0) + 1,
      dailyStats: {
        date: today,
        count: dailyCount
      }
    });

    try {
      await setDoc(userRef, update, { merge: true });
      this.profile.update(current => current ? { ...current, ...update } : null);
    } catch (error) {
      this.handleFirestoreError(error, 'update', userRef.path);
    }
  }

  async updateProfile(data: Partial<UserProfile>) {
    const u = this.user();
    if (!u) return;
    const userRef = doc(db, 'users', u.uid);
    const cleaned = this.cleanData(data);
    try {
      await setDoc(userRef, cleaned, { merge: true });
      this.profile.update(current => current ? { ...current, ...cleaned } : null);
    } catch (error) {
      this.handleFirestoreError(error, 'update', userRef.path);
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
