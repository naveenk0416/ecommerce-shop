import express from 'express';
import crypto from 'crypto';
import { authMiddleware } from './auth.js';
import { ensureConnected, AmazonAuthState, MarketplaceConnection, Listing } from './common.js';
import { encryptToken } from '../utils/token-crypto.js';
import { clearCachedAccessToken as clearCachedAmazonAccessToken, AmazonReauthorizationRequiredError } from '../utils/amazon-token-service.js';
import { clearCachedAccessToken as clearCachedFlipkartAccessToken, FlipkartReauthorizationRequiredError } from '../utils/flipkart-token-service.js';
import { fetchMerchantListingsReport, fetchCatalogItemImage, updateAmazonListingPriceAndQuantity, searchAmazonProductTypes, getAmazonProductTypeSchema, createAmazonListing } from '../utils/amazon-sp-api.js';
import { fetchAllFlipkartListings, fetchFlipkartInventoryBySku, updateFlipkartListingPriceAndInventory } from '../utils/flipkart-listings-api.js';

const router = express.Router();
// Amazon redirects the seller's browser directly to these two paths, so they must exactly match
// what's registered as the "Login URI" and "Redirect URI" in the Solution Provider Portal — that
// registration is domain + path together, so these are mounted at the backend's true root in
// server.ts (app.use(amazonOAuthRouter)), not nested under /api/marketplace-connections like the
// rest of this file.
const amazonOAuthRouter = express.Router();

// Same reasoning as amazonOAuthRouter above — Flipkart's registered callback URL is
// domain + path together, so this is mounted at the backend's true root too.
const flipkartOAuthRouter = express.Router();

const STATE_TTL_MS = 10 * 60 * 1000;
// Amazon's authorization codes are short-lived; this is a defensive fast-fail checked against
// our own state doc's age before we even call Amazon's token endpoint; the code exchange itself
// happens immediately upon receiving the callback regardless, so this rarely triggers in practice.
const CODE_EXCHANGE_DEADLINE_MS = 5 * 60 * 1000;
const REAUTH_AFTER_MS = 11 * 30 * 24 * 60 * 60 * 1000; // ~11 months

// Draft app: authorization URIs must include version=beta. Once the app is published in the
// Solution Provider Portal, set AMAZON_APP_VERSION='' (explicitly empty, not just unset) to omit
// the param entirely — Amazon rejects it if it's still present post-publish. Leaving the var
// completely unset defaults to 'beta', which is the safe default for a still-draft app.
function appVersion(): string | null {
  const raw = process.env['AMAZON_APP_VERSION'];
  if (raw === undefined) return 'beta';
  return raw || null;
}

function backendUrl() {
  return (process.env['BACKEND_URL'] || 'http://localhost:4000').replace(/\/$/, '');
}

function frontendUrl() {
  const configured = (process.env['FRONTEND_URL'] || 'http://localhost:4200').split(',')[0].trim();
  return configured.replace(/\/$/, '');
}

function amazonCallbackRedirectUri() {
  return `${backendUrl()}/amazon/callback`;
}

function flipkartCallbackRedirectUri() {
  return `${backendUrl()}/flipkart/callback`;
}

async function createAuthState(uid: string): Promise<string> {
  const state = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  await AmazonAuthState.create({
    state,
    uid,
    createdAt: now,
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    used: false,
  });
  return state;
}

/** Atomically marks a state as used and returns it — the atomicity (single findOneAndUpdate,
 * not a separate find-then-update) is what prevents two concurrent callback requests for the
 * same state both succeeding (replay). Returns null if the state doesn't exist, is already
 * used, or has expired. */
async function consumeAuthState(state: string) {
  return AmazonAuthState.findOneAndUpdate(
    { state, used: false, expiresAt: { $gt: new Date() } },
    { used: true },
    { new: false },
  );
}

