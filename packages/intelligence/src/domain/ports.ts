import type {
  ContentReference,
  ContentRevisionReference,
  ContentSourceCapabilities,
  CanonicalContent,
  CanonicalContentRevision,
  IndexableContent,
  SemanticDocumentProjection,
  SemanticMatch,
  SemanticIndexStatus,
} from './types.js';

export type { ContentSourceCapabilities };

export interface ContentSourceAdapter {
  readonly sourceId: string;
  readonly capabilities: ContentSourceCapabilities;

  /**
   * Retrieves the canonical content from its originating authoritative store.
   */
  getContent(ref: ContentReference): Promise<CanonicalContent | null>;

  /**
   * Retrieves an immutable revision if supported by the originating source.
   */
  getRevision?(ref: ContentRevisionReference): Promise<CanonicalContentRevision | null>;

  /**
   * Extracts transient normalized content, metadata, and cryptographic hash for indexing.
   */
  getIndexableContent(ref: ContentReference): Promise<IndexableContent | null>;

  /**
   * Returns a revision token or hash for fast freshness checks.
   */
  getRevisionToken?(ref: ContentReference): Promise<string | null>;

  /**
   * Enumerates indexable content references for initial or bulk synchronization.
   */
  listIndexableReferences?(options?: { cursor?: string; limit?: number }): Promise<{
    items: ContentReference[];
    nextCursor?: string;
  }>;
}

export interface SourceRegistry {
  register(adapter: ContentSourceAdapter): void;
  unregister(sourceId: string): void;
  get(sourceId: string): ContentSourceAdapter | undefined;
  getOrThrow(sourceId: string): ContentSourceAdapter;
  list(): ContentSourceAdapter[];
  has(sourceId: string): boolean;
}

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly dimensions: number;

  /**
   * Generates embedding vectors for a batch of text chunks.
   */
  embedDocuments(texts: readonly string[]): Promise<readonly number[][]>;

  /**
   * Generates an embedding vector for a search query using the identical model and embedding space.
   */
  embedQuery(text: string): Promise<readonly number[]>;
}

export interface SemanticSearchOptions {
  limit?: number;
  sourceId?: string;
  minSimilarity?: number;
}

export interface SemanticIndexProvider {
  readonly providerId: string;

  /**
   * Persists the semantic projection (references, identifiers, vectors) without saving content text.
   */
  upsert(projection: SemanticDocumentProjection): Promise<void>;

  /**
   * Searches for nearest neighbor chunks via vector similarity.
   */
  search(queryVector: readonly number[], options?: SemanticSearchOptions): Promise<SemanticMatch[]>;

  /**
   * Marks projections stale or inactive when a newer revision becomes canonical.
   */
  markStale(sourceId: string, contentId: string, revisionId?: string): Promise<void>;

  /**
   * Removes projections when canonical content is deleted.
   */
  delete(sourceId: string, contentId: string): Promise<void>;

  /**
   * Reports health and metrics for the semantic storage backend.
   */
  getStatus(): Promise<SemanticIndexStatus>;
}
