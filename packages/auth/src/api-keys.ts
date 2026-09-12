import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export interface GeneratedApiKey {
  plaintextKey: string;
  keyHash: string;
  prefix: string;
}

/**
 * Generates an API key: `brew_<prefix>_<32_random_bytes_hex>`
 * Returns both the plaintext key (displayed once to user) and SHA-256 hash (for database storage).
 */
export function generateApiKey(prefix: 'live' | 'agent' | 'test' = 'live'): GeneratedApiKey {
  const token = randomBytes(24).toString('base64url');
  const plaintextKey = `brew_${prefix}_${token}`;
  const keyHash = hashApiKey(plaintextKey);

  return {
    plaintextKey,
    keyHash,
    prefix,
  };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function verifyApiKey(plaintextKey: string, storedHash: string): boolean {
  const hash = hashApiKey(plaintextKey);
  const hashBuf = Buffer.from(hash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');

  if (hashBuf.length !== storedBuf.length) return false;
  return timingSafeEqual(hashBuf, storedBuf);
}
