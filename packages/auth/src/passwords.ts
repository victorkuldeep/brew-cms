import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Hashes a plaintext password using crypto.scrypt with a unique random salt.
 * Stored format: <salt_hex>:<hash_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored <salt>:<hash> string in constant time.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, originalHash] = parts;
  const originalKey = Buffer.from(originalHash, 'hex');

  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  if (derivedKey.length !== originalKey.length) return false;

  return timingSafeEqual(derivedKey, originalKey);
}
