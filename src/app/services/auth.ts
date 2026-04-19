import { Injectable, signal, inject, PLATFORM_ID, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
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
  isPro = computed(() => this.profile()?.role === 'PAID_PRO' || this.profile()?.role === 'ADMIN');

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

  async registerWithEmail(email: string, pass: string, additionalData: AdditionalUserData = {}) {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      if (result.user) {
        await this.syncUserProfile(result.user, additionalData);
      }
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  async loginWithEmail(email: string, pass: string) {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error('Email login failed:', error);
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
