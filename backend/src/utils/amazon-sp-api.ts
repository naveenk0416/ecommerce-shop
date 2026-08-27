import zlib from 'zlib';
import { getAccessToken } from './amazon-token-service.js';

// Amazon.in is grouped under the EU SP-API region (https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints).
const SP_API_HOST = 'https://sellingpartnerapi-eu.amazon.com';
const INDIA_MARKETPLACE_ID = 'A21TJRUUN4KGV';

const REPORT_POLL_INTERVAL_MS = 3000;
// Kept under common reverse-proxy/platform request timeouts (Render et al. often cap around
// ~100s) — the frontend request that triggers this stays open for the whole poll loop.
const REPORT_POLL_TIMEOUT_MS = 90 * 1000;

interface CreateReportResponse { reportId: string }
interface GetReportResponse {
  reportId: string;
  processingStatus: 'IN_QUEUE' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'FATAL';
  reportDocumentId?: string;
}
interface GetReportDocumentResponse {
  url: string;
  compressionAlgorithm?: 'GZIP';
}

/** Thrown when Amazon's report generation doesn't finish within our polling window — the report
 * may still complete on Amazon's side, this just means we gave up waiting for this request. */
export class ReportTimeoutError extends Error {
  constructor() {
    super('Amazon report generation is taking longer than expected. Please try again shortly.');
    this.name = 'ReportTimeoutError';
  }
}

/** Thrown when the report itself failed on Amazon's side (rather than our request failing). */
export class ReportFailedError extends Error {
  constructor(status: string) {
    super(`Amazon report generation ended with status ${status}.`);
    this.name = 'ReportFailedError';
  }
}

