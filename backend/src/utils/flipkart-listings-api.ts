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

export interface FlipkartInventoryDetail {
  quantity: number;
  /** First fulfillment location's id — needed to push inventory updates back later via
   * POST /listings/v3/update/inventory, which requires a location id "obtained via the
   * Onboarding API." Most sellers have a single location, so the first one is used as primary. */
  locationId?: string;
}

/** Batches SKUs in groups of 10 (Flipkart's per-call max for this endpoint) via
 * POST /listings/v3/details and returns total inventory (summed across fulfillment locations)
 * plus a primary location id per SKU — product/search alone doesn't include either. */
export async function fetchFlipkartInventoryBySku(uid: string, skus: string[]): Promise<Map<string, FlipkartInventoryDetail>> {
  const details = new Map<string, FlipkartInventoryDetail>();

  for (let i = 0; i < skus.length; i += DETAILS_BATCH_SIZE) {
    const batch = skus.slice(i, i + DETAILS_BATCH_SIZE);
    const response = await flipkartApiFetch(uid, '/listings/v3/details', { sku_ids: batch });
    if (!response.ok) {
      // Best-effort: a stock-lookup failure for one batch shouldn't abort the whole sync —
      // those SKUs just come back with quantity 0, still visible/editable in Inventory.
      console.error('Flipkart listing details failed', response.status, await response.text());
      continue;
    }
    const body = await response.json() as { available?: Record<string, { locations?: Array<{ id?: string; inventory?: number }> }> };
    for (const [sku, item] of Object.entries(body.available || {})) {
      const locations = item.locations || [];
      const total = locations.reduce((sum, loc) => sum + (loc.inventory || 0), 0);
      details.set(sku, { quantity: total, locationId: locations[0]?.id });
    }
  }

  return details;
}

export interface PublishResult {
  ok: boolean;
  issues?: Array<{ code?: string; description?: string; severity?: string }>;
}

/** Pushes price and stock to an existing Flipkart listing via its two separate update
 * endpoints — Flipkart doesn't have a combined price+inventory update call. Both are attempted
 * even if one fails, and issues from either are collected so the caller can see exactly what
 * went wrong rather than a generic failure. */
export async function updateFlipkartListingPriceAndInventory(
  uid: string,
  sku: string,
  productId: string,
  mrp: number,
  sellingPrice: number,
  locationId: string,
  inventory: number,
): Promise<PublishResult> {
  const issues: Array<{ code?: string; description?: string; severity?: string }> = [];

  const priceResponse = await flipkartApiFetch(uid, '/listings/v3/update/price', {
    [sku]: { product_id: productId, price: { mrp, selling_price: sellingPrice, currency: 'INR' } },
  });
  const priceBody = priceResponse.ok
    ? await priceResponse.json() as Record<string, { status?: string; errors?: any[]; attribute_errors?: any[] }>
    : null;
  if (!priceResponse.ok || priceBody?.[sku]?.status === 'failure') {
    console.error('Flipkart price update failed', sku, priceResponse.status, JSON.stringify(priceBody));
    issues.push(...(priceBody?.[sku]?.errors || []), ...(priceBody?.[sku]?.attribute_errors || []));
  }

  const inventoryResponse = await flipkartApiFetch(uid, '/listings/v3/update/inventory', {
    [sku]: { product_id: productId, locations: [{ id: locationId, inventory }] },
  });
  const inventoryBody = inventoryResponse.ok
    ? await inventoryResponse.json() as Record<string, { status?: string; errors?: any[]; attribute_errors?: any[] }>
    : null;
  if (!inventoryResponse.ok || inventoryBody?.[sku]?.status === 'failure') {
    console.error('Flipkart inventory update failed', sku, inventoryResponse.status, JSON.stringify(inventoryBody));
    issues.push(...(inventoryBody?.[sku]?.errors || []), ...(inventoryBody?.[sku]?.attribute_errors || []));
  }

  return { ok: issues.length === 0, issues: issues.length ? issues : undefined };
}
