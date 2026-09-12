import { createHash } from 'node:crypto';
import type {
  ContentSourceAdapter,
  ContentSourceCapabilities,
} from '../../domain/ports.js';
import type {
  ContentReference,
  CanonicalContent,
  IndexableContent,
} from '../../domain/types.js';

export class MockContentSourceAdapter implements ContentSourceAdapter {
  public readonly sourceId: string;
  public readonly capabilities: ContentSourceCapabilities = {
    supportsRevisions: true,
    supportsSubscriptions: true,
    supportsBulkListing: true,
  };

  private contentMap = new Map<string, CanonicalContent>();

  constructor(sourceId: string, initialItems: CanonicalContent[] = []) {
    this.sourceId = sourceId;
    for (const item of initialItems) {
      this.contentMap.set(item.contentId, item);
    }
  }

  set(item: CanonicalContent): void {
    this.contentMap.set(item.contentId, item);
  }

  remove(contentId: string): void {
    this.contentMap.delete(contentId);
  }

  async getContent(ref: ContentReference): Promise<CanonicalContent | null> {
    return this.contentMap.get(ref.contentId) ?? null;
  }

  async getIndexableContent(ref: ContentReference): Promise<IndexableContent | null> {
    const canonical = await this.getContent(ref);
    if (!canonical) return null;

    const textForEmbedding = `${canonical.title}\n\n${canonical.summary ?? ''}\n\n${canonical.body}`;
    const contentHash = createHash('sha256').update(textForEmbedding).digest('hex');

    return {
      sourceId: this.sourceId,
      contentId: canonical.contentId,
      revisionId: canonical.revisionId ?? 'rev-1',
      canonicalUrl: canonical.canonicalUrl,
      title: canonical.title,
      textForEmbedding,
      metadata: {
        ...(canonical.metadata ?? {}),
        publishedAt: canonical.publishedAt ? String(canonical.publishedAt) : undefined,
      },
      contentHash,
    };
  }

  async listIndexableReferences(): Promise<{ items: ContentReference[] }> {
    const items = Array.from(this.contentMap.values()).map((c) => ({
      sourceId: this.sourceId,
      contentId: c.contentId,
      revisionId: c.revisionId,
    }));
    return { items };
  }
}
