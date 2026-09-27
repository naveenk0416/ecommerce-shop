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
  mrp?: number;
  flipkartProductId?: string;
  flipkartLocationId?: string;
  /** Server-calculated from HSN + selling price (GST 2.0 table). */
  gstNeedsReview?: boolean;
  gstReason?: string;
  /** Per-product low-stock level; DEFAULT_LOW_STOCK_THRESHOLD when unset. */
  lowStockThreshold?: number | null;
  /** The saved AI listing (My Listings) this inventory item was created from. */
  draftId?: string;
  searchTags?: string[];
}

/** Low stock = at or below the product's threshold (default 5 units). */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function lowStockThresholdOf(listing: Pick<Listing, 'lowStockThreshold'>): number {
  const t = listing.lowStockThreshold;
  return typeof t === 'number' && t >= 0 ? t : DEFAULT_LOW_STOCK_THRESHOLD;
}

export function isLowStock(listing: Pick<Listing, 'quantity' | 'lowStockThreshold'>): boolean {
  return Number(listing.quantity ?? 0) <= lowStockThresholdOf(listing);
}

/** POST /listings/:id/sales response — stock is decremented atomically on the server. */
export interface LogSaleResponse {
  sale: Sale;
  previousStock: number;
  stock: number;
  listing: Listing | null;
}

export interface GstRateResult {
  rate: number | null;
  needsReview: boolean;
  reason: string;
  source: string | null;
  tableVersion: string;
}

/** Tab-keyed AI content (+ the seller's edits) for one product. */
export type DraftResults = Record<string, Record<string, { values: string[]; confidence: number | null; reason: string | null }>>;

export interface ListingDraftSummary {
  id: string;
  title: string;
  status: 'draft' | 'saved';
  imageUrl: string | null;
  inventoryListingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingDraft extends ListingDraftSummary {
  results: DraftResults;
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

  private startPolling<T>(path: string, callback: (items: T) => void, onError?: (error: unknown) => void) {
    let active = true;
    // Only surface a failure once per outage (not every 5s) — cleared as soon as a poll succeeds
    // again, so a fresh failure after a recovery is reported too.
    let hasNotifiedError = false;
    // Skip a tick while the previous request is still running — otherwise a slow server gets a
    // new request stacked on top every interval, making it slower still.
    let inFlight = false;

    const poll = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const payload = await apiFetch<T>(path);
        hasNotifiedError = false;
        callback(payload);
      } catch (error) {
        console.error('Polling failed for', path, error);
        if (!hasNotifiedError) {
          hasNotifiedError = true;
          onError?.(error);
        }
      } finally {
        inFlight = false;
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
  getListings(userId: string, callback: (listings: Listing[]) => void, poll = true, onError?: (error: unknown) => void) {
    if (!poll) {
      // one-time fetch
      (async () => {
        try {
          const data = await apiFetch<Listing[]>(`/listings?mine=true`);
          callback(data || []);
        } catch (err) {
          console.error('Failed to fetch listings (one-time):', err);
          onError?.(err);
        }
      })();
      return () => undefined;
    }
    return this.startPolling<Listing[]>(`/listings?mine=true`, callback, onError);
  }

  getAllListings(callback: (listings: Listing[]) => void, poll = true, onError?: (error: unknown) => void) {
    if (!poll) {
      (async () => {
        try {
          const data = await apiFetch<Listing[]>(`/listings?all=true`);
          callback(data || []);
        } catch (err) {
          console.error('Failed to fetch all listings (one-time):', err);
          onError?.(err);
        }
      })();
      return () => undefined;
    }
    return this.startPolling<Listing[]>(`/listings?all=true`, callback, onError);
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

  async updateListing(id: string, updates: Partial<Listing>): Promise<Listing> {
    try {
      return await apiFetch<Listing>(`/listings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: updates,
      });
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `/listings/${id}`);
      throw error;
    }
  }

  /** Logs a sale; the server reduces stock in the same atomic operation and returns the new stock. */
  async logSale(sale: Omit<Sale, 'id' | 'uid' | 'date'>): Promise<LogSaleResponse> {
    try {
      return await apiFetch<LogSaleResponse>(`/listings/${encodeURIComponent(sale.listingId)}/sales`, {
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

  /** GST rate for an HSN code + selling price from the backend's GST 2.0 table (display only;
   * the server re-calculates on every save). */
  getGstRate(hsn: string, price: number | null): Promise<GstRateResult> {
    const params = new URLSearchParams({ hsn });
    if (price !== null && Number.isFinite(price)) params.set('price', String(price));
    return apiFetch<GstRateResult>(`/gst/rate?${params.toString()}`);
  }

  // ---- My Listings (auto-saved AI listing drafts) ----

  listDrafts(): Promise<ListingDraftSummary[]> {
    return apiFetch<ListingDraftSummary[]>('/drafts');
  }

  getDraft(id: string): Promise<ListingDraft> {
    return apiFetch<ListingDraft>(`/drafts/${encodeURIComponent(id)}`);
  }

  createDraft(body: { results: DraftResults; image?: string }): Promise<ListingDraft> {
    return apiFetch<ListingDraft>('/drafts', { method: 'POST', body });
  }

  updateDraft(id: string, body: Partial<{ results: DraftResults; image: string; status: 'draft' | 'saved'; inventoryListingId: string }>): Promise<ListingDraftSummary> {
    return apiFetch<ListingDraftSummary>(`/drafts/${encodeURIComponent(id)}`, { method: 'PATCH', body });
  }

  duplicateDraft(id: string): Promise<ListingDraftSummary> {
    return apiFetch<ListingDraftSummary>(`/drafts/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
  }

  deleteDraft(id: string): Promise<void> {
    return apiFetch<void>(`/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  getSales(listingId: string, callback: (sales: Sale[]) => void) {
    return this.startPolling<Sale[]>(`/listings/${encodeURIComponent(listingId)}/sales`, callback);
  }
}
