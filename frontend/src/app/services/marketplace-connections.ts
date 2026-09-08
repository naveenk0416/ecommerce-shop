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

export interface AmazonProductType {
  name: string;
  displayName: string;
}

export interface AmazonAttributeField {
  name: string;
  type?: string;
  enum?: (string | number | boolean)[];
  description?: string;
  /** Present when this field is itself an object with its own sub-fields (e.g.
   * item_dimensions.length -> { value, unit }) — one level deeper than `fields`. */
  nestedFields?: AmazonAttributeField[];
}

export interface AmazonAttributeSummary {
  name: string;
  missing?: boolean;
  type?: string;
  description?: string;
  oneOfVariantCount?: number;
  itemRequired?: string[];
  fields?: AmazonAttributeField[];
}

export interface AmazonProductTypeSchema {
  productType: string;
  required: string[];
  attributes: AmazonAttributeSummary[];
  totalProperties: number;
}

/** Amazon's raw per-attribute rejection reason, surfaced (via ApiError.data.issues) alongside the
 * flattened error message so a "required but missing" rejection's attributeNames can drive adding
 * fields dynamically rather than only being displayable as text. */
export interface AmazonListingIssue {
  code?: string;
  message?: string;
  severity?: string;
  attributeNames?: string[];
}

export interface CreateAmazonListingPayload {
  productType: string;
  /** Attribute name -> its already-shaped value array (e.g. item_name: [{ value, language_tag }],
   * country_of_origin: [{ value }]) — shaped by the caller using the same product type schema
   * from getAmazonProductTypeSchema(), so this stays generic across whatever product type was
   * picked rather than the backend hardcoding a fixed set of attribute names. */
  attributes: Record<string, Array<Record<string, unknown>>>;
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
  async syncAmazonInventory(): Promise<{ imported: number; updated: number; total: number; imagesFetched: number }> {
    return apiFetch('/marketplace-connections/amazon/sync-inventory', {
      method: 'POST',
    });
  }

  /** Pulls the seller's full Flipkart catalog into Inventory (upserted by SKU). */
  async syncFlipkartInventory(): Promise<{ imported: number; updated: number; total: number }> {
    return apiFetch<{ imported: number; updated: number; total: number }>('/marketplace-connections/flipkart/sync-inventory', {
      method: 'POST',
    });
  }

  /** Pushes a Listing's saved price/quantity back to Amazon — only works for listings with
   * source: 'amazon' (i.e. already synced from there). */
  async publishAmazonListing(listingId: string): Promise<{ ok: true }> {
    return apiFetch(`/marketplace-connections/amazon/publish/${encodeURIComponent(listingId)}`, {
      method: 'POST',
    });
  }

  /** Same as publishAmazonListing, for Flipkart. */
  async publishFlipkartListing(listingId: string): Promise<{ ok: true }> {
    return apiFetch(`/marketplace-connections/flipkart/publish/${encodeURIComponent(listingId)}`, {
      method: 'POST',
    });
  }

  /** Searches Amazon's product type catalog by keyword — first step in creating a brand-new
   * listing for a manually-added product. */
  async searchAmazonProductTypes(keywords: string): Promise<AmazonProductType[]> {
    const { productTypes } = await apiFetch<{ productTypes: AmazonProductType[] }>(
      `/marketplace-connections/amazon/product-types?keywords=${encodeURIComponent(keywords)}`,
    );
    return productTypes;
  }

  /** Fetches the required-attribute summary for a product type, once one's been picked from
   * search results. `extraAttributeNames` adds attributes beyond what Amazon's schema itself
   * declares "required" — its real submission-time validation enforces more than the static
   * schema lists (confirmed by trial), so the create-listing dialog asks about a known set of
   * commonly-needed extras up front rather than discovering them one rejected submission at a time. */
  async getAmazonProductTypeSchema(productType: string, extraAttributeNames: string[] = []): Promise<AmazonProductTypeSchema> {
    const extra = extraAttributeNames.length ? `&attributes=${encodeURIComponent(extraAttributeNames.join(','))}` : '';
    return apiFetch(`/marketplace-connections/amazon/product-type-schema?productType=${encodeURIComponent(productType)}${extra}`);
  }

  /** Creates a brand-new Amazon listing for a manually-added product, using its saved
   * price/quantity plus the category-specific attributes the seller filled in. */
  async createAmazonListing(listingId: string, payload: CreateAmazonListingPayload): Promise<{ ok: true; sku: string }> {
    return apiFetch(`/marketplace-connections/amazon/create-listing/${encodeURIComponent(listingId)}`, {
      method: 'POST',
      body: payload,
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
