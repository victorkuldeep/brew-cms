import type { DatabaseSync } from 'node:sqlite';
import type {
  Document,
  DocumentFilter,
  DocumentRepository,
} from '@brew-cms/core';
import { decodeCursor, encodeCursor } from '@brew-cms/core';

export class SQLiteDocumentRepository implements DocumentRepository {
  constructor(private readonly db: DatabaseSync) {}

  async findById(id: string): Promise<Document | null> {
    const stmt = this.db.prepare('SELECT * FROM documents WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  async findBySlug(slug: string): Promise<Document | null> {
    const stmt = this.db.prepare('SELECT * FROM documents WHERE slug = ?');
    const row = stmt.get(slug) as any;
    return row ? this.mapRow(row) : null;
  }

  async create(doc: Omit<Document, 'createdAt' | 'updatedAt'>): Promise<Document> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO documents (
        id, type, slug, title, excerpt, status, author_id,
        published_revision_id, canonical_url, scheduled_at, seo_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      doc.id,
      doc.type,
      doc.slug,
      doc.title,
      doc.excerpt ?? null,
      doc.status,
      doc.authorId,
      doc.publishedRevisionId ?? null,
      doc.canonicalUrl ?? null,
      doc.scheduledAt ? new Date(doc.scheduledAt).toISOString() : null,
      doc.seo ? JSON.stringify(doc.seo) : null,
      now,
      now
    );

    return (await this.findById(doc.id))!;
  }

  async update(id: string, updates: Partial<Document>): Promise<Document> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Document '${id}' not found`);

    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [new Date().toISOString()];

    if (updates.type !== undefined) {
      sets.push('type = ?');
      values.push(updates.type);
    }
    if (updates.slug !== undefined) {
      sets.push('slug = ?');
      values.push(updates.slug);
    }
    if (updates.title !== undefined) {
      sets.push('title = ?');
      values.push(updates.title);
    }
    if (updates.excerpt !== undefined) {
      sets.push('excerpt = ?');
      values.push(updates.excerpt);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);
    }
    if (updates.publishedRevisionId !== undefined) {
      sets.push('published_revision_id = ?');
      values.push(updates.publishedRevisionId);
    }
    if (updates.canonicalUrl !== undefined) {
      sets.push('canonical_url = ?');
      values.push(updates.canonicalUrl);
    }
    if (updates.scheduledAt !== undefined) {
      sets.push('scheduled_at = ?');
      values.push(updates.scheduledAt ? new Date(updates.scheduledAt).toISOString() : null);
    }
    if (updates.seo !== undefined) {
      sets.push('seo_json = ?');
      values.push(updates.seo ? JSON.stringify(updates.seo) : null);
    }

    values.push(id);
    const sql = `UPDATE documents SET ${sets.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);

    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  }

  async list(filter?: DocumentFilter): Promise<{ items: Document[]; total: number; nextCursor?: string }> {
    const where: string[] = [];
    const filterParams: any[] = [];

    if (filter?.type) {
      where.push('type = ?');
      filterParams.push(filter.type);
    }
    if (filter?.status) {
      where.push('status = ?');
      filterParams.push(filter.status);
    }
    if (filter?.authorId) {
      where.push('author_id = ?');
      filterParams.push(filter.authorId);
    }
    if (filter?.query) {
      where.push('(title LIKE ? OR excerpt LIKE ?)');
      filterParams.push(`%${filter.query}%`, `%${filter.query}%`);
    }

    // Keyset cursor: (created_at, id) of the last row of the previous page,
    // matching the DESC ordering. Stable under concurrent inserts.
    const cursorParams: any[] = [];
    let cursorPredicate = '';
    if (filter?.cursor) {
      const { t, id } = decodeCursor(filter.cursor);
      cursorPredicate = ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      cursorParams.push(t, t, id);
    }

    const baseWhere = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const pageWhere = baseWhere ? `${baseWhere}${cursorPredicate}` : cursorPredicate ? `WHERE 1=1${cursorPredicate}` : '';
    // Total always describes the whole filtered collection (cursor excluded),
    // so clients can cache it from page one.
    const countRow = this.db.prepare(`SELECT COUNT(*) as total FROM documents ${baseWhere}`).get(...filterParams) as any;
    const total = countRow ? Number(countRow.total) : 0;

    const limit = filter?.limit ?? 50;
    const offset = filter?.cursor ? 0 : (filter?.offset ?? 0);
    const sql = `SELECT * FROM documents ${pageWhere} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(sql).all(...filterParams, ...cursorParams, limit, offset) as any[];
    const items = rows.map((r) => this.mapRow(r));

    // nextCursor only when the page is full (more rows may follow)
    let nextCursor: string | undefined;
    if (items.length === limit && limit > 0) {
      const last = items[items.length - 1];
      nextCursor = encodeCursor({ t: last.createdAt.toISOString(), id: last.id });
    }

    return { items, total, nextCursor };
  }

  private mapRow(row: any): Document {
    return {
      id: row.id,
      type: row.type,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      status: row.status,
      authorId: row.author_id,
      publishedRevisionId: row.published_revision_id,
      canonicalUrl: row.canonical_url,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
      seo: row.seo_json ? JSON.parse(row.seo_json) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