async function spApiFetch(uid: string, path: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken(uid);
  return fetch(`${SP_API_HOST}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
    },
  });
}

/** Requests a report of type `reportType` for `uid`'s Amazon account, waits for it to finish,
 * and returns the parsed rows. Amazon's flat-file reports are tab-delimited with a header row;
 * this reads columns by name rather than fixed position, since the exact column set has varied
 * slightly across marketplaces/report versions over the years. */
export async function fetchMerchantListingsReport(uid: string, reportType: string): Promise<Record<string, string>[]> {
  const createResponse = await spApiFetch(uid, '/reports/2021-06-30/reports', {
    method: 'POST',
    body: JSON.stringify({ reportType, marketplaceIds: [INDIA_MARKETPLACE_ID] }),
  });
  if (!createResponse.ok) {
    console.error('Amazon create report failed', createResponse.status, await createResponse.text());
    throw new Error('Failed to request an inventory report from Amazon.');
  }
  const { reportId } = await createResponse.json() as CreateReportResponse;

  const deadline = Date.now() + REPORT_POLL_TIMEOUT_MS;
  let reportDocumentId: string | undefined;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_INTERVAL_MS));

    const statusResponse = await spApiFetch(uid, `/reports/2021-06-30/reports/${reportId}`);
    if (!statusResponse.ok) {
      console.error('Amazon get report status failed', statusResponse.status, await statusResponse.text());
      throw new Error('Failed to check Amazon report status.');
    }
    const statusBody = await statusResponse.json() as GetReportResponse;

    if (statusBody.processingStatus === 'DONE') {
      reportDocumentId = statusBody.reportDocumentId;
      break;
    }
    if (statusBody.processingStatus === 'CANCELLED' || statusBody.processingStatus === 'FATAL') {
      throw new ReportFailedError(statusBody.processingStatus);
    }
    // IN_QUEUE / IN_PROGRESS — keep polling.
  }

  if (!reportDocumentId) {
    throw new ReportTimeoutError();
  }

  const documentResponse = await spApiFetch(uid, `/reports/2021-06-30/documents/${reportDocumentId}`);
  if (!documentResponse.ok) {
    console.error('Amazon get report document failed', documentResponse.status, await documentResponse.text());
    throw new Error('Failed to retrieve the Amazon inventory report.');
  }
  const { url, compressionAlgorithm } = await documentResponse.json() as GetReportDocumentResponse;

  // The document URL is a presigned S3 link — no Amazon auth headers involved.
  const fileResponse = await fetch(url);
  if (!fileResponse.ok) {
    throw new Error('Failed to download the Amazon inventory report file.');
  }
  const rawBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const textBuffer = compressionAlgorithm === 'GZIP' ? zlib.gunzipSync(rawBuffer) : rawBuffer;
  // Strip a leading UTF-8 BOM if present — Amazon's flat-file reports sometimes include one,
  // which would otherwise corrupt the *first* header's key (e.g. "item-name" silently becomes
  // "﻿item-name"), making every row's row['item-name'] lookup come back undefined.
  const BOM = '﻿';
  const text = textBuffer.toString('utf-8').replace(new RegExp(`^${BOM}`), '');

  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headers.forEach((header, i) => { row[header] = cells[i] ?? ''; });
    return row;
  });
}

interface ListingsPatchResponse {
  sku?: string;
  status?: 'ACCEPTED' | 'VALID' | 'INVALID';
  issues?: Array<{ code?: string; message?: string; severity?: string; attributeNames?: string[] }>;
}

export interface PublishResult {
  ok: boolean;
  issues?: Array<{ code?: string; message?: string; severity?: string; attributeNames?: string[] }>;
}

/** Pushes price and quantity to an existing Amazon listing via the Listings Items API's partial
 * update (JSON Patch, RFC 6902). "productType": "PRODUCT" is the generic value Amazon's own docs
 * use for this kind of patch — patching purchasable_offer/fulfillment_availability doesn't
 * require the listing's real category-specific product type the way creating a new listing
 * would. Amazon validates the patch and returns `issues` describing anything it rejected, which
 * is surfaced to the caller rather than assumed to have succeeded. */
/** Builds the purchasable_offer/fulfillment_availability attribute values from a price/quantity
 * pair — shape confirmed against a real product type schema (EARRING), not just Amazon's docs.
 * Shared between the price/quantity patch (existing listings) and full listing creation. */
function buildOfferAndFulfillmentAttributes(price: number, quantity: number, mrp?: number) {
  return {
    purchasable_offer: [
      {
        marketplace_id: INDIA_MARKETPLACE_ID,
        currency: 'INR',
        audience: 'ALL',
        // purchasable_offer's own start_at/end_at (object-shaped: { value: "YYYY-MM-DD" }) are
        // distinct from and never tried before this — every earlier attempt only touched the
        // *nested* schedule.start_at inside maximum_seller_allowed_price, which the schema (per
        // /amazon/product-type-schema) confirms doesn't even have a start_at field. This top-level
        // one marks when the whole offer/pricing schedule takes effect; leaving it unset is the
        // one remaining unexplained difference from manual Seller Central submission (which
        // succeeds), so it's the next concrete thing to test before assuming Amazon auto-generates
        // a broken maximum_seller_allowed_price internally regardless of payload.
        start_at: { value: new Date().toISOString().slice(0, 10) },
        our_price: [{ schedule: [{ value_with_tax: price }] }],
        minimum_seller_allowed_price: [{ schedule: [{ value_with_tax: price }] }],
        maximum_seller_allowed_price: [{ schedule: [{ value_with_tax: price }] }],
        // maximum_retail_price is what Amazon Seller Support calls "list_price" in their own
        // troubleshooting language for this exact class of purchasable_offer validation error
        // (per a seller forum thread confirmed by an Amazon rep) — recurring "does not have the
        // expected value(s)" complaints on purchasable_offer sub-attributes that turned out to
        // actually be about a missing list_price, not the named attribute itself. Never
        // previously sent. Falls back to price when the listing has no separate MRP.
        ...(mrp ? { maximum_retail_price: [{ schedule: [{ value_with_tax: mrp }] }] } : {}),
      },
    ],
    fulfillment_availability: [{ fulfillment_channel_code: 'DEFAULT', quantity }],
  };
}

export async function updateAmazonListingPriceAndQuantity(
  uid: string,
  sellerId: string,
  sku: string,
  price: number,
  quantity: number,
  mrp?: number,
): Promise<PublishResult> {
  const { purchasable_offer, fulfillment_availability } = buildOfferAndFulfillmentAttributes(price, quantity, mrp);
  const params = new URLSearchParams({ marketplaceIds: INDIA_MARKETPLACE_ID });
  const response = await spApiFetch(uid, `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({
      productType: 'PRODUCT',
      patches: [
        { op: 'replace', path: '/attributes/purchasable_offer', value: purchasable_offer },
        { op: 'replace', path: '/attributes/fulfillment_availability', value: fulfillment_availability },
      ],
    }),
  });

  const body = await response.json() as ListingsPatchResponse;
  if (!response.ok || body.status === 'INVALID') {
    console.error('Amazon listing update failed', sku, response.status, JSON.stringify(body.issues));
    return { ok: false, issues: body.issues };
  }
  return { ok: true, issues: body.issues };
}

/** Creates a brand-new Amazon listing via putListingsItem. `attributes` should already contain
 * the product-type-specific required fields (item_name, brand, bullet_point, etc.) — this adds
 * purchasable_offer/fulfillment_availability from price/quantity so callers don't repeat that
 * shape, matching what the price/quantity patch above uses. */
