import type { DatabaseSync } from 'node:sqlite';
import type {
  Document,
  DocumentFilter,
  DocumentRepository,
} from '@brew-cms/core';

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

  async list(filter?: DocumentFilter): Promise<{ items: Document[]; total: number }> {
    const where: string[] = [];
    const params: any[] = [];

    if (filter?.type) {
      where.push('type = ?');
      params.push(filter.type);
    }
    if (filter?.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.authorId) {
      where.push('author_id = ?');
      params.push(filter.authorId);
    }
    if (filter?.query) {
      where.push('(title LIKE ? OR excerpt LIKE ?)');
      params.push(`%${filter.query}%`, `%${filter.query}%`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countRow = this.db.prepare(`SELECT COUNT(*) as total FROM documents ${whereClause}`).get(...params) as any;
    const total = countRow ? Number(countRow.total) : 0;

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    const sql = `SELECT * FROM documents ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(sql).all(...params, limit, offset) as any[];

    return {
      items: rows.map((r) => this.mapRow(r)),
      total,
    };
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