router.get('/', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;

  try {
    const connections = await MarketplaceConnection.find({
      uid: authUser._id.toString(),
      status: { $in: ['connected', 'revoked'] },
    }).lean();

    const byMarketplace: Record<string, any> = {};
    for (const c of connections) {
      if (c.status === 'revoked') {
        byMarketplace[c.marketplace] = { connected: false, revoked: true, configured: true };
        continue;
      }
      const connectedAt = c.connectedAt ? new Date(c.connectedAt) : null;
      byMarketplace[c.marketplace] = {
        connected: true,
        sellingPartnerId: c.sellingPartnerId,
        connectedAt: c.connectedAt,
        scopes: c.scopes,
        needsReauth: connectedAt ? Date.now() - connectedAt.getTime() > REAUTH_AFTER_MS : false,
      };
    }

    res.json({
      amazon: byMarketplace['amazon'] || { connected: false, configured: !!process.env['AMAZON_LWA_CLIENT_ID'] },
      flipkart: byMarketplace['flipkart'] || { connected: false, configured: !!process.env['FLIPKART_CLIENT_ID'] },
    });
  } catch (err: any) {
    console.error('List marketplace connections error', err);
    res.status(500).json({ error: 'Failed to load marketplace connections' });
  }
});

// Entry point 1 of 2 (seller-initiated): our own "Connect Amazon" button calls this first, then
// navigates the browser to the returned URL. A raw browser navigation can't carry our Bearer
// auth header, which is why this is a JSON-returning POST rather than the redirect itself.
router.post('/amazon/connect', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;

  const appId = process.env['AMAZON_APP_ID'];
  const clientId = process.env['AMAZON_LWA_CLIENT_ID'];
  if (!appId || !clientId) {
    res.status(503).json({ error: 'Amazon integration is not configured yet. Add AMAZON_APP_ID and AMAZON_LWA_CLIENT_ID to the backend environment.' });
    return;
  }

  await ensureConnected();
  const state = await createAuthState(authUser._id.toString());

  const sellerCentralHost = process.env['AMAZON_SELLER_CENTRAL_HOST'] || 'sellercentral.amazon.in';
  const authorizeUrl = new URL(`https://${sellerCentralHost}/apps/authorize/consent`);
  authorizeUrl.searchParams.set('application_id', appId);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('redirect_uri', amazonCallbackRedirectUri());
  const version = appVersion();
  if (version) authorizeUrl.searchParams.set('version', version);

  res.json({ authorizeUrl: authorizeUrl.toString() });
});

// Entry point 2 of 2 (Amazon-initiated): reached when a seller who already has the app installed
// clicks through from Seller Central's Partner Network / "Manage" page. Amazon redirects the
// seller's browser here with amazon_callback_uri/amazon_state/selling_partner_id — this is a raw
// browser navigation, so (unlike our own routes) we cannot require a Bearer header on it. If the
// seller isn't currently logged in on this browser, we hand off to the frontend's login screen
// with the pending params preserved, and the frontend resumes via /amazon/resume-login once
// authenticated.
amazonOAuthRouter.get('/amazon/login', async (req, res) => {
  const { amazon_callback_uri, amazon_state, selling_partner_id, version } = req.query as Record<string, string>;

  if (!amazon_callback_uri || !amazon_state) {
    res.status(400).send('Missing required Amazon parameters (amazon_callback_uri, amazon_state).');
    return;
  }

  const resumeUrl = new URL(`${frontendUrl()}/`);
  resumeUrl.searchParams.set('amazonLogin', '1');
  resumeUrl.searchParams.set('amazon_callback_uri', amazon_callback_uri);
  resumeUrl.searchParams.set('amazon_state', amazon_state);
  if (selling_partner_id) resumeUrl.searchParams.set('selling_partner_id', selling_partner_id);
  if (version) resumeUrl.searchParams.set('version', version);

  res.redirect(resumeUrl.toString());
});

