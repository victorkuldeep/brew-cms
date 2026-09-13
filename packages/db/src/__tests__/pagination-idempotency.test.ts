import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createDatabaseConnection } from '../connection.js';
import { seedInitialData } from '../seed.js';
import { SQLiteDocumentRepository } from '../repositories/document-repository.js';
import { SqliteIdempotencyStore } from '../idempotency-store.js';
import { decodeCursor } from '@brew-cms/core';
import type { DatabaseSync } from 'node:sqlite';

describe('Inc 1: cursor pagination + persistent idempotency', () => {
  let db: DatabaseSync;
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brew-inc1-'));
    db = createDatabaseConnection({ filePath: path.join(dir, 'test.db') });
    seedInitialData(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function seedDocs(n: number): Promise<string[]> {
    const repo = new SQLiteDocumentRepository(db);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const doc = await repo.create({
        id: `doc_page_${i}`,
        type: 'post',
        slug: `page-${i}`,
        title: `Page ${i}`,
        status: 'DRAFT',
        authorId: 'usr_admin_default',
        publishedRevisionId: null,
        canonicalUrl: null,
        scheduledAt: null,
        seo: null,
      });
      ids.push(doc.id);
    }
    return ids;
  }

  it('walks all documents via cursors without overlap or loss', async () => {
    const ids = await seedDocs(5);
    const repo = new SQLiteDocumentRepository(db);

    const seen = new Set<string>();
    let cursor: string | undefined;
    let total = -1;
    let pages = 0;
    do {
      const page = await repo.list({ limit: 2, cursor });
      if (total === -1) total = page.total;
      expect(page.total).toBe(5); // total describes the whole filtered set
      for (const d of page.items) {
        expect(seen.has(d.id)).toBe(false);
        seen.add(d.id);
      }
      cursor = page.nextCursor;
      pages++;
    } while (cursor);

    expect(seen).toEqual(new Set(ids));
    expect(pages).toBe(3); // 2 + 2 + 1
  });

  it('omits nextCursor on the final partial page', async () => {
    await seedDocs(2);
    const repo = new SQLiteDocumentRepository(db);
    const page = await repo.list({ limit: 10 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeUndefined();
  });

  it('rejects malformed cursors with ValidationError', async () => {
    const repo = new SQLiteDocumentRepository(db);
    await expect(repo.list({ cursor: 'bogus!!' })).rejects.toThrow('Invalid pagination cursor');
  });

  it('decodes well-formed cursors', () => {
    const repo = new SQLiteDocumentRepository(db);
    void repo;
    const c = decodeCursor('eyJ0IjoiMjAyNi0wOS0xMlQxMjowMDowMC4wMDBaIiwiaWQiOiJkb2NfMSJ9');
    expect(c).toEqual({ t: '2026-09-12T12:00:00.000Z', id: 'doc_1' });
  });

  it('persists idempotency records across store instances with expiry', () => {
    const a = new SqliteIdempotencyStore(db);
    const b = new SqliteIdempotencyStore(db);

    expect(a.get('k1', 'u1')).toBeNull();
    a.set('k1', 'u1', 201, { document: { id: 'd1' } });
    // Visible from a second instance over the same database file
    expect(b.get('k1', 'u1')).toMatchObject({ responseStatus: 201 });
    expect((b.get('k1', 'u1') as any).responseBody).toEqual({ document: { id: 'd1' } });
    // Scoped per actor
    expect(b.get('k1', 'u2')).toBeNull();

    // Expired records read as missing
    a.set('k2', 'u1', 200, {}, -3600);
    expect(b.get('k2', 'u1')).toBeNull();
  });
});
