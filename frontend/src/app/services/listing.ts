import { Injectable } from '@angular/core';
import { apiFetch } from './api';
import { ProductDetails } from './gemini';
import { handleApiError, OperationType } from '../utils/error-handler';

export interface Listing extends ProductDetails {
  id?: string;
  uid: string;
  originalImage: string;
  processedImage: string | null;
  createdAt: string;
  costPrice?: number;
  sellingPrice?: number;
  /** Set when this listing was imported from a marketplace sync rather than added manually. */
  source?: 'amazon' | 'flipkart';
  sku?: string;
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
  private readonly POLL_INTERVAL_MS = 5000;

  async saveListing(details: ProductDetails, originalImage = '', processedImage: string | null = null) {
    try {
      return await apiFetch<Listing>('/listings', {
        method: 'POST',
        body: {
          ...details,
          originalImage,
          processedImage,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      handleApiError(error, OperationType.CREATE, '/listings');
      throw error;
    }
  }

  async submitFeedback(feedback: Omit<Feedback, 'id' | 'uid' | 'createdAt'>) {
    try {
      return await apiFetch<Feedback>('/feedback', {
        method: 'POST',
        body: {
          ...feedback,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      handleApiError(error, OperationType.CREATE, '/feedback');
      throw error;
    }
  }

  private startPolling<T>(path: string, callback: (items: T) => void) {
    let active = true;

    const poll = async () => {
      if (!active) return;
      try {
        const payload = await apiFetch<T>(path);
        callback(payload);
      } catch (error) {
        console.error('Polling failed for', path, error);
      }
    };

    poll();

    if (typeof window === 'undefined') {
      return () => { active = false; };
    }

    const timer = window.setInterval(poll, this.POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }

  /**
   * Subscribe to listings. By default this polls every POLL_INTERVAL_MS.
   * Set `poll` to false to perform a single fetch and receive a one-time callback.
   */
  getListings(userId: string, callback: (listings: Listing[]) => void, poll = true) {
    if (!poll) {
      // one-time fetch
      (async () => {
        try {
          const data = await apiFetch<Listing[]>(`/listings?mine=true`);
          callback(data || []);
        } catch (err) {
          console.error('Failed to fetch listings (one-time):', err);
        }
      })();
      return () => undefined;
    }
    return this.startPolling<Listing[]>(`/listings?mine=true`, callback);
  }

  getAllListings(callback: (listings: Listing[]) => void, poll = true) {
    if (!poll) {
      (async () => {
        try {
          const data = await apiFetch<Listing[]>(`/listings?all=true`);
          callback(data || []);
        } catch (err) {
          console.error('Failed to fetch all listings (one-time):', err);
        }
      })();
      return () => undefined;
    }
    return this.startPolling<Listing[]>(`/listings?all=true`, callback);
  }

  async getListing(id: string): Promise<Listing> {
    try {
      return await apiFetch<Listing>(`/listings/${encodeURIComponent(id)}`);
    } catch (error) {
      handleApiError(error, OperationType.GET, `/listings/${id}`);
      throw error;
    }
  }

  async deleteListing(id: string) {
    try {
      return apiFetch(`/listings/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `/listings/${id}`);
      throw error;
    }
  }

  async updateListing(id: string, updates: Partial<Listing>) {
    try {
      return apiFetch(`/listings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: updates,
      });
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `/listings/${id}`);
      throw error;
    }
  }

  async logSale(sale: Omit<Sale, 'id' | 'uid' | 'date'>) {
    try {
      return apiFetch(`/listings/${encodeURIComponent(sale.listingId)}/sales`, {
        method: 'POST',
        body: {
          ...sale,
          date: new Date().toISOString(),
        },
      });
    } catch (error) {
      handleApiError(error, OperationType.CREATE, `/listings/${sale.listingId}/sales`);
      throw error;
    }
  }

  getSales(listingId: string, callback: (sales: Sale[]) => void) {
    return this.startPolling<Sale[]>(`/listings/${encodeURIComponent(listingId)}/sales`, callback);
  }
}
