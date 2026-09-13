import { ValidationError } from './domain/errors.js';

/**
 * Opaque cursor pagination (Charter Phase 1: prefer cursors on
 * automation-facing list endpoints).
 *
 * A cursor is base64url(JSON({ t: <ISO timestamp>, id: <row id> })) naming
 * the last row of the previous page. Repositories apply it as a keyset
 * predicate matching their DESC ordering, which keeps pages stable when
 * rows are inserted between requests (unlike OFFSET).
 */
export interface PageCursor {
  t: string;
  id: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}

export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: unknown): PageCursor {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) {
    throw new ValidationError('Invalid pagination cursor.');
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<PageCursor>;
    if (typeof parsed?.t !== 'string' || typeof parsed?.id !== 'string' || !parsed.t || !parsed.id) {
      throw new ValidationError('Invalid pagination cursor.');
    }
    return { t: parsed.t, id: parsed.id };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Invalid pagination cursor.');
  }
}
