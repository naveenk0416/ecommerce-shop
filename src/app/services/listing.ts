import { Injectable } from '@angular/core';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  deleteDoc,
  orderBy
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ProductDetails } from './gemini';
import { handleFirestoreError, OperationType } from '../utils/error-handler';

export interface Listing extends ProductDetails {
  id?: string;
  uid: string;
  originalImage: string;
  processedImage: string | null;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ListingService {
  private listingsPath = 'listings';

  saveListing(details: ProductDetails, originalImage = '', processedImage: string | null = null) {
    const user = auth.currentUser;
    if (!user) throw new Error('User must be authenticated to save a listing');

    const listing: Omit<Listing, 'id'> = {
      ...details,
      uid: user.uid,
      originalImage,
      processedImage,
      createdAt: new Date().toISOString()
    };

    try {
      return addDoc(collection(db, this.listingsPath), listing);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, this.listingsPath);
      throw error;
    }
  }

  getListings(userId: string, callback: (listings: Listing[]) => void) {
    const q = query(
      collection(db, this.listingsPath),
      where('uid', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const listings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Listing));
      callback(listings);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, this.listingsPath);
    });
  }

  getAllListings(callback: (listings: Listing[]) => void) {
    const q = query(
      collection(db, this.listingsPath),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const listings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Listing));
      callback(listings);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, this.listingsPath);
    });
  }

  async deleteListing(id: string) {
    const path = `${this.listingsPath}/${id}`;
    try {
      await deleteDoc(doc(db, this.listingsPath, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}