// Called by the frontend (authenticated, via fetch — not a raw navigation) once the seller is
// confirmed logged in, to complete the Amazon-initiated flow from /amazon/login. Returns the URL
// to send the browser to next; the frontend does the actual window.location.href navigation,
// since redirecting Amazon's own amazon_callback_uri needs to happen as a top-level browser
// navigation for Amazon's consent page to load correctly.
router.post('/amazon/resume-login', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const { amazonCallbackUri, amazonState } = req.body || {};

  if (!amazonCallbackUri || !amazonState) {
    res.status(400).json({ error: 'Missing amazonCallbackUri or amazonState.' });
    return;
  }

  let parsedCallback: URL;
  try {
    parsedCallback = new URL(amazonCallbackUri);
  } catch {
    res.status(400).json({ error: 'Invalid amazonCallbackUri.' });
    return;
  }
  // Amazon's own callback URIs are always on an amazon.* host — refuse to build a redirect
  // toward anything else, since this value ultimately comes from a query string.
  if (!/(^|\.)amazon\.[a-z.]+$/i.test(parsedCallback.hostname)) {
    res.status(400).json({ error: 'Unexpected amazonCallbackUri host.' });
    return;
  }

  await ensureConnected();
  const state = await createAuthState(authUser._id.toString());

  parsedCallback.searchParams.set('amazon_state', amazonState);
  parsedCallback.searchParams.set('state', state);
  parsedCallback.searchParams.set('redirect_uri', amazonCallbackRedirectUri());
  const version = appVersion();
  if (version) parsedCallback.searchParams.set('version', version);

  res.json({ redirectUrl: parsedCallback.toString() });
});

amazonOAuthRouter.get('/amazon/callback', async (req, res) => {
  const { spapi_oauth_code: code, state, selling_partner_id: sellingPartnerId, error: oauthError } = req.query as Record<string, string>;

  const redirectWithResult = (result: 'connected' | 'error', message?: string) => {
    const url = new URL(`${frontendUrl()}/home`);
    url.searchParams.set('amazon', result);
    if (message) url.searchParams.set('message', message);
    res.redirect(url.toString());
  };

  if (oauthError) {
    redirectWithResult('error', 'Authorization was cancelled or denied.');
    return;
  }

  if (!code || !state) {
    redirectWithResult('error', 'Missing authorization code from Amazon.');
    return;
  }

  await ensureConnected();
  const pending = await consumeAuthState(state);
  if (!pending) {
    redirectWithResult('error', 'This authorization link has expired or was already used. Please try connecting again.');
    return;
  }

  if (Date.now() - pending.createdAt.getTime() > CODE_EXCHANGE_DEADLINE_MS) {
    redirectWithResult('error', 'Authorization took too long to complete. Please try connecting again.');
    return;
  }

  const clientId = process.env['AMAZON_LWA_CLIENT_ID'];
  const clientSecret = process.env['AMAZON_LWA_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    redirectWithResult('error', 'Amazon integration is not fully configured on the server.');
    return;
  }

  try {
    const tokenResponse = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: amazonCallbackRedirectUri(),
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenBody = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

    if (!tokenResponse.ok || !tokenBody.refresh_token || !tokenBody.access_token) {
      // Never log tokenBody wholesale — it may contain a valid access/refresh token even
      // alongside an error in some edge responses. Log only Amazon's own error fields.
      console.error('Amazon token exchange failed', tokenResponse.status, tokenBody.error, tokenBody.error_description);
      redirectWithResult('error', tokenBody.error_description || 'Failed to complete Amazon authorization.');
      return;
    }

    const now = new Date();
    await MarketplaceConnection.findOneAndUpdate(
      { uid: pending.uid, marketplace: 'amazon' },
      {
        uid: pending.uid,
        marketplace: 'amazon',
        status: 'connected',
        sellingPartnerId: sellingPartnerId || undefined,
        refreshTokenEnc: encryptToken(tokenBody.refresh_token),
        accessTokenEnc: encryptToken(tokenBody.access_token),
        accessTokenExpiresAt: new Date(now.getTime() + (tokenBody.expires_in || 3600) * 1000),
        region: process.env['AMAZON_SELLER_CENTRAL_HOST'] || 'sellercentral.amazon.in',
        connectedAt: now,
        disconnectedAt: undefined,
        revokedAt: undefined,
      },
      { upsert: true, new: true },
    );
    clearCachedAmazonAccessToken(pending.uid);

    redirectWithResult('connected');
  } catch (err: any) {
    console.error('Amazon callback error', err);
    redirectWithResult('error', 'Something went wrong completing Amazon authorization.');
  }
});

