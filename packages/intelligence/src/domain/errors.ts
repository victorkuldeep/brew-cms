export class IntelligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'IntelligenceError';
  }
}

export class EmbeddingProviderUnavailableError extends IntelligenceError {
  constructor(message = 'Embedding provider is currently unavailable.', details?: unknown) {
    super('EMBEDDING_PROVIDER_UNAVAILABLE', message, details);
  }
}

export class SemanticIndexUnavailableError extends IntelligenceError {
  constructor(message = 'Semantic index is currently unavailable.', details?: unknown) {
    super('SEMANTIC_INDEX_UNAVAILABLE', message, details);
  }
}

export class SourceNotFoundError extends IntelligenceError {
  constructor(sourceId: string) {
    super('SOURCE_NOT_FOUND', `Content source adapter for '${sourceId}' was not found in registry.`, { sourceId });
  }
}

export class ContentNotFoundError extends IntelligenceError {
  constructor(sourceId: string, contentId: string, revisionId?: string) {
    super('CONTENT_NOT_FOUND', `Canonical content '${contentId}' was not found in source '${sourceId}'.`, {
      sourceId,
      contentId,
      revisionId,
    });
  }
}

export class InvalidDimensionsError extends IntelligenceError {
  constructor(expected: number, received: number) {
    super(
      'INVALID_EMBEDDING_DIMENSIONS',
      `Vector dimensions mismatch: expected ${expected}, received ${received}.`,
      { expected, received }
    );
  }
}
