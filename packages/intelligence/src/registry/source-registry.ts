import type { ContentSourceAdapter, SourceRegistry } from '../domain/ports.js';
import { SourceNotFoundError } from '../domain/errors.js';

export class DefaultSourceRegistry implements SourceRegistry {
  private readonly adapters = new Map<string, ContentSourceAdapter>();

  register(adapter: ContentSourceAdapter): void {
    if (!adapter.sourceId || typeof adapter.sourceId !== 'string') {
      throw new Error('Adapter must define a non-empty sourceId.');
    }
    this.adapters.set(adapter.sourceId, adapter);
  }

  unregister(sourceId: string): void {
    this.adapters.delete(sourceId);
  }

  get(sourceId: string): ContentSourceAdapter | undefined {
    return this.adapters.get(sourceId);
  }

  getOrThrow(sourceId: string): ContentSourceAdapter {
    const adapter = this.adapters.get(sourceId);
    if (!adapter) {
      throw new SourceNotFoundError(sourceId);
    }
    return adapter;
  }

  list(): ContentSourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(sourceId: string): boolean {
    return this.adapters.has(sourceId);
  }
}