// Pulls the seller's full Amazon catalog via the Reports API (GET_MERCHANT_LISTINGS_ALL_DATA)
// and upserts each row into the Listing collection — the same collection that already backs the
// Inventory page — keyed by {uid, sku} so re-running this updates existing rows instead of
// duplicating them.
router.post('/amazon/sync-inventory', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();

  await ensureConnected();
  try {
    const rows = await fetchMerchantListingsReport(uid, 'GET_MERCHANT_LISTINGS_ALL_DATA');

    let imported = 0;
    let updated = 0;
    for (const row of rows) {
      const sku = row['seller-sku'];
      if (!sku) continue;

      const price = parseFloat(row['price'] || '') || 0;
      const quantity = parseInt(row['quantity'] || '', 10) || 0;

      const alreadyExists = await Listing.exists({ uid, sku });
      // $set, not a plain replacement object — a bare update doc replaces the entire document in
      // MongoDB, which would wipe out costPrice/hsnCode/gstRate/etc. the seller edited by hand
      // after a previous sync.
      const setFields: Record<string, unknown> = {
        uid,
        sku,
        asin: row['asin1'] || undefined,
        source: 'amazon',
        name: row['item-name'] || sku,
        description: row['item-description'] || '',
        quantity,
        sellingPrice: price,
        priceINR: `₹${price}`,
        listingStatus: row['status'] || undefined,
      };
      // The report's own image-url column is reliably empty in practice — omitted (rather than
      // set to '') so it never overwrites an image the catalog-image backfill below already
      // filled in on a previous sync.
      if (row['image-url']) setFields['originalImage'] = row['image-url'];

      await Listing.findOneAndUpdate({ uid, sku }, { $set: setFields }, { upsert: true });
      if (alreadyExists) updated += 1;
      else imported += 1;
    }

    // Best-effort image backfill via the Catalog Items API, since the report above essentially
    // never carries images. Amazon rate-limits this endpoint to 2 req/s (burst 2), and a large
    // catalog could otherwise blow the request past typical reverse-proxy timeouts — so this is
    // capped both by count and by a time budget, and skips ASINs whose listing already has an
    // image (from a previous sync's backfill) so repeat syncs don't burn calls re-fetching them.
    const IMAGE_FETCH_LIMIT = 30;
    const IMAGE_FETCH_TIME_BUDGET_MS = 25 * 1000;
    const IMAGE_FETCH_SPACING_MS = 600; // safely under 2 req/s

    const asinsInBatch = Array.from(new Set(rows.map((r) => r['asin1']).filter(Boolean)));
    const listingsNeedingImage = await Listing.find({
      uid,
      source: 'amazon',
      asin: { $in: asinsInBatch },
      $or: [{ originalImage: { $exists: false } }, { originalImage: '' }],
    }).select('asin').lean() as any[];
    const asinsNeedingImage: string[] = Array.from(new Set<string>(listingsNeedingImage.map((l: any) => l.asin as string).filter(Boolean))).slice(0, IMAGE_FETCH_LIMIT);

    let imagesFetched = 0;
    const imageDeadline = Date.now() + IMAGE_FETCH_TIME_BUDGET_MS;
    for (const asin of asinsNeedingImage) {
      if (Date.now() > imageDeadline) break;
      const imageUrl = await fetchCatalogItemImage(uid, asin);
      if (imageUrl) {
        await Listing.updateMany({ uid, asin }, { $set: { originalImage: imageUrl } });
        imagesFetched += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, IMAGE_FETCH_SPACING_MS));
    }

    res.json({ imported, updated, total: rows.length, imagesFetched });
  } catch (err: any) {
    if (err instanceof AmazonReauthorizationRequiredError) {
      res.status(409).json({ error: 'Your Amazon authorization is no longer valid. Please reconnect Amazon and try again.' });
      return;
    }
    console.error('Amazon inventory sync error', err);
    res.status(500).json({ error: err?.message || 'Failed to sync Amazon inventory.' });
  }
});

