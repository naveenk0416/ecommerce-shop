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
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

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
  isAuthReady = signal(false);
  
  isAdmin = computed(() => {
    const u = this.user();
    // Bootstrap admin by email for demo, in production we use 'admins' collection
    return u?.email === 'naveenkumar0416@gmail.com';
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      onAuthStateChanged(auth, async (user) => {
        this.user.set(user);
        if (user) {
          await this.syncUserProfile(user);
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
      const profile: Record<string, string | null | undefined> = {
        uid: user.uid,
        email: user.email,
        lastLogin: new Date().toISOString()
      };

      const displayName = additionalData.displayName || user.displayName;
      if (displayName) profile['displayName'] = displayName;
      
      if (user.photoURL) profile['photoURL'] = user.photoURL;
      
      if (additionalData.phoneNumber) profile['phoneNumber'] = additionalData.phoneNumber;
      if (additionalData.gstNumber) profile['gstNumber'] = additionalData.gstNumber;

      await setDoc(userRef, profile, { merge: true });
    } catch (error) {
      console.error('Failed to sync user profile:', error);
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
}
