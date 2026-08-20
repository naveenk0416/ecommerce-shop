import { Injectable } from '@angular/core';
import { apiFetch } from './api';

export interface MarketplaceConnectionStatus {
  connected: boolean;
  configured?: boolean;
  revoked?: boolean;
  needsReauth?: boolean;
  sellingPartnerId?: string;
  connectedAt?: string;
  scopes?: string[];
}

export interface MarketplaceConnectionsResponse {
  amazon: MarketplaceConnectionStatus;
  flipkart: MarketplaceConnectionStatus;
}

@Injectable({
  providedIn: 'root',
})
export class MarketplaceConnectionsService {
  async getConnections(): Promise<MarketplaceConnectionsResponse> {
    return apiFetch<MarketplaceConnectionsResponse>('/marketplace-connections');
  }

  /** Returns Amazon's authorization URL — caller navigates the browser there directly
   * (window.location.href), since Amazon's own redirect can't carry our auth header. */
  async getAmazonAuthorizeUrl(): Promise<string> {
    const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>('/marketplace-connections/amazon/connect', {
      method: 'POST',
    });
    return authorizeUrl;
  }

  /** Completes the Amazon-initiated ("Manage" from Seller Central) entry point, once the seller
   * is confirmed logged in here. Returns the URL to navigate the browser to next. */
  async resumeAmazonLogin(amazonCallbackUri: string, amazonState: string): Promise<string> {
    const { redirectUrl } = await apiFetch<{ redirectUrl: string }>('/marketplace-connections/amazon/resume-login', {
      method: 'POST',
      body: { amazonCallbackUri, amazonState },
    });
    return redirectUrl;
  }

  /** Pulls the seller's full Amazon catalog into Inventory (upserted by SKU). Can take up to
   * ~90s — Amazon's report generation is asynchronous and this awaits the whole poll loop. */
  async syncAmazonInventory(): Promise<{ imported: number; updated: number; total: number }> {
    return apiFetch<{ imported: number; updated: number; total: number }>('/marketplace-connections/amazon/sync-inventory', {
      method: 'POST',
    });
  }

  /** Pulls the seller's full Flipkart catalog into Inventory (upserted by SKU). */
  async syncFlipkartInventory(): Promise<{ imported: number; updated: number; total: number }> {
    return apiFetch<{ imported: number; updated: number; total: number }>('/marketplace-connections/flipkart/sync-inventory', {
      method: 'POST',
    });
  }

  /** Returns Flipkart's authorization URL — same navigation pattern as getAmazonAuthorizeUrl(). */
  async getFlipkartAuthorizeUrl(): Promise<string> {
    const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>('/marketplace-connections/flipkart/connect', {
      method: 'POST',
    });
    return authorizeUrl;
  }

  async disconnect(marketplace: 'amazon' | 'flipkart'): Promise<void> {
    await apiFetch(`/marketplace-connections/${marketplace}`, { method: 'DELETE' });
  }
}