// Same idea as the Amazon sync above, pulling from Flipkart's Listing Management API instead —
// upserts into the same Listing collection, keyed by {uid, sku}, tagged source: 'flipkart'.
router.post('/flipkart/sync-inventory', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();

  await ensureConnected();
  try {
    const items = await fetchAllFlipkartListings(uid);
    const skus = items.map((item) => item.sku).filter(Boolean);
    const inventoryDetails = await fetchFlipkartInventoryBySku(uid, skus);

    let imported = 0;
    let updated = 0;
    for (const item of items) {
      const sku = item.sku;
      if (!sku) continue;

      const price = item.product_description?.ssp || item.product_description?.mrp || 0;
      const detail = inventoryDetails.get(sku);

      const alreadyExists = await Listing.exists({ uid, sku });
      await Listing.findOneAndUpdate(
        { uid, sku },
        {
          $set: {
            uid,
            sku,
            flipkartProductId: item.productId || undefined,
            flipkartLocationId: detail?.locationId || undefined,
            source: 'flipkart',
            name: item.product_name || sku,
            quantity: detail?.quantity ?? 0,
            sellingPrice: price,
            mrp: item.product_description?.mrp || price,
            priceINR: `₹${price}`,
            originalImage: item.product_image_url || '',
            listingStatus: item.status || undefined,
          },
        },
        { upsert: true },
      );
      if (alreadyExists) updated += 1;
      else imported += 1;
    }

    res.json({ imported, updated, total: items.length });
  } catch (err: any) {
    if (err instanceof FlipkartReauthorizationRequiredError) {
      res.status(409).json({ error: 'Your Flipkart authorization is no longer valid. Please reconnect Flipkart and try again.' });
      return;
    }
    console.error('Flipkart inventory sync error', err);
    res.status(500).json({ error: err?.message || 'Failed to sync Flipkart inventory.' });
  }
});

// TEMPORARY: inspection endpoints for scoping the "create a new Amazon listing" feature —
// let us see a real product type's actual required attributes instead of guessing from
// documentation. Remove once that feature's payload shape is settled.
router.get('/amazon/product-types', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();
  const keywords = String(req.query['keywords'] || '');
  if (!keywords) {
    res.status(400).json({ error: 'Missing keywords query param.' });
    return;
  }
  try {
    const productTypes = await searchAmazonProductTypes(uid, keywords);
    res.json({ productTypes });
  } catch (err: any) {
    console.error('Amazon product type search error', err);
    res.status(500).json({ error: err?.message || 'Failed to search product types.' });
  }
});

