import type {
  SourceRegistry,
  EmbeddingProvider,
  SemanticIndexProvider,
} from '../domain/ports.js';
import type {
  SemanticDocumentProjection,
  SemanticChunkProjection,
} from '../domain/types.js';
import { chunkText } from '../chunking/chunker.js';

export interface IndexResult {
  status: 'INDEXED' | 'SKIPPED_UNCHANGED' | 'FAILED';
  documentId: string;
  chunkCount: number;
  error?: string;
}

export interface SyncResult {
  sourceId: string;
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
  errors: Array<{ contentId: string; error: string }>;
}

export class IndexingService {
  constructor(
    public readonly registry: SourceRegistry,
    public readonly embeddingProvider: EmbeddingProvider,
    public readonly semanticIndex: SemanticIndexProvider
  ) {}

  /**
   * Indexes or re-indexes a single document revision from its authoritative source.
   * GUARANTEE: Never persists full body text or chunk text into the semantic index.
   */
  async indexDocument(
    sourceId: string,
    contentId: string,
    revisionId?: string
  ): Promise<IndexResult> {
    const adapter = this.registry.get(sourceId);
    if (!adapter) {
      return {
        status: 'FAILED',
        documentId: `${sourceId}-${contentId}`,
        chunkCount: 0,
        error: `Source '${sourceId}' not found in registry.`,
      };
    }

    try {
      const indexable = await adapter.getIndexableContent({
        sourceId,
        contentId,
        revisionId,
      });

      if (!indexable) {
        // Content might have been unpublished or deleted from source
        await this.semanticIndex.delete(sourceId, contentId);
        return {
          status: 'INDEXED',
          documentId: `${sourceId}-${contentId}`,
          chunkCount: 0,
        };
      }

      const activeRevId = indexable.revisionId || revisionId || 'rev-1';
      const docProjectionId = `${sourceId}-${contentId}-${activeRevId}`;

      // 1. Partition transient normalized text into bounded semantic chunks
      const chunks = chunkText(indexable.textForEmbedding, {}, indexable.title);

      if (chunks.length === 0) {
        return {
          status: 'INDEXED',
          documentId: docProjectionId,
          chunkCount: 0,
        };
      }

      // 2. Generate embedding vectors for all chunk texts
      const chunkTexts = chunks.map((c) => c.text);
      const embeddings = await this.embeddingProvider.embedDocuments(chunkTexts);

      // 3. Assemble projection with ONLY identifiers and vectors (text is discarded!)
      const chunkProjections: SemanticChunkProjection[] = chunks.map((c, idx) => ({
        id: `${docProjectionId}-chk-${c.chunkIndex}`,
        chunkIndex: c.chunkIndex,
        chunkHash: c.chunkHash,
        embedding: embeddings[idx],
      }));

      const docProjection: SemanticDocumentProjection = {
        id: docProjectionId,
        sourceId,
        contentId,
        revisionId: activeRevId,
        canonicalUrl: indexable.canonicalUrl,
        contentHash: indexable.contentHash,
        embeddingModel: this.embeddingProvider.modelId,
        embeddingVersion: this.embeddingProvider.modelVersion,
        embeddingDimensions: this.embeddingProvider.dimensions,
        indexStatus: 'READY',
        chunks: chunkProjections,
        metadataJson: JSON.stringify(indexable.metadata),
      };

      // 4. Persist projection to the semantic index
      await this.semanticIndex.upsert(docProjection);

      // 5. Mark older projections of this content item as stale
      await this.semanticIndex.markStale(sourceId, contentId, activeRevId);

      return {
        status: 'INDEXED',
        documentId: docProjectionId,
        chunkCount: chunks.length,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        documentId: `${sourceId}-${contentId}`,
        chunkCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Synchronizes all indexable documents from a registered source adapter.
   */
  async syncSource(
    sourceId: string,
    options: { limit?: number; maxItems?: number } = {}
  ): Promise<SyncResult> {
    const adapter = this.registry.getOrThrow(sourceId);
    let cursor: string | undefined;
    let total = 0;
    let indexed = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ contentId: string; error: string }> = [];

    const maxItems = options.maxItems ?? 1000;

    while (total < maxItems) {
      if (!adapter.listIndexableReferences) {
        break;
      }

      const batch = await adapter.listIndexableReferences({
        cursor,
        limit: options.limit ?? 25,
      });

      if (!batch.items || batch.items.length === 0) {
        break;
      }

      for (const ref of batch.items) {
        total++;
        const result = await this.indexDocument(ref.sourceId, ref.contentId, ref.revisionId);

        if (result.status === 'INDEXED') {
          indexed++;
        } else if (result.status === 'SKIPPED_UNCHANGED') {
          skipped++;
        } else {
          failed++;
          errors.push({ contentId: ref.contentId, error: result.error ?? 'Unknown error' });
        }

        if (total >= maxItems) break;
      }

      if (!batch.nextCursor || batch.nextCursor === cursor) {
        break;
      }
      cursor = batch.nextCursor;
    }

    return {
      sourceId,
      total,
      indexed,
      skipped,
      failed,
      errors,
    };
  }

  /**
   * Synchronizes all indexable documents across all registered sources.
   */
  async syncAll(options: { limit?: number; maxItems?: number } = {}): Promise<SyncResult[]> {
    const sources = this.registry.list();
    const results: SyncResult[] = [];
    for (const source of sources) {
      results.push(await this.syncSource(source.sourceId, options));
    }
    return results;
  }

  /**
   * Removes all semantic projections for a deleted content item.
   */
  async deleteDocument(sourceId: string, contentId: string): Promise<void> {
    await this.semanticIndex.delete(sourceId, contentId);
  }
}
