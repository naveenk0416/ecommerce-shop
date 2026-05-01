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
  costPrice?: number;
  sellingPrice?: number;
}

export interface Sale {
  id?: string;
  listingId: string;
  uid: string;
  platform: 'Amazon' | 'Flipkart' | 'Meesho' | 'Instagram' | 'Offline' | 'Other';
  quantity: number;
  salePrice: number;
  date: string;
}

export interface Feedback {
  id?: string;
  uid: string;
  listingId: string;
  rating: number;
  comment?: string;
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

  submitFeedback(feedback: Omit<Feedback, 'id' | 'uid' | 'createdAt'>) {
    const user = auth.currentUser;
    if (!user) throw new Error('User must be authenticated to submit feedback');

    const data: Omit<Feedback, 'id'> = {
      ...feedback,
      uid: user.uid,
      createdAt: new Date().toISOString()
    };

    try {
      return addDoc(collection(db, 'feedback'), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'feedback');
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

  async updateListing(id: string, updates: Partial<Listing>) {
    const path = `${this.listingsPath}/${id}`;
    try {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, this.listingsPath, id), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  logSale(sale: Omit<Sale, 'id' | 'uid' | 'date'>) {
    const user = auth.currentUser;
    if (!user) throw new Error('User must be authenticated to log a sale');

    const path = `${this.listingsPath}/${sale.listingId}/sales`;
    const data: Omit<Sale, 'id'> = {
      ...sale,
      uid: user.uid,
      date: new Date().toISOString()
    };

    try {
      return addDoc(collection(db, path), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      throw error;
    }
  }

  getSales(listingId: string, callback: (sales: Sale[]) => void) {
    const path = `${this.listingsPath}/${listingId}/sales`;
    const q = query(
      collection(db, path),
      orderBy('date', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const sales = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Sale));
      callback(sales);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  }
}
