import { createHash } from 'node:crypto';
import type {
  ContentSourceAdapter,
  ContentSourceCapabilities,
} from '../../domain/ports.js';
import type {
  ContentReference,
  CanonicalContent,
  IndexableContent,
} from '../../domain/types.js';
import type { MariaDbExecutor } from '../semantic/mariadb-semantic-index.js';

export interface MariaDbSourceConfig {
  sourceId?: string;
  tableName?: string;
  idColumn?: string;
  slugColumn?: string;
  titleColumn?: string;
  bodyColumn?: string;
  summaryColumn?: string;
  statusColumn?: string;
  canonicalUrlColumn?: string;
  urlPrefix?: string;
}

export class MariaDbArticleSourceAdapter implements ContentSourceAdapter {
  public readonly sourceId: string;
  public readonly capabilities: ContentSourceCapabilities = {
    supportsRevisions: false,
    supportsSubscriptions: false,
    supportsBulkListing: true,
  };

  private readonly tableName: string;
  private readonly idColumn: string;
  private readonly slugColumn: string;
  private readonly titleColumn: string;
  private readonly bodyColumn: string;
  private readonly summaryColumn: string;
  private readonly statusColumn: string;
  private readonly canonicalUrlColumn: string;
  private readonly urlPrefix: string;

  constructor(
    private readonly db: MariaDbExecutor,
    config: MariaDbSourceConfig = {}
  ) {
    this.sourceId = config.sourceId ?? 'victor-mariadb';
    this.tableName = config.tableName ?? 'thinking_articles';
    this.idColumn = config.idColumn ?? 'id';
    this.slugColumn = config.slugColumn ?? 'slug';
    this.titleColumn = config.titleColumn ?? 'title';
    this.bodyColumn = config.bodyColumn ?? 'content';
    this.summaryColumn = config.summaryColumn ?? 'summary';
    this.statusColumn = config.statusColumn ?? 'status';
    this.canonicalUrlColumn = config.canonicalUrlColumn ?? 'canonical_url';
    this.urlPrefix = config.urlPrefix ?? '/thinking/';
  }

  async getContent(ref: ContentReference): Promise<CanonicalContent | null> {
    const isNumeric = /^\d+$/.test(ref.contentId);
    let sql: string;
    let params: any[];

    if (isNumeric) {
      sql = `SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = ? LIMIT 1`;
      params = [parseInt(ref.contentId, 10)];
    } else {
      sql = `SELECT * FROM ${this.tableName} WHERE ${this.slugColumn} = ? OR ${this.idColumn} = ? LIMIT 1`;
      params = [ref.contentId, ref.contentId];
    }

    const [rows] = await this.db.query(sql, params);
    const row = rows?.[0];
    if (!row) return null;

    const slug = row[this.slugColumn] ?? String(row[this.idColumn]);
    const canonicalUrl =
      row[this.canonicalUrlColumn] || `${this.urlPrefix}${slug}`;

    return {
      sourceId: this.sourceId,
      contentId: String(row[this.idColumn]),
      revisionId: row.updated_at ? new Date(row.updated_at).toISOString() : 'current',
      title: row[this.titleColumn] ?? '',
      slug,
      canonicalUrl,
      summary: row[this.summaryColumn] ?? null,
      body: row[this.bodyColumn] ?? '',
      status: row[this.statusColumn] ?? 'PUBLISHED',
      metadata: {
        topic: row.topic,
        date: row.date,
        publication: row.publication,
        readingTime: row.reading_time,
      },
      publishedAt: row.created_at ? new Date(row.created_at) : null,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
  }

  async getIndexableContent(ref: ContentReference): Promise<IndexableContent | null> {
    const canonical = await this.getContent(ref);
    if (!canonical || !canonical.body) return null;

    // Transient normalized text for embedding (title + summary + body)
    const textForEmbedding = [
      canonical.title,
      canonical.summary ?? '',
      canonical.body,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Cryptographic hash for change detection
    const contentHash = createHash('sha256').update(textForEmbedding).digest('hex');

    return {
      sourceId: this.sourceId,
      contentId: canonical.contentId,
      revisionId: canonical.revisionId ?? 'current',
      canonicalUrl: canonical.canonicalUrl,
      title: canonical.title,
      textForEmbedding,
      metadata: {
        contentType: 'article',
        topic: canonical.metadata?.topic as string,
        publishedAt: canonical.publishedAt ? String(canonical.publishedAt) : undefined,
        updatedAt: canonical.updatedAt ? String(canonical.updatedAt) : undefined,
      },
      contentHash,
    };
  }

  async getRevisionToken(ref: ContentReference): Promise<string | null> {
    const canonical = await this.getContent(ref);
    return canonical?.revisionId ?? null;
  }

  async listIndexableReferences(options?: { cursor?: string; limit?: number }): Promise<{
    items: ContentReference[];
    nextCursor?: string;
  }> {
    const limit = options?.limit ?? 50;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const sql = `SELECT ${this.idColumn}, ${this.slugColumn} FROM ${this.tableName} WHERE ${this.statusColumn} = 'PUBLISHED' OR ${this.statusColumn} = 'published' LIMIT ? OFFSET ?`;
    const [rows] = await this.db.query(sql, [limit, offset]);

    const items: ContentReference[] = (rows || []).map((row: any) => ({
      sourceId: this.sourceId,
      contentId: String(row[this.idColumn]),
    }));

    const nextOffset = offset + items.length;
    const nextCursor = items.length === limit ? String(nextOffset) : undefined;

    return { items, nextCursor };
  }
}
