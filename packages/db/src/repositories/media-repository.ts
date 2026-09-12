import type { DatabaseSync } from 'node:sqlite';
import type { MediaAsset, MediaAssetRepository } from '@brew-cms/core';

export class SQLiteMediaAssetRepository implements MediaAssetRepository {
  constructor(private readonly db: DatabaseSync) {}

  async findById(id: string): Promise<MediaAsset | null> {
    const row = this.db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  async create(asset: Omit<MediaAsset, 'createdAt'>): Promise<MediaAsset> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO media_assets (
        id, provider, provider_key, mime_type, size_bytes,
        width, height, alt_text, caption, metadata_json,
        created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset.id,
      asset.provider,
      asset.providerKey,
      asset.mimeType,
      asset.sizeBytes,
      asset.width ?? null,
      asset.height ?? null,
      asset.altText ?? null,
      asset.caption ?? null,
      asset.metadata ? JSON.stringify(asset.metadata) : null,
      asset.createdBy,
      now
    );

    return (await this.findById(asset.id))!;
  }

  async list(filter?: { mimeType?: string; limit?: number; offset?: number }): Promise<MediaAsset[]> {
    const where: string[] = [];
    const params: any[] = [];

    if (filter?.mimeType) {
      where.push('mime_type LIKE ?');
      params.push(`%${filter.mimeType}%`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT * FROM media_assets ${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    return rows.map((r) => this.mapRow(r));
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
  }

  private mapRow(row: any): MediaAsset {
    return {
      id: row.id,
      provider: row.provider,
      providerKey: row.provider_key,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      width: row.width ? Number(row.width) : null,
      height: row.height ? Number(row.height) : null,
      altText: row.alt_text,
      caption: row.caption,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
    };
  }
}
