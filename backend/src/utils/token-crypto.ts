import crypto from 'crypto';

// Marketplace OAuth refresh tokens are Restricted-classification data (see docs/security/05) —
// hashing (as used for passwords/reset tokens) isn't appropriate here because these tokens must
// be recovered in plaintext to call the marketplace's API, so they're symmetrically encrypted
// at rest instead. Requires a 32-byte key in TOKEN_ENCRYPTION_KEY (base64 or hex).
const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env['TOKEN_ENCRYPTION_KEY'];
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured. Set a 32-byte base64 key in the backend .env file.');
  }
  const key = Buffer.from(raw, raw.length === 64 ? 'hex' : 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  return key;
}

/** Encrypts `plaintext`, returning `iv:authTag:ciphertext` (all hex) as a single string safe to
 * store in a single database field. */
export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptToken(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted token value.');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
