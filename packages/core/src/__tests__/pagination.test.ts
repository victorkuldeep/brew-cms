import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../pagination.js';
import { ValidationError } from '../domain/errors.js';

describe('cursor pagination primitives', () => {
  it('round-trips through base64url without padding', () => {
    const encoded = encodeCursor({ t: '2026-09-12T12:00:00.000Z', id: 'doc_1' });
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(decodeCursor(encoded)).toEqual({ t: '2026-09-12T12:00:00.000Z', id: 'doc_1' });
  });

  it('rejects non-string, empty, malformed and overlong cursors', () => {
    for (const bad of [undefined, null, 42, '', '!!!', 'e30=', 'x'.repeat(513)]) {
      expect(() => decodeCursor(bad)).toThrow(ValidationError);
    }
    // Valid base64url but wrong shape
    expect(() => decodeCursor(Buffer.from(JSON.stringify({ t: 1 }), 'utf8').toString('base64url'))).toThrow(
      ValidationError
    );
  });
});
