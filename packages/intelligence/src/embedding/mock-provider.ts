import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from '../domain/ports.js';

export class DeterministicMockEmbeddingProvider implements EmbeddingProvider {
  public readonly modelId: string;
  public readonly modelVersion: string;
  public readonly dimensions: number;

  constructor(options: { modelId?: string; modelVersion?: string; dimensions?: number } = {}) {
    this.modelId = options.modelId ?? 'Xenova/bge-small-en-v1.5';
    this.modelVersion = options.modelVersion ?? '1.5.0-mock';
    this.dimensions = options.dimensions ?? 384;
  }

  async embedDocuments(texts: readonly string[]): Promise<readonly number[][]> {
    return texts.map((t) => this.vectorize(t));
  }

  async embedQuery(text: string): Promise<readonly number[]> {
    return this.vectorize(text);
  }

  /**
   * Deterministically generates a unit-length vector of the target dimensionality
   * by accumulating deterministic word embeddings. Overlapping words yield
   * positive cosine similarity, simulating real semantic embedding behavior.
   */
  private vectorize(text: string): number[] {
    const words = text.toLowerCase().match(/[a-z0-9_]+/g) ?? ['empty'];
    const sumVec = new Float64Array(this.dimensions);

    for (const word of words) {
      const wVec = this.wordVector(word);
      for (let i = 0; i < this.dimensions; i++) {
        sumVec[i] += wVec[i];
      }
    }

    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += sumVec[i] * sumVec[i];
    }
    norm = Math.sqrt(norm);

    const out: number[] = new Array(this.dimensions);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        out[i] = Number((sumVec[i] / norm).toFixed(6));
      }
    } else {
      out.fill(0);
    }
    return out;
  }

  private wordVector(word: string): number[] {
    const hash = createHash('sha256').update(word).digest();
    const vec: number[] = new Array(this.dimensions);

    let seed = hash.readUInt32LE(0);
    for (let i = 0; i < this.dimensions; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      vec[i] = (seed / 4294967295) * 2 - 1;
    }

    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vec[i] /= norm;
      }
    }
    return vec;
  }
}
