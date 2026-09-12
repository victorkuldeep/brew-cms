import type { EmbeddingProvider } from '../domain/ports.js';
import { EmbeddingProviderUnavailableError } from '../domain/errors.js';
import { resolveStoragePaths } from '@brew-cms/core';

export interface TransformersJsProviderOptions {
  modelId?: string;
  modelVersion?: string;
  dimensions?: number;
  batchSize?: number;
  quantized?: boolean;
  /**
   * Disk cache for downloaded model weights.
   * Defaults to the persistent models dir (`<storage>/models/transformers`),
   * overridable via `BREW_MODEL_CACHE_DIR` / `MODEL_CACHE_DIR`.
   * Must be persistent across deploys — otherwise weights re-download
   * (~23MB quantized) on every restart.
   */
  cacheDir?: string;
}

export class TransformersJsEmbeddingProvider implements EmbeddingProvider {
  public readonly modelId: string;
  public readonly modelVersion: string;
  public readonly dimensions: number;
  private readonly batchSize: number;
  private readonly quantized: boolean;
  private readonly cacheDir?: string;

  private extractorPromise: Promise<any> | null = null;

  constructor(options: TransformersJsProviderOptions = {}) {
    this.modelId = options.modelId ?? 'Xenova/bge-small-en-v1.5';
    this.modelVersion = options.modelVersion ?? '1.5.0';
    this.dimensions = options.dimensions ?? 384;
    this.batchSize = options.batchSize ?? 4;
    this.quantized = options.quantized ?? true;
    this.cacheDir = options.cacheDir;
  }

  /**
   * Lazily loads the Transformers.js feature-extraction pipeline as a singleton.
   */
  private async getExtractor(): Promise<any> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        try {
          const { pipeline, env } = await import('@xenova/transformers');

          // WASM backend — works everywhere without native binaries.
          env.backends.onnx.wasm.numThreads = 1;

          const cacheDir =
            this.cacheDir ??
            process.env.BREW_MODEL_CACHE_DIR ??
            process.env.MODEL_CACHE_DIR ??
            resolveStoragePaths().modelsDir;
          env.cacheDir = cacheDir;
          env.allowRemoteModels = true;
          env.allowLocalModels = true;

          // eslint-disable-next-line no-console
          console.log(`[brew-cms:intelligence] model cache: ${cacheDir}`);

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
