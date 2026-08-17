import { ensureConnected, MarketplaceConnection } from '../api/common.js';
import { encryptToken, decryptToken } from './token-crypto.js';

/** Thrown when a seller's Flipkart authorization no longer works (revoked, or the refresh token
 * otherwise invalid/expired) — callers should catch this specifically and surface a "reconnect
 * Flipkart" prompt rather than a generic failure. */
export class FlipkartReauthorizationRequiredError extends Error {
  constructor(public readonly uid: string) {
    super(`Flipkart authorization for uid=${uid} is no longer valid and must be reconnected.`);
    this.name = 'FlipkartReauthorizationRequiredError';
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// In-memory only — see the equivalent note in amazon-token-service.ts. Losing it on restart just
// costs one extra refresh call, not correctness.
const accessTokenCache = new Map<string, CachedToken>();

// Safety margin subtracted from Flipkart's own expires_in (~60 days) before caching, so a cached
// token never gets used right up against its real expiry across a redeploy/restart gap.
const EXPIRY_SAFETY_MARGIN_MS = 24 * 60 * 60 * 1000;

/** Returns a valid Flipkart Seller API access token for `uid`, refreshing (and caching) as
 * needed. Throws FlipkartReauthorizationRequiredError if the stored refresh token is no longer
 * valid. */
export async function getAccessToken(uid: string): Promise<string> {
  const cached = accessTokenCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  await ensureConnected();
  const connection = await MarketplaceConnection.findOne({ uid, marketplace: 'flipkart', status: 'connected' });
  if (!connection || !connection.refreshTokenEnc) {
    throw new FlipkartReauthorizationRequiredError(uid);
  }

  const clientId = process.env['FLIPKART_CLIENT_ID'];
  const clientSecret = process.env['FLIPKART_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error('Flipkart integration is not configured (missing FLIPKART_CLIENT_ID/SECRET).');
  }

  const refreshToken = decryptToken(connection.refreshTokenEnc);

  const tokenUrl = new URL('https://api.flipkart.net/oauth-service/oauth/token');
  tokenUrl.searchParams.set('grant_type', 'refresh_token');
  tokenUrl.searchParams.set('refresh_token', refreshToken);

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(tokenUrl.toString(), {
    method: 'GET',
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

  if (!response.ok) {
    // Flipkart's flow follows standard OAuth2 semantics (their docs link straight to oauth.com);
    // a 400/401 here means the refresh token itself is no longer valid, not a transient failure.
    if (response.status === 400 || response.status === 401) {
      connection.status = 'revoked';
      connection.revokedAt = new Date();
      connection.refreshTokenEnc = undefined;
      connection.accessTokenEnc = undefined;
      await connection.save();
      throw new FlipkartReauthorizationRequiredError(uid);
    }
    // Never log token values themselves — only Flipkart's own error code/description.
    console.error('Flipkart token refresh failed', response.status, body.error, body.error_description);
    throw new Error(body.error_description || 'Failed to refresh Flipkart access token.');
  }

  if (!body.access_token) {
    throw new Error('Flipkart token refresh response did not include an access token.');
  }

  const expiresInMs = (body.expires_in || 0) * 1000;
  const expiresAt = Date.now() + Math.max(expiresInMs - EXPIRY_SAFETY_MARGIN_MS, 0);
  accessTokenCache.set(uid, { accessToken: body.access_token, expiresAt });

  // Flipkart rotates the refresh token on each use (see the "Proactive Refresh Token Renewal"
  // note in their docs) — unlike Amazon's, the previous one may already be invalid, so this must
  // be re-persisted on every refresh, not just the access token.
  connection.accessTokenEnc = encryptToken(body.access_token);
  connection.accessTokenExpiresAt = new Date(Date.now() + expiresInMs);
  if (body.refresh_token) {
    connection.refreshTokenEnc = encryptToken(body.refresh_token);
  }
  await connection.save();

  return body.access_token;
}

/** Clears a uid's cached access token — call after a manual disconnect/reconnect so a stale
 * cached token can't outlive the connection it belongs to. */
export function clearCachedAccessToken(uid: string): void {
  accessTokenCache.delete(uid);
}
