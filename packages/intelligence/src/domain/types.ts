export interface ContentReference {
  sourceId: string;
  contentId: string;
  revisionId?: string;
}

export interface ContentRevisionReference {
  sourceId: string;
  contentId: string;
  revisionId: string;
}

export interface ContentSourceCapabilities {
  supportsRevisions: boolean;
  supportsSubscriptions?: boolean;
  supportsBulkListing?: boolean;
}

export interface CanonicalContent {
  sourceId: string;
  contentId: string;
  revisionId?: string;
  title: string;
  slug?: string;
  canonicalUrl: string;
  summary?: string | null;
  body: string; // Authoritative markdown or content from source
  metadata?: Record<string, unknown>;
  status?: string;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface CanonicalContentRevision {
  sourceId: string;
  contentId: string;
  revisionId: string;
  contentHash: string;
  body: string;
  createdAt: Date | string;
}

export interface IndexableContent {
  sourceId: string;
  contentId: string;
  revisionId: string;
  canonicalUrl: string;
  title: string;
  textForEmbedding: string; // TRANSIENT processing string. NEVER permanently stored in semantic index.
  metadata: {
    contentType?: string;
    topics?: string[];
    tags?: string[];
    series?: string[];
    authors?: string[];
    audiences?: string[];
    publishedAt?: string;
    updatedAt?: string;
    language?: string;
    [key: string]: unknown;
  };
  contentHash: string;
}

export interface SemanticChunk {
  chunkIndex: number;
  chunkHash: string;
  text: string; // Transient during chunking/embedding only!
  tokenCountEstimate: number;
  headingContext?: string;
}

export interface SemanticChunkProjection {
  id?: string;
  chunkIndex: number;
  chunkHash: string;
  embedding: readonly number[]; // VECTOR(384)
  createdAt?: Date | string;
}

export type IndexStatus = 'PENDING' | 'INDEXING' | 'READY' | 'STALE' | 'FAILED' | 'DELETED';

export interface SemanticDocumentProjection {
  id: string; // e.g. doc-source-content-rev
  sourceId: string;
  contentId: string;
  revisionId: string;
  canonicalUrl: string;
  contentHash: string;
  embeddingModel: string;
  embeddingVersion: string;
  embeddingDimensions: number;
  indexStatus: IndexStatus;
  // NOTE: Strictly chunk identifiers and embeddings. ZERO article body / ZERO chunk text stored!
  chunks: SemanticChunkProjection[];
  metadataJson?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface SemanticMatch {
  sourceId: string;
  contentId: string;
  revisionId: string;
  canonicalUrl: string;
  chunkIndex: number;
  distance: number; // Cosine distance [0..2]
  similarity: number; // 1 - distance [0..1]
}

export interface SearchResultReference {
  sourceId: string;
  contentId: string;
  revisionId: string;
  canonicalUrl: string;
  score: number; // Normalized fused score [0..1]
  matchedChunkIds?: string[];
  reasons?: string[];
  metadata?: Record<string, unknown>;
}

export interface SemanticIndexStatus {
  providerId: string;
  ready: boolean;
  documentCount: number;
  chunkCount: number;
  embeddingModel: string;
  dimensions: number;
}
