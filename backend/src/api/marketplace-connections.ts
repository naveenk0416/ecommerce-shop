import express from 'express';
import crypto from 'crypto';
import { authMiddleware } from './auth.js';
import { ensureConnected, AmazonAuthState, MarketplaceConnection } from './common.js';
import { encryptToken } from '../utils/token-crypto.js';
import { clearCachedAccessToken as clearCachedAmazonAccessToken } from '../utils/amazon-token-service.js';
import { clearCachedAccessToken as clearCachedFlipkartAccessToken } from '../utils/flipkart-token-service.js';

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
    redirectWithResult('error', 'Something went wrong completing Flipkart authorization.');
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
