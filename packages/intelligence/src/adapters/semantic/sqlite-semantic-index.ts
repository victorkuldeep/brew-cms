import { DatabaseSync } from 'node:sqlite';
import type {
  SemanticIndexProvider,
  SemanticSearchOptions,
} from '../../domain/ports.js';
import type {
  SemanticDocumentProjection,
  SemanticMatch,
  SemanticIndexStatus,
} from '../../domain/types.js';
import { cosineSimilarity } from './memory-semantic-index.js';

export class SQLiteSemanticIndexAdapter implements SemanticIndexProvider {
  public readonly providerId = 'sqlite';

  constructor(
    private readonly db: DatabaseSync,
    private readonly dimensions = 384
  ) {
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_documents (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        content_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding_version TEXT NOT NULL,
        embedding_dimensions INTEGER NOT NULL,
        index_status TEXT NOT NULL DEFAULT 'READY',
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS semantic_chunks (
        id TEXT PRIMARY KEY,
        semantic_document_id TEXT NOT NULL REFERENCES semantic_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        chunk_hash TEXT NOT NULL,
        embedding_blob BLOB NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sem_doc_source ON semantic_documents(source_id, content_id);
      CREATE INDEX IF NOT EXISTS idx_sem_chunk_doc ON semantic_chunks(semantic_document_id);
    `);
  }

  async upsert(projection: SemanticDocumentProjection): Promise<void> {
    const now = new Date().toISOString();

    const insertDoc = this.db.prepare(`
      INSERT INTO semantic_documents (
        id, source_id, content_id, revision_id, canonical_url, content_hash,
        embedding_model, embedding_version, embedding_dimensions, index_status,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        revision_id = excluded.revision_id,
        canonical_url = excluded.canonical_url,
        content_hash = excluded.content_hash,
        index_status = excluded.index_status,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `);

    insertDoc.run(
      projection.id,
      projection.sourceId,
      projection.contentId,
      projection.revisionId,
      projection.canonicalUrl,
      projection.contentHash,
      projection.embeddingModel,
      projection.embeddingVersion,
      projection.embeddingDimensions,
      projection.indexStatus,
      projection.metadataJson ?? null,
      projection.createdAt ? String(projection.createdAt) : now,
      now
    );

    // Delete existing chunks for this document
    this.db.prepare(`DELETE FROM semantic_chunks WHERE semantic_document_id = ?`).run(projection.id);

    // Insert chunks
    const insertChunk = this.db.prepare(`
      INSERT INTO semantic_chunks (id, semantic_document_id, chunk_index, chunk_hash, embedding_blob, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const chunk of projection.chunks) {
      const chunkId = chunk.id ?? `${projection.id}-chk-${chunk.chunkIndex}`;
      const float32 = new Float32Array(chunk.embedding);
      const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

      insertChunk.run(
        chunkId,
        projection.id,
        chunk.chunkIndex,
        chunk.chunkHash,
        buffer,
        now
      );
    }
  }

  async search(
    queryVector: readonly number[],
    options: SemanticSearchOptions = {}
  ): Promise<SemanticMatch[]> {
    const minSim = options.minSimilarity ?? 0.1;
    const limit = options.limit ?? 20;

    let sql = `
      SELECT 
        d.source_id,
        d.content_id,
        d.revision_id,
        d.canonical_url,
        c.chunk_index,
        c.embedding_blob
      FROM semantic_chunks c
      JOIN semantic_documents d ON c.semantic_document_id = d.id
      WHERE d.index_status = 'READY'
    `;
    const params: any[] = [];
    if (options.sourceId) {
      sql += ` AND d.source_id = ?`;
      params.push(options.sourceId);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    const matches: SemanticMatch[] = [];

    for (const row of rows) {
      const buf = row.embedding_blob as Buffer;
      const float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      const similarity = cosineSimilarity(queryVector, float32);

      if (similarity >= minSim) {
        matches.push({
          sourceId: row.source_id,
          contentId: row.content_id,
          revisionId: row.revision_id,
          canonicalUrl: row.canonical_url,
          chunkIndex: Number(row.chunk_index),
          distance: Number((1 - similarity).toFixed(6)),
          similarity: Number(similarity.toFixed(6)),
        });
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, limit);
  }

  async markStale(sourceId: string, contentId: string, revisionId?: string): Promise<void> {
    const now = new Date().toISOString();
    if (revisionId) {
      this.db.prepare(`
        UPDATE semantic_documents
        SET index_status = 'STALE', updated_at = ?
        WHERE source_id = ? AND content_id = ? AND revision_id != ?
      `).run(now, sourceId, contentId, revisionId);
    } else {
      this.db.prepare(`
        UPDATE semantic_documents
        SET index_status = 'STALE', updated_at = ?
        WHERE source_id = ? AND content_id = ?
      `).run(now, sourceId, contentId);
    }
  }

  async delete(sourceId: string, contentId: string): Promise<void> {
    this.db.prepare(`DELETE FROM semantic_documents WHERE source_id = ? AND content_id = ?`).run(sourceId, contentId);
  }

  async getStatus(): Promise<SemanticIndexStatus> {
    const docRow = this.db.prepare(`
      SELECT COUNT(*) as doc_count, embedding_model, embedding_dimensions
      FROM semantic_documents
      WHERE index_status = 'READY'
    `).get() as any;

    const chunkRow = this.db.prepare(`
      SELECT COUNT(*) as chunk_count FROM semantic_chunks
    `).get() as any;

    return {
      providerId: this.providerId,
      ready: true,
      documentCount: Number(docRow?.doc_count || 0),
      chunkCount: Number(chunkRow?.chunk_count || 0),
      embeddingModel: docRow?.embedding_model || 'Xenova/bge-small-en-v1.5',
      dimensions: Number(docRow?.embedding_dimensions || this.dimensions),
    };
  }
}
