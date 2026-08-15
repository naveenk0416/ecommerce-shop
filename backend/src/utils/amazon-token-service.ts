import { ensureConnected, MarketplaceConnection } from '../api/common.js';
import { encryptToken, decryptToken } from './token-crypto.js';

/** Thrown when a seller's Amazon authorization no longer works (revoked from Seller Central, or
 * the refresh token otherwise invalid) — callers should catch this specifically and surface a
 * "reconnect Amazon" prompt rather than a generic failure. */
export class AmazonReauthorizationRequiredError extends Error {
  constructor(public readonly uid: string) {
    super(`Amazon authorization for uid=${uid} is no longer valid and must be reconnected.`);
    this.name = 'AmazonReauthorizationRequiredError';
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// In-memory only — unlike AmazonAuthState (Mongo-backed, durability-critical for the OAuth
// handshake itself), this is purely a performance cache. Losing it on restart just costs one
// extra refresh call, not correctness, so it's fine at single-instance scale (see docs/security/00).
const accessTokenCache = new Map<string, CachedToken>();

// Amazon's access tokens last 3600s; refreshing at 55 minutes keeps a safety margin without
// wasting the token's useful lifetime.
const CACHE_TTL_MS = 55 * 60 * 1000;

/** Returns a valid Amazon SP-API access token for `uid`, refreshing (and caching) as needed.
 * Throws AmazonReauthorizationRequiredError if the stored refresh token is no longer valid. */
export async function getAccessToken(uid: string): Promise<string> {
  const cached = accessTokenCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  await ensureConnected();
  const connection = await MarketplaceConnection.findOne({ uid, marketplace: 'amazon', status: 'connected' });
  if (!connection || !connection.refreshTokenEnc) {
    throw new AmazonReauthorizationRequiredError(uid);
  }

  const clientId = process.env['AMAZON_LWA_CLIENT_ID'];
  const clientSecret = process.env['AMAZON_LWA_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error('Amazon integration is not configured (missing AMAZON_LWA_CLIENT_ID/SECRET).');
  }

  const refreshToken = decryptToken(connection.refreshTokenEnc);

  const response = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const body = await response.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };

  if (!response.ok) {
    if (body.error === 'invalid_grant') {
      connection.status = 'revoked';
      connection.revokedAt = new Date();
      connection.refreshTokenEnc = undefined;
      connection.accessTokenEnc = undefined;
      await connection.save();
      throw new AmazonReauthorizationRequiredError(uid);
    }
    // Never log token values themselves — only Amazon's own error code/description.
    console.error('Amazon token refresh failed', response.status, body.error, body.error_description);
    throw new Error(body.error_description || 'Failed to refresh Amazon access token.');
  }

  if (!body.access_token) {
    throw new Error('Amazon token refresh response did not include an access token.');
  }

  const expiresAt = Date.now() + CACHE_TTL_MS;
  accessTokenCache.set(uid, { accessToken: body.access_token, expiresAt });

  // Best-effort persistence of the current access token, for visibility/debugging — the cache
  // above is the source of truth callers actually read from.
  connection.accessTokenEnc = encryptToken(body.access_token);
  connection.accessTokenExpiresAt = new Date(Date.now() + (body.expires_in || 3600) * 1000);
  await connection.save();

  return body.access_token;
}

/** Clears a uid's cached access token — call after a manual disconnect/reconnect so a stale
 * cached token can't outlive the connection it belongs to. */
export function clearCachedAccessToken(uid: string): void {
  accessTokenCache.delete(uid);
}
