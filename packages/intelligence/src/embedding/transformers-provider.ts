import type { EmbeddingProvider } from '../domain/ports.js';
import { EmbeddingProviderUnavailableError } from '../domain/errors.js';

export interface TransformersJsProviderOptions {
  modelId?: string;
  modelVersion?: string;
  dimensions?: number;
  batchSize?: number;
  quantized?: boolean;
}

export class TransformersJsEmbeddingProvider implements EmbeddingProvider {
  public readonly modelId: string;
  public readonly modelVersion: string;
  public readonly dimensions: number;
  private readonly batchSize: number;
  private readonly quantized: boolean;

  private extractorPromise: Promise<any> | null = null;

  constructor(options: TransformersJsProviderOptions = {}) {
    this.modelId = options.modelId ?? 'Xenova/bge-small-en-v1.5';
    this.modelVersion = options.modelVersion ?? '1.5.0';
    this.dimensions = options.dimensions ?? 384;
    this.batchSize = options.batchSize ?? 4;
    this.quantized = options.quantized ?? true;
  }

  /**
   * Lazily loads the Transformers.js feature-extraction pipeline as a singleton.
   */
  private async getExtractor(): Promise<any> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        try {
          const { pipeline } = await import('@xenova/transformers');
          return await pipeline('feature-extraction', this.modelId, {
            quantized: this.quantized,
          });
        } catch (err) {
          this.extractorPromise = null;
          throw new EmbeddingProviderUnavailableError(
            `Failed to load Transformers.js model '${this.modelId}': ${err instanceof Error ? err.message : String(err)}`,
            err
          );
        }
      })();
    }
    return this.extractorPromise;
  }

  async embedDocuments(texts: readonly string[]): Promise<readonly number[][]> {
    if (texts.length === 0) return [];

    const extractor = await this.getExtractor();
    const results: number[][] = [];

    // Process in bounded batches to maintain safe memory footprint on CPU
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);

      for (const text of batch) {
        const output = await extractor(text, {
          pooling: 'mean',
          normalize: true,
        });

        const rawVector = Array.from(output.data as Float32Array);
        if (rawVector.length !== this.dimensions) {
          throw new Error(
            `Model output dimensions mismatch: expected ${this.dimensions}, got ${rawVector.length}`
          );
        }
        results.push(rawVector);
      }
    }

    return results;
  }

  async embedQuery(text: string): Promise<readonly number[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    const rawVector = Array.from(output.data as Float32Array);
    if (rawVector.length !== this.dimensions) {
      throw new Error(
        `Model output dimensions mismatch: expected ${this.dimensions}, got ${rawVector.length}`
      );
    }
    return rawVector;
  }
}
