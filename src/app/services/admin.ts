import { Injectable } from '@angular/core';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Listing } from './listing';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  lastLogin: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  
  async getAllUsers(): Promise<UserProfile[]> {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(doc => doc.data() as UserProfile);
  }

  async getAllListings(): Promise<Listing[]> {
    const q = query(collection(db, 'listings'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Listing));
  }

  async deleteUserListing(listingId: string) {
    await deleteDoc(doc(db, 'listings', listingId));
  }

  async updateUserListing(listingId: string, data: Partial<Listing>) {
    await updateDoc(doc(db, 'listings', listingId), data);
  }
}
