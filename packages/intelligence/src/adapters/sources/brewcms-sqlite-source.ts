import type {
  ContentSourceAdapter,
  ContentSourceCapabilities,
} from '../../domain/ports.js';
import type {
  ContentReference,
  ContentRevisionReference,
  CanonicalContent,
  CanonicalContentRevision,
  IndexableContent,
} from '../../domain/types.js';
import type {
  DocumentRepository,
  RevisionRepository,
} from '@brew-cms/core';
import { compileContent } from '@brew-cms/content';

export class BrewCMSSqliteSourceAdapter implements ContentSourceAdapter {
  public readonly sourceId: string;
  public readonly capabilities: ContentSourceCapabilities = {
    supportsRevisions: true,
    supportsSubscriptions: true,
    supportsBulkListing: true,
  };

  constructor(
    private readonly docRepo: DocumentRepository,
    private readonly revRepo: RevisionRepository,
    options: { sourceId?: string } | string = {}
  ) {
    if (typeof options === 'string') {
      this.sourceId = options;
    } else {
      this.sourceId = options.sourceId ?? 'brewcms-sqlite';
    }
  }

  async getContent(ref: ContentReference): Promise<CanonicalContent | null> {
    const doc = await this.docRepo.findById(ref.contentId);
    if (!doc) return null;

    // Resolve target revision: explicit revisionId or published revision
    const targetRevId = ref.revisionId ?? doc.publishedRevisionId;
    let body = '';
    let summary: string | null = doc.excerpt ?? null;

    if (targetRevId) {
      const rev = await this.revRepo.findById(targetRevId);
      if (rev) {
        body = rev.sourceMarkdown;
      }
    }

    return {
      sourceId: this.sourceId,
      contentId: doc.id,
      revisionId: targetRevId ?? undefined,
      title: doc.title,
      slug: doc.slug,
      canonicalUrl: doc.canonicalUrl ?? `/documents/${doc.slug}`,
      summary,
      body,
      status: doc.status,
      metadata: {
        type: doc.type,
        authorId: doc.authorId,
        scheduledAt: doc.scheduledAt,
      },
      publishedAt: doc.status === 'PUBLISHED' ? doc.updatedAt : null,
      updatedAt: doc.updatedAt,
    };
  }

  async getRevision(ref: ContentRevisionReference): Promise<CanonicalContentRevision | null> {
    const rev = await this.revRepo.findById(ref.revisionId);
    if (!rev) return null;

    return {
      sourceId: this.sourceId,
      contentId: rev.documentId,
      revisionId: rev.id,
      contentHash: rev.contentHash,
      body: rev.sourceMarkdown,
      createdAt: rev.createdAt,
    };
  }

  async getIndexableContent(ref: ContentReference): Promise<IndexableContent | null> {
    const canonical = await this.getContent(ref);
    if (!canonical || !canonical.body) return null;

    // Use BrewCMS compiler to extract clean search text and compute content hash
    const compiled = compileContent(canonical.body);

    const revisionId = canonical.revisionId ?? 'current';

    return {
      sourceId: this.sourceId,
      contentId: canonical.contentId,
      revisionId,
      canonicalUrl: canonical.canonicalUrl,
      title: canonical.title,
      // Transient plain text extracted from Content IR nodes. Discarded after embedding.
      textForEmbedding: `${canonical.title}\n\n${compiled.searchText}`,
      metadata: {
        contentType: (canonical.metadata?.type as string) ?? 'document',
        publishedAt: canonical.publishedAt ? String(canonical.publishedAt) : undefined,
        updatedAt: canonical.updatedAt ? String(canonical.updatedAt) : undefined,
      },
      contentHash: compiled.contentHash,
    };
  }

  async getRevisionToken(ref: ContentReference): Promise<string | null> {
    const doc = await this.docRepo.findById(ref.contentId);
    return doc?.publishedRevisionId ?? null;
  }

  async listIndexableReferences(options?: { cursor?: string; limit?: number }): Promise<{
    items: ContentReference[];
    nextCursor?: string;
  }> {
    const limit = options?.limit ?? 50;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    const { items, total } = await this.docRepo.list({
      status: 'PUBLISHED',
      limit,
      offset,
    });

    const refs: ContentReference[] = items.map((doc: any) => ({
      sourceId: this.sourceId,
      contentId: doc.id,
      revisionId: doc.publishedRevisionId ?? undefined,
    }));

    const nextOffset = offset + items.length;
    const nextCursor = nextOffset < total ? String(nextOffset) : undefined;

    return { items: refs, nextCursor };
  }
}

export { BrewCMSSqliteSourceAdapter as BrewCmsSqliteSourceAdapter };
