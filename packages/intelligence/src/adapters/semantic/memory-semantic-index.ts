import type {
  SemanticIndexProvider,
  SemanticSearchOptions,
} from '../../domain/ports.js';
import type {
  SemanticDocumentProjection,
  SemanticMatch,
  SemanticIndexStatus,
} from '../../domain/types.js';

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class MemorySemanticIndexAdapter implements SemanticIndexProvider {
  public readonly providerId = 'memory';

  // Map of document ID -> SemanticDocumentProjection
  private documents = new Map<string, SemanticDocumentProjection>();

  async upsert(projection: SemanticDocumentProjection): Promise<void> {
    // Assert strictly that no full content or chunk text is stored in projection
    for (const chunk of projection.chunks) {
      if ((chunk as any).text !== undefined) {
        delete (chunk as any).text;
      }
    }
    this.documents.set(projection.id, { ...projection });
  }

  async search(
    queryVector: readonly number[],
    options: SemanticSearchOptions = {}
  ): Promise<SemanticMatch[]> {
    const minSim = options.minSimilarity ?? 0.1;
    const limit = options.limit ?? 20;
    const matches: SemanticMatch[] = [];

    for (const doc of this.documents.values()) {
      if (doc.indexStatus !== 'READY') continue;
      if (options.sourceId && doc.sourceId !== options.sourceId) continue;

      for (const chunk of doc.chunks) {
        const similarity = cosineSimilarity(queryVector, chunk.embedding);
        if (similarity >= minSim) {
          matches.push({
            sourceId: doc.sourceId,
            contentId: doc.contentId,
            revisionId: doc.revisionId,
            canonicalUrl: doc.canonicalUrl,
            chunkIndex: chunk.chunkIndex,
            distance: Number((1 - similarity).toFixed(6)),
            similarity: Number(similarity.toFixed(6)),
          });
        }
      }
    }

    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches.slice(0, limit);
  }

  async markStale(sourceId: string, contentId: string, revisionId?: string): Promise<void> {
    for (const doc of this.documents.values()) {
      if (doc.sourceId === sourceId && doc.contentId === contentId) {
        if (!revisionId || doc.revisionId !== revisionId) {
          doc.indexStatus = 'STALE';
        }
      }
    }
  }

  async delete(sourceId: string, contentId: string): Promise<void> {
    for (const [key, doc] of this.documents.entries()) {
      if (doc.sourceId === sourceId && doc.contentId === contentId) {
        this.documents.delete(key);
      }
    }
  }

  async getStatus(): Promise<SemanticIndexStatus> {
    let chunkCount = 0;
    let model = 'unknown';
    let dims = 0;

    for (const doc of this.documents.values()) {
      if (doc.indexStatus === 'READY') {
        chunkCount += doc.chunks.length;
        model = doc.embeddingModel;
        dims = doc.embeddingDimensions;
      }
    }

    return {
      providerId: this.providerId,
      ready: true,
      documentCount: this.documents.size,
      chunkCount,
      embeddingModel: model,
      dimensions: dims,
    };
  }

  /**
   * Internal test inspection helper to verify zero chunk text is stored.
   */
  getAllProjections(): SemanticDocumentProjection[] {
    return Array.from(this.documents.values());
  }

  clear(): void {
    this.documents.clear();
  }
}
