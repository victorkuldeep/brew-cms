import type { DatabaseSync } from 'node:sqlite';
import type { Topic, Tag, Series, TaxonomyRepository } from '@brew-cms/core';

export class SQLiteTaxonomyRepository implements TaxonomyRepository {
  constructor(private readonly db: DatabaseSync) {}

  // Topics
  async createTopic(topic: Topic): Promise<Topic> {
    this.db.prepare('INSERT INTO topics (id, slug, name, description) VALUES (?, ?, ?, ?)').run(
      topic.id,
      topic.slug.toLowerCase().trim(),
      topic.name.trim(),
      topic.description ?? null
    );
    return (await this.findTopicById(topic.id))!;
  }

  async findTopicById(id: string): Promise<Topic | null> {
    const row = this.db.prepare('SELECT * FROM topics WHERE id = ?').get(id) as any;
    return row ? { id: row.id, slug: row.slug, name: row.name, description: row.description } : null;
  }

  async findTopicBySlug(slug: string): Promise<Topic | null> {
    const row = this.db.prepare('SELECT * FROM topics WHERE slug = ?').get(slug.toLowerCase().trim()) as any;
    return row ? { id: row.id, slug: row.slug, name: row.name, description: row.description } : null;
  }

  async listTopics(): Promise<Topic[]> {
    const rows = this.db.prepare('SELECT * FROM topics ORDER BY name ASC').all() as any[];
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description }));
  }

  // Tags
  async createTag(tag: Tag): Promise<Tag> {
    this.db.prepare('INSERT INTO tags (id, slug, name) VALUES (?, ?, ?)').run(
      tag.id,
      tag.slug.toLowerCase().trim(),
      tag.name.trim()
    );
    return (await this.findTagById(tag.id))!;
  }

  async findTagById(id: string): Promise<Tag | null> {
    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as any;
    return row ? { id: row.id, slug: row.slug, name: row.name } : null;
  }

  async findTagBySlug(slug: string): Promise<Tag | null> {
    const row = this.db.prepare('SELECT * FROM tags WHERE slug = ?').get(slug.toLowerCase().trim()) as any;
    return row ? { id: row.id, slug: row.slug, name: row.name } : null;
  }

  async listTags(): Promise<Tag[]> {
    const rows = this.db.prepare('SELECT * FROM tags ORDER BY name ASC').all() as any[];
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name }));
  }

  async setDocumentTags(documentId: string, tagIds: string[]): Promise<void> {
    this.db.prepare('DELETE FROM document_tags WHERE document_id = ?').run(documentId);
    const stmt = this.db.prepare('INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)');
    for (const tagId of tagIds) {
      stmt.run(documentId, tagId);
    }
  }

  async getDocumentTags(documentId: string): Promise<Tag[]> {
    const rows = this.db.prepare(`
      SELECT t.* FROM tags t
      JOIN document_tags dt ON dt.tag_id = t.id
      WHERE dt.document_id = ?
    `).all(documentId) as any[];
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name }));
  }

  // Series
  async createSeries(series: Series): Promise<Series> {
    this.db.prepare('INSERT INTO series (id, slug, name, description) VALUES (?, ?, ?, ?)').run(
      series.id,
      series.slug.toLowerCase().trim(),
      series.name.trim(),
      series.description ?? null
    );
    return (await this.findSeriesById(series.id))!;
  }

  async findSeriesById(id: string): Promise<Series | null> {
    const row = this.db.prepare('SELECT * FROM series WHERE id = ?').get(id) as any;
    return row ? { id: row.id, slug: row.slug, name: row.name, description: row.description } : null;
  }

  async findSeriesBySlug(slug: string): Promise<Series | null> {
    const row = this.db.prepare('SELECT * FROM series WHERE slug = ?').get(slug.toLowerCase().trim()) as any;
    return row ? { id: row.id, slug: row.slug, name: row.name, description: row.description } : null;
  }

  async listSeries(): Promise<Series[]> {
    const rows = this.db.prepare('SELECT * FROM series ORDER BY name ASC').all() as any[];
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description }));
  }

  async setDocumentSeries(documentId: string, seriesId: string, position: number): Promise<void> {
    this.db.prepare('DELETE FROM document_series WHERE document_id = ?').run(documentId);
    this.db.prepare('INSERT INTO document_series (document_id, series_id, position) VALUES (?, ?, ?)').run(
      documentId,
      seriesId,
      position
    );
  }

  async getDocumentSeries(documentId: string): Promise<{ series: Series; position: number } | null> {
    const row = this.db.prepare(`
      SELECT s.*, ds.position FROM series s
      JOIN document_series ds ON ds.series_id = s.id
      WHERE ds.document_id = ?
    `).get(documentId) as any;
    if (!row) return null;
    return {
      series: { id: row.id, slug: row.slug, name: row.name, description: row.description },
      position: Number(row.position),
    };
  }
}