router.get('/amazon/product-type-schema', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();
  const productType = String(req.query['productType'] || '');
  if (!productType) {
    res.status(400).json({ error: 'Missing productType query param.' });
    return;
  }
  try {
    const schema = await getAmazonProductTypeSchema(uid, productType) as any;
    const properties = schema?.properties || {};
    const required: string[] = schema?.required || [];

    // ?listAllNames=true returns just the full property name list — cheap and authoritative,
    // for finding an attribute's real name by searching rather than guessing snake_case
    // conversions of Amazon's human-readable error labels (several guesses have been wrong).
    if (req.query['listAllNames'] === 'true') {
      res.json({ productType, allPropertyNames: Object.keys(properties).sort() });
      return;
    }

    const summarizeFields = (itemProps: Record<string, any>) => Object.keys(itemProps).map((k) => {
      const field = itemProps[k] || {};
      const nested = field.type === 'object' && field.properties ? field.properties : null;
      return {
        name: k,
        type: field.type,
        enum: field.enum,
        description: field.description,
        // One more level for object-typed sub-fields (e.g. item_dimensions.length is itself an
        // object with its own value/unit) — avoids yet another round trip for those.
        nestedFields: nested ? summarizeFields(nested) : undefined,
      };
    });

    // Each attribute's value is an array of objects (e.g. item_name -> [{ value, language_tag }])
    // — this pulls out that object's own sub-fields, falling back to the first oneOf variant if
    // the schema expresses it that way instead of a flat properties object (Amazon's schemas mix
    // both styles across attributes).
    const summarizeAttribute = (key: string) => {
      const prop = properties[key];
      if (!prop) return { name: key, missing: true };
      const itemSchema = prop.items?.properties ? prop.items : prop.items?.oneOf?.[0];
      const itemProps = itemSchema?.properties || {};
      return {
        name: key,
        type: prop.type,
        description: prop.description,
        oneOfVariantCount: prop.items?.oneOf?.length,
        itemRequired: itemSchema?.required,
        fields: summarizeFields(itemProps),
      };
    };

    // Always include purchasable_offer/fulfillment_availability even though the schema doesn't
    // mark them "required" — a listing needs a price and stock to actually be sellable. An
    // explicit ?attributes= list adds more (or replaces required entirely with ?required=false)
    // — useful for inspecting attributes Amazon's real submission validation flagged as missing
    // that weren't in the schema's own declared "required" array (a known gap between the two).
    const extraAttributes = String(req.query['attributes'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const baseNames = req.query['required'] === 'false' ? [] : required;
    const attributeNames = Array.from(new Set([...baseNames, ...extraAttributes, 'purchasable_offer', 'fulfillment_availability']));
    const attributes = attributeNames.map(summarizeAttribute);

    res.json({ productType, required, attributes, totalProperties: Object.keys(properties).length });
  } catch (err: any) {
    console.error('Amazon product type schema error', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch product type schema.' });
  }
});

// Creates a brand-new Amazon listing for a manually-added product that doesn't exist there yet
// (as opposed to the publish route below, which only updates price/quantity on a listing that
// already exists). The seller supplies the category-specific required attributes via the
// product-type-schema endpoint above; this fills in price/quantity from the Listing itself and
// submits via putListingsItem. On success, the Listing is tagged source: 'amazon' with the new
// sku, so it behaves like a synced listing for future price/stock publishes.
router.post('/amazon/create-listing/:listingId', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();
  const { productType, attributes } = req.body || {};

  // Deliberately no per-attribute-name validation here — the frontend already shaped each
  // attribute's value array (including whether it needs language_tag) using the same product
  // type schema this route's sibling /amazon/product-type-schema exposes, so this stays generic
  // across whatever product type the seller picked rather than hardcoding a handful of names.
  if (!productType || !attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    res.status(400).json({ error: 'Missing productType or attributes for the Amazon listing.' });
    return;
  }

  await ensureConnected();
  try {
    const listing = await Listing.findOne({ _id: req.params['listingId'], uid });
    if (!listing) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const connection = await MarketplaceConnection.findOne({ uid, marketplace: 'amazon', status: 'connected' });
    if (!connection?.sellingPartnerId) {
      res.status(409).json({ error: 'Your Amazon Selling Partner ID is missing — please reconnect Amazon and try again.' });
      return;
    }

    const sku: string = listing.sku || `sa-${listing._id.toString()}`;

    const result = await createAmazonListing(
      uid,
      connection.sellingPartnerId,
      sku,
      String(productType),
      listing.sellingPrice || 0,
      listing.quantity || 0,
      attributes,
    );

    if (!result.ok) {
      // Amazon's issue objects name the exact offending attribute(s) in `attributeNames` — surfaced
      // alongside the human-readable message so a rejection points at a real attribute name instead
      // of forcing a guess from the (often ambiguous) label, e.g. "'Lifestyle' is required" alone
      // doesn't say whether that's `lifestyle_image_locator` or something else.
      const detail = (result.issues || [])
        .map((i) => (i.attributeNames?.length ? `${i.message} [${i.attributeNames.join(', ')}]` : i.message))
        .filter(Boolean)
        .join('; ');
      res.status(422).json({ error: detail ? `Amazon rejected the listing: ${detail}` : 'Amazon rejected the listing.' });
      return;
    }

    await Listing.findOneAndUpdate({ _id: listing._id }, { $set: { sku, source: 'amazon', listingStatus: 'ACTIVE' } });
    res.json({ ok: true, sku });
  } catch (err: any) {
    if (err instanceof AmazonReauthorizationRequiredError) {
      res.status(409).json({ error: 'Your Amazon authorization is no longer valid. Please reconnect Amazon and try again.' });
      return;
    }
    console.error('Amazon create listing error', err);
    res.status(500).json({ error: err?.message || 'Failed to create the Amazon listing.' });
  }
});

// Pushes a Listing's currently-saved price/quantity back to whichever marketplace it was synced
// from. Only meaningful for listings with source: 'amazon' (i.e. ones that already exist there
// with a known sku) — creating a brand-new marketplace listing from scratch needs far more data
// (category-specific attributes, GTIN, shipping info) than this app collects today.
router.post('/amazon/publish/:listingId', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();

  await ensureConnected();
  try {
    const listing = await Listing.findOne({ _id: req.params['listingId'], uid });
    if (!listing || listing.source !== 'amazon' || !listing.sku) {
      res.status(400).json({ error: 'This product was not synced from Amazon, so there is nothing to publish it to.' });
      return;
    }

    const connection = await MarketplaceConnection.findOne({ uid, marketplace: 'amazon', status: 'connected' });
    if (!connection?.sellingPartnerId) {
      res.status(409).json({ error: 'Your Amazon Selling Partner ID is missing — please reconnect Amazon and try again.' });
      return;
    }

    const result = await updateAmazonListingPriceAndQuantity(
      uid,
      connection.sellingPartnerId,
      listing.sku,
      listing.sellingPrice || 0,
      listing.quantity || 0,
    );

    if (!result.ok) {
      const detail = (result.issues || [])
        .map((i) => (i.attributeNames?.length ? `${i.message} [${i.attributeNames.join(', ')}]` : i.message))
        .filter(Boolean)
        .join('; ');
      res.status(422).json({ error: detail ? `Amazon rejected the update: ${detail}` : 'Amazon rejected the update.' });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof AmazonReauthorizationRequiredError) {
      res.status(409).json({ error: 'Your Amazon authorization is no longer valid. Please reconnect Amazon and try again.' });
      return;
    }
    console.error('Amazon publish error', err);
    res.status(500).json({ error: err?.message || 'Failed to publish to Amazon.' });
  }
});

