import { getAccessToken } from './flipkart-token-service.js';

const FLIPKART_API_HOST = 'https://api.flipkart.net';
const BATCH_SIZE = 20;
const DETAILS_BATCH_SIZE = 10;
// Flipkart's product/search requires a specific internalState per call (no "give me everything"
// option) — looping over all of them mirrors the "all listings" scope the Amazon sync uses.
const INTERNAL_STATES = ['ACTIVE', 'INACTIVE', 'READY_FOR_ACTIVATION', 'ARCHIVED', 'INACTIVATED_BY_FLIPKART'];
// Defensive cap on pagination per state, in case of an unexpected always-full-page response.
const MAX_BATCHES_PER_STATE = 200;

export interface FlipkartListingItem {
  listingId: string;
  sellerId: string;
  productId: string;
  sku: string;
  status: string;
  product_name: string;
  product_image_url?: string;
  vertical: string;
  product_description?: { ssp?: number; esp?: number; mrp?: number };
}

interface ProductSearchResponse {
  totalListingsCount: number;
  listingData: FlipkartListingItem[];
}

async function flipkartApiFetch(uid: string, path: string, body: unknown) {
  const accessToken = await getAccessToken(uid);
  return fetch(`${FLIPKART_API_HOST}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/** Fetches every listing across all internal states (active, inactive, archived, etc.) for
 * `uid`'s Flipkart account via POST /listings/v3/product/search, paginating each state in
 * batches of 20 until a short page signals the end. */
export async function fetchAllFlipkartListings(uid: string): Promise<FlipkartListingItem[]> {
  const all: FlipkartListingItem[] = [];

  for (const internalState of INTERNAL_STATES) {
    for (let batchNo = 0; batchNo < MAX_BATCHES_PER_STATE; batchNo++) {
      const response = await flipkartApiFetch(uid, '/listings/v3/product/search', { batchNo, internalState });
      if (!response.ok) {
        console.error('Flipkart listing search failed', internalState, batchNo, response.status, await response.text());
        throw new Error(`Failed to fetch Flipkart listings (${internalState}).`);
      }
      const body = await response.json() as ProductSearchResponse;
      all.push(...body.listingData);
      if (body.listingData.length < BATCH_SIZE) break;
    }
  }

  return all;
}

/** Batches SKUs in groups of 10 (Flipkart's per-call max for this endpoint) via
 * POST /listings/v3/details and returns total inventory per SKU, summed across fulfillment
 * locations — product/search above doesn't include stock counts, only this endpoint does. */
export async function fetchFlipkartInventoryBySku(uid: string, skus: string[]): Promise<Map<string, number>> {
  const quantities = new Map<string, number>();

  for (let i = 0; i < skus.length; i += DETAILS_BATCH_SIZE) {
    const batch = skus.slice(i, i + DETAILS_BATCH_SIZE);
    const response = await flipkartApiFetch(uid, '/listings/v3/details', { sku_ids: batch });
    if (!response.ok) {
      // Best-effort: a stock-lookup failure for one batch shouldn't abort the whole sync —
      // those SKUs just come back with quantity 0, still visible/editable in Inventory.
      console.error('Flipkart listing details failed', response.status, await response.text());
      continue;
    }
    const body = await response.json() as { available?: Record<string, { locations?: Array<{ inventory?: number }> }> };
    for (const [sku, details] of Object.entries(body.available || {})) {
      const total = (details.locations || []).reduce((sum, loc) => sum + (loc.inventory || 0), 0);
      quantities.set(sku, total);
    }
  }

  return quantities;
}
