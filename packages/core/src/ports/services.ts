import type { Actor, PolicyDecision } from '../domain/types.js';

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(prefix?: string): string;
}

export interface EventBus {
  publish(event: {
    type: string;
    payload: unknown;
    correlationId?: string;
    actor?: Actor;
  }): Promise<void>;
  subscribe(eventType: string, handler: (event: any) => Promise<void>): () => void;
}

export interface PolicyEvaluationContext {
  actor: Actor;
  action: string;
  resourceType: string;
  resourceId?: string;
  payload?: unknown;
  isDryRun?: boolean;
}

export interface PolicyEnginePort {
  evaluate(context: PolicyEvaluationContext): Promise<{
    decision: PolicyDecision;
    reason?: string;
  }>;
}

export interface SearchDocument {
  id: string;
  type: string;
  title: string;
  excerpt?: string | null;
  contentText: string;
  authorId: string;
  topics?: string[];
  tags?: string[];
  series?: string[];
  publishedAt?: Date | null;
  url?: string | null;
}

export interface SearchQuery {
  query: string;
  limit?: number;
  offset?: number;
  type?: string;
  topicId?: string;
  tagId?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  excerpt?: string | null;
  score: number;
  url?: string | null;
}

export interface SearchProvider {
  index(document: SearchDocument): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult[]>;
}

export interface StoredAsset {
  provider: 'local' | 's3' | 'r2';
  providerKey: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
  checksum: string;
}

export interface UploadInput {
  filename: string;
  mimeType: string;
  content: Uint8Array | Buffer;
  prefix?: string;
}

export interface MediaProvider {
  put(input: UploadInput): Promise<StoredAsset>;
  get(key: string): Promise<{ url: string; stream?: unknown }>;
  delete(key: string): Promise<void>;
  signedUrl?(key: string, options?: { expiresInSeconds?: number }): Promise<string>;
}