// Same idea for Flipkart — needs flipkartProductId + flipkartLocationId, both captured during a
// prior "Sync from Flipkart" run.
router.post('/flipkart/publish/:listingId', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();

  await ensureConnected();
  try {
    const listing = await Listing.findOne({ _id: req.params['listingId'], uid });
    if (!listing || listing.source !== 'flipkart' || !listing.sku || !listing.flipkartProductId || !listing.flipkartLocationId) {
      res.status(400).json({ error: 'This product is missing Flipkart details needed to publish — try running "Sync from Flipkart" again first.' });
      return;
    }

    const sellingPrice = listing.sellingPrice || 0;
    const result = await updateFlipkartListingPriceAndInventory(
      uid,
      listing.sku,
      listing.flipkartProductId,
      listing.mrp || sellingPrice,
      sellingPrice,
      listing.flipkartLocationId,
      listing.quantity || 0,
    );

    if (!result.ok) {
      const detail = (result.issues || []).map((i) => i.description).filter(Boolean).join('; ');
      res.status(422).json({ error: detail ? `Flipkart rejected the update: ${detail}` : 'Flipkart rejected the update.' });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof FlipkartReauthorizationRequiredError) {
      res.status(409).json({ error: 'Your Flipkart authorization is no longer valid. Please reconnect Flipkart and try again.' });
      return;
    }
    console.error('Flipkart publish error', err);
    res.status(500).json({ error: err?.message || 'Failed to publish to Flipkart.' });
  }
});

// Flipkart's "Authorization Code Flow (For Third Party Application)" — same shape as Amazon's
// seller-initiated entry point above (JSON-returning POST, since a raw navigation can't carry
// our Bearer header). Flipkart has no Amazon-style "app is installed, seller clicks Manage"
// second entry point, so this is the only way in.
router.post('/flipkart/connect', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;

  const clientId = process.env['FLIPKART_CLIENT_ID'];
  if (!clientId) {
    res.status(503).json({ error: 'Flipkart integration is not configured yet. Add FLIPKART_CLIENT_ID and FLIPKART_CLIENT_SECRET to the backend environment.' });
    return;
  }

  await ensureConnected();
  const state = await createAuthState(authUser._id.toString());

  const authorizeUrl = new URL('https://api.flipkart.net/oauth-service/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', flipkartCallbackRedirectUri());
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'Seller_Api');
  authorizeUrl.searchParams.set('state', state);

  res.json({ authorizeUrl: authorizeUrl.toString() });
});

