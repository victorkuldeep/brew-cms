import { createHash } from 'node:crypto';

/**
 * Produces a deterministic SHA-256 hash of the Content IR and metadata.
 * Keys in JSON objects are sorted recursively to guarantee canonical serialization.
 */
export function computeContentHash(data: unknown): string {
  const canonicalString = canonicalJsonStringify(data);
  return createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys
    .filter((k) => obj[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + canonicalJsonStringify(obj[k]));

  return '{' + pairs.join(',') + '}';
}
