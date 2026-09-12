import type { SourceRegistry } from '../domain/ports.js';
import type {
  ContentReference,
  CanonicalContent,
  SearchResultReference,
} from '../domain/types.js';

export interface ResolvedResult {
  reference: SearchResultReference;
  content: CanonicalContent | null;
  error?: string;
}

export class CanonicalSourceResolver {
  private readonly timeoutMs: number;
  private readonly concurrency: number;

  constructor(
    private readonly registry: SourceRegistry,
    options: { timeoutMs?: number; concurrency?: number } = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.concurrency = options.concurrency ?? 5;
  }

  /**
   * Resolves a single reference against its authoritative originating source.
   */
  async resolve(ref: ContentReference): Promise<CanonicalContent | null> {
    const adapter = this.registry.get(ref.sourceId);
    if (!adapter) {
      return null;
    }

    try {
      const fetchPromise = adapter.getContent(ref);
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout resolving content from source '${ref.sourceId}'`)), this.timeoutMs)
      );

      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch {
      return null;
    }
  }

  /**
   * Resolves an array of search result references with bounded concurrency and timeout safety.
   */
  async resolveMany(references: SearchResultReference[]): Promise<ResolvedResult[]> {
    const results: ResolvedResult[] = [];

    // Process in bounded batches to protect upstream databases/sources
    for (let i = 0; i < references.length; i += this.concurrency) {
      const batch = references.slice(i, i + this.concurrency);

      const batchResults = await Promise.all(
        batch.map(async (ref): Promise<ResolvedResult> => {
          try {
            const content = await this.resolve(ref);
            return {
              reference: ref,
              content,
            };
          } catch (err: any) {
            return {
              reference: ref,
              content: null,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
      );

      results.push(...batchResults);
    }

    return results;
  }
}