flipkartOAuthRouter.get('/flipkart/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  const redirectWithResult = (result: 'connected' | 'error', message?: string) => {
    const url = new URL(`${frontendUrl()}/home`);
    url.searchParams.set('flipkart', result);
    if (message) url.searchParams.set('message', message);
    res.redirect(url.toString());
  };

  if (oauthError) {
    redirectWithResult('error', 'Authorization was cancelled or denied.');
    return;
  }

  if (!code || !state) {
    redirectWithResult('error', 'Missing authorization code from Flipkart.');
    return;
  }

  await ensureConnected();
  const pending = await consumeAuthState(state);
  if (!pending) {
    redirectWithResult('error', 'This authorization link has expired or was already used. Please try connecting again.');
    return;
  }

  if (Date.now() - pending.createdAt.getTime() > CODE_EXCHANGE_DEADLINE_MS) {
    redirectWithResult('error', 'Authorization took too long to complete. Please try connecting again.');
    return;
  }

  const clientId = process.env['FLIPKART_CLIENT_ID'];
  const clientSecret = process.env['FLIPKART_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    redirectWithResult('error', 'Flipkart integration is not fully configured on the server.');
    return;
  }

  try {
    // Flipkart authenticates the token exchange via HTTP Basic (base64 clientId:clientSecret),
    // not a client_secret body param like Amazon — and it's a GET with the params on the query
    // string, per Flipkart's own curl examples (no POST body).
    const tokenUrl = new URL('https://api.flipkart.net/oauth-service/oauth/token');
    tokenUrl.searchParams.set('redirect_uri', flipkartCallbackRedirectUri());
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('state', state);
    tokenUrl.searchParams.set('code', code);

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(tokenUrl.toString(), {
      method: 'GET',
      headers: { Authorization: `Basic ${basicAuth}` },
    });

    const tokenBody = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

    if (!tokenResponse.ok || !tokenBody.refresh_token || !tokenBody.access_token) {
      // Never log tokenBody wholesale — it may contain a valid access/refresh token even
      // alongside an error in some edge responses. Log only Flipkart's own error fields.
      console.error('Flipkart token exchange failed', tokenResponse.status, tokenBody.error, tokenBody.error_description);
      redirectWithResult('error', tokenBody.error_description || 'Failed to complete Flipkart authorization.');
      return;
    }

    const now = new Date();
    await MarketplaceConnection.findOneAndUpdate(
      { uid: pending.uid, marketplace: 'flipkart' },
      {
        uid: pending.uid,
        marketplace: 'flipkart',
        status: 'connected',
        refreshTokenEnc: encryptToken(tokenBody.refresh_token),
        accessTokenEnc: encryptToken(tokenBody.access_token),
        accessTokenExpiresAt: new Date(now.getTime() + (tokenBody.expires_in || 0) * 1000),
        scopes: tokenBody.scope ? tokenBody.scope.split(',') : [],
        connectedAt: now,
        disconnectedAt: undefined,
        revokedAt: undefined,
      },
      { upsert: true, new: true },
    );

    clearCachedFlipkartAccessToken(pending.uid);

    redirectWithResult('connected');
  } catch (err: any) {
    console.error('Flipkart callback error', err);
    redirectWithResult('error', ' went wrong completing Flipkart authorization.');
  }
});

router.delete('/:marketplace', authMiddleware, async (req, res) => {
  await ensureConnected();
  const authUser = (req as any).authUser;
  const marketplace = String(req.params['marketplace']);

  if (!['amazon', 'flipkart'].includes(marketplace)) {
    res.status(400).json({ error: 'Unknown marketplace' });
    return;
  }

  try {
    await MarketplaceConnection.findOneAndUpdate(
      { uid: authUser._id.toString(), marketplace },
      {
        status: 'disconnected',
        refreshTokenEnc: undefined,
        accessTokenEnc: undefined,
        disconnectedAt: new Date(),
      },
    );
    if (marketplace === 'amazon') clearCachedAmazonAccessToken(authUser._id.toString());
    else if (marketplace === 'flipkart') clearCachedFlipkartAccessToken(authUser._id.toString());
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Disconnect marketplace error', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;
export { amazonOAuthRouter, flipkartOAuthRouter };