export async function createAmazonListing(
  uid: string,
  sellerId: string,
  sku: string,
  productType: string,
  price: number,
  quantity: number,
  attributes: Record<string, unknown>,
  mrp?: number,
): Promise<PublishResult> {
  const params = new URLSearchParams({ marketplaceIds: INDIA_MARKETPLACE_ID });
  const response = await spApiFetch(uid, `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}?${params.toString()}`, {
    method: 'PUT',
    body: JSON.stringify({
      productType,
      requirements: 'LISTING',
      attributes: { ...attributes, ...buildOfferAndFulfillmentAttributes(price, quantity, mrp) },
    }),
  });

  const body = await response.json() as ListingsPatchResponse;
  if (!response.ok || body.status === 'INVALID') {
    console.error('Amazon listing creation failed', sku, response.status, JSON.stringify(body.issues));
    return { ok: false, issues: body.issues };
  }
  return { ok: true, issues: body.issues };
}

export interface ProductTypeSummary { name: string; displayName: string }

/** Searches Amazon's product type catalog by keyword — the first step in figuring out which
 * category-specific schema a new listing needs to conform to. */
export async function searchAmazonProductTypes(uid: string, keywords: string): Promise<ProductTypeSummary[]> {
  const params = new URLSearchParams({ marketplaceIds: INDIA_MARKETPLACE_ID, keywords });
  const response = await spApiFetch(uid, `/definitions/2020-09-01/productTypes?${params.toString()}`);
  if (!response.ok) {
    console.error('Amazon product type search failed', response.status, await response.text());
    throw new Error('Failed to search Amazon product types.');
  }
  const body = await response.json() as { productTypes?: Array<{ name: string; displayName: string }> };
  return body.productTypes || [];
}

/** Fetches the full JSON Schema for a given product type — this defines exactly which
 * attributes are required/optional to create a listing of that type. The definition endpoint
 * itself only returns a link to the actual schema document, which is downloaded separately
 * (same two-step pattern as the Reports API's document download). */
export async function getAmazonProductTypeSchema(uid: string, productType: string): Promise<any> {
  const params = new URLSearchParams({ marketplaceIds: INDIA_MARKETPLACE_ID, requirements: 'LISTING' });
  const response = await spApiFetch(uid, `/definitions/2020-09-01/productTypes/${encodeURIComponent(productType)}?${params.toString()}`);
  if (!response.ok) {
    console.error('Amazon get product type definition failed', productType, response.status, await response.text());
    throw new Error('Failed to fetch the Amazon product type definition.');
  }
  const body = await response.json() as { schema?: { link?: { resource?: string } } };
  const schemaUrl = body.schema?.link?.resource;
  if (!schemaUrl) throw new Error('Amazon product type definition response had no schema link.');

  // Try unauthenticated first (Reports API's document links are presigned S3 URLs needing no
  // Amazon auth) — fall back to an authenticated fetch if that's rejected, since it's unconfirmed
  // whether this particular link works the same way.
  let schemaResponse = await fetch(schemaUrl);
  if (!schemaResponse.ok) {
    schemaResponse = await spApiFetch(uid, schemaUrl.replace(SP_API_HOST, ''));
  }
  if (!schemaResponse.ok) {
    throw new Error('Failed to download the Amazon product type schema document.');
  }
  return schemaResponse.json();
}

interface CatalogItemImagesResponse {
  images?: Array<{ marketplaceId: string; images: Array<{ variant: string; link: string }> }>;
}

/** Looks up a single ASIN's main product image via the Catalog Items API — the merchant
 * listings report itself doesn't reliably carry images, so this is a separate lookup.
 * Rate limited by Amazon to 2 requests/second (burst 2); callers must space calls accordingly. */
export async function fetchCatalogItemImage(uid: string, asin: string): Promise<string | null> {
  const params = new URLSearchParams({ marketplaceIds: INDIA_MARKETPLACE_ID, includedData: 'images' });
  const response = await spApiFetch(uid, `/catalog/2022-04-01/items/${encodeURIComponent(asin)}?${params.toString()}`);
  if (!response.ok) {
    console.error('Amazon get catalog item failed', asin, response.status, await response.text());
    return null;
  }
  const body = await response.json() as CatalogItemImagesResponse;
  const marketplaceImages = body.images?.find((m) => m.marketplaceId === INDIA_MARKETPLACE_ID)?.images ?? body.images?.[0]?.images;
  const main = marketplaceImages?.find((img) => img.variant === 'MAIN') ?? marketplaceImages?.[0];
  return main?.link ?? null;
}
