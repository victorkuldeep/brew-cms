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

export interface MariaDbExecutor {
  query(sql: string, params?: any[]): Promise<[any[], any]>;
  execute?(sql: string, params?: any[]): Promise<[any, any]>;
}

export class MariaDbSemanticIndexAdapter implements SemanticIndexProvider {
  public readonly providerId = 'mariadb';
  private hasNativeVectorSupport: boolean | null = null;

  constructor(
    private readonly db: MariaDbExecutor,
    private readonly dimensions = 384
  ) {}

  /**
   * Creates the additive semantic tables if they do not already exist.
   * NEVER modifies or touches canonical content tables.
   */
  async initSchema(): Promise<void> {
    // 1. Content Sources Registry Table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS content_sources (
        source_id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        adapter_key VARCHAR(64) NOT NULL,
        base_url VARCHAR(255) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        last_indexed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Semantic Document Projections Table (ZERO content text stored)
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS semantic_documents (
        id VARCHAR(128) PRIMARY KEY,
        source_id VARCHAR(64) NOT NULL,
        content_id VARCHAR(128) NOT NULL,
        revision_id VARCHAR(64) NOT NULL,
        canonical_url VARCHAR(255) NOT NULL,
        content_hash VARCHAR(64) NOT NULL,
        embedding_model VARCHAR(100) NOT NULL,
        embedding_version VARCHAR(50) NOT NULL,
        embedding_dimensions INT NOT NULL,
        index_status VARCHAR(32) NOT NULL DEFAULT 'READY',
        metadata_json TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sem_source_content (source_id, content_id),
        INDEX idx_sem_status (index_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Detect if native VECTOR type is supported in this MariaDB environment
    const nativeVector = await this.checkNativeVectorSupport();

    if (nativeVector) {
      // 3a. Native MariaDB 11.8+ VECTOR Table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS semantic_chunks (
          id VARCHAR(128) PRIMARY KEY,
          semantic_document_id VARCHAR(128) NOT NULL,
          chunk_index INT NOT NULL,
          chunk_hash VARCHAR(64) NOT NULL,
          embedding VECTOR(${this.dimensions}) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_sem_chunk_doc (semantic_document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    } else {
      // 3b. Portable JSON/BLOB Vector Fallback Table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS semantic_chunks (
          id VARCHAR(128) PRIMARY KEY,
          semantic_document_id VARCHAR(128) NOT NULL,
          chunk_index INT NOT NULL,
          chunk_hash VARCHAR(64) NOT NULL,
          embedding_json MEDIUMTEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_sem_chunk_doc (semantic_document_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }
  }

  private async checkNativeVectorSupport(): Promise<boolean> {
    if (this.hasNativeVectorSupport !== null) {
      return this.hasNativeVectorSupport;
    }
    try {
      // Probe for MariaDB 11.8+ VECTOR type compatibility
      await this.db.query(`SELECT VEC_DISTANCE_COSINE(VEC_FromText('[1.0, 0.0]'), VEC_FromText('[0.0, 1.0]')) AS dist`);
      this.hasNativeVectorSupport = true;
    } catch {
      this.hasNativeVectorSupport = false;
    }
    return this.hasNativeVectorSupport;
  }

  async upsert(projection: SemanticDocumentProjection): Promise<void> {
    const isNative = await this.checkNativeVectorSupport();

    // 1. Insert or update the semantic document projection
    await this.db.query(
      `INSERT INTO semantic_documents
        (id, source_id, content_id, revision_id, canonical_url, content_hash, embedding_model, embedding_version, embedding_dimensions, index_status, metadata_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
        revision_id = VALUES(revision_id),
        canonical_url = VALUES(canonical_url),
        content_hash = VALUES(content_hash),
        index_status = VALUES(index_status),
        metadata_json = VALUES(metadata_json),
        updated_at = CURRENT_TIMESTAMP`,
      [
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
      ]
    );

    // 2. Replace chunks for this document
    await this.db.query(`DELETE FROM semantic_chunks WHERE semantic_document_id = ?`, [projection.id]);

    for (const chunk of projection.chunks) {
      const chunkId = chunk.id ?? `${projection.id}-chk-${chunk.chunkIndex}`;

      if (isNative) {
        const vecStr = `[${chunk.embedding.join(',')}]`;
        await this.db.query(
          `INSERT INTO semantic_chunks (id, semantic_document_id, chunk_index, chunk_hash, embedding)
           VALUES (?, ?, ?, ?, VEC_FromText(?))`,
          [chunkId, projection.id, chunk.chunkIndex, chunk.chunkHash, vecStr]
        );
      } else {
        const vecJson = JSON.stringify(chunk.embedding);
        await this.db.query(
          `INSERT INTO semantic_chunks (id, semantic_document_id, chunk_index, chunk_hash, embedding_json)
           VALUES (?, ?, ?, ?, ?)`,
          [chunkId, projection.id, chunk.chunkIndex, chunk.chunkHash, vecJson]
        );
      }
    }
  }

  async search(
    queryVector: readonly number[],
    options: SemanticSearchOptions = {}
  ): Promise<SemanticMatch[]> {
    const isNative = await this.checkNativeVectorSupport();
    const limit = options.limit ?? 20;
    const minSim = options.minSimilarity ?? 0.1;

    if (isNative) {
      const queryVecStr = `[${queryVector.join(',')}]`;
      let sql = `
        SELECT 
          d.source_id,
          d.content_id,
          d.revision_id,
          d.canonical_url,
          c.chunk_index,
          VEC_DISTANCE_COSINE(c.embedding, VEC_FromText(?)) AS distance
        FROM semantic_chunks c
        JOIN semantic_documents d ON c.semantic_document_id = d.id
        WHERE d.index_status = 'READY'
      `;
      const params: any[] = [queryVecStr];

      if (options.sourceId) {
        sql += ` AND d.source_id = ?`;
        params.push(options.sourceId);
      }

      sql += ` ORDER BY distance ASC LIMIT ?`;
      params.push(limit);

      const [rows] = await this.db.query(sql, params);

      return (rows || []).map((row: any) => {
        const dist = Number(row.distance);
        const sim = Math.max(0, 1 - dist);
        return {
          sourceId: row.source_id,
          contentId: row.content_id,
          revisionId: row.revision_id,
          canonicalUrl: row.canonical_url,
          chunkIndex: Number(row.chunk_index),
          distance: Number(dist.toFixed(6)),
          similarity: Number(sim.toFixed(6)),
        };
      }).filter((m: SemanticMatch) => m.similarity >= minSim);
    }

    // Portable fallback retrieval
    let sql = `
      SELECT 
        d.source_id,
        d.content_id,
        d.revision_id,
        d.canonical_url,
        c.chunk_index,
        c.embedding_json
      FROM semantic_chunks c
      JOIN semantic_documents d ON c.semantic_document_id = d.id
      WHERE d.index_status = 'READY'
    `;
    const params: any[] = [];
    if (options.sourceId) {
      sql += ` AND d.source_id = ?`;
      params.push(options.sourceId);
    }

    const [rows] = await this.db.query(sql, params);
    const matches: SemanticMatch[] = [];

    for (const row of rows || []) {
      const vec = JSON.parse(row.embedding_json);
      const similarity = cosineSimilarity(queryVector, vec);
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
    let sql = `UPDATE semantic_documents SET index_status = 'STALE', updated_at = CURRENT_TIMESTAMP WHERE source_id = ? AND content_id = ?`;
    const params: any[] = [sourceId, contentId];
    if (revisionId) {
      sql += ` AND revision_id != ?`;
      params.push(revisionId);
    }
    await this.db.query(sql, params);
  }

  async delete(sourceId: string, contentId: string): Promise<void> {
    const [docs] = await this.db.query(
      `SELECT id FROM semantic_documents WHERE source_id = ? AND content_id = ?`,
      [sourceId, contentId]
    );
    for (const d of docs || []) {
      await this.db.query(`DELETE FROM semantic_chunks WHERE semantic_document_id = ?`, [d.id]);
    }
    await this.db.query(
      `DELETE FROM semantic_documents WHERE source_id = ? AND content_id = ?`,
      [sourceId, contentId]
    );
  }

  async getStatus(): Promise<SemanticIndexStatus> {
    const [docRows] = await this.db.query(
      `SELECT COUNT(*) as doc_count, embedding_model, embedding_dimensions FROM semantic_documents WHERE index_status = 'READY' GROUP BY embedding_model, embedding_dimensions LIMIT 1`
    );
    const [chunkRows] = await this.db.query(`SELECT COUNT(*) as chunk_count FROM semantic_chunks`);

    const docCount = Number(docRows?.[0]?.doc_count || 0);
    const chunkCount = Number(chunkRows?.[0]?.chunk_count || 0);
    const model = docRows?.[0]?.embedding_model || 'Xenova/bge-small-en-v1.5';
    const dims = Number(docRows?.[0]?.embedding_dimensions || this.dimensions);

    return {
      providerId: this.providerId,
      ready: true,
      documentCount: docCount,
      chunkCount,
      embeddingModel: model,
      dimensions: dims,
    };
  }
}
