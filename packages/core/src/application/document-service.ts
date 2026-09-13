import type {
  Actor,
  Document,
  DocumentFilter,
  DocumentType,
  DocumentSeo,
  Revision,
} from '../domain/types.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  PolicyDeniedError,
} from '../domain/errors.js';
import type {
  DocumentRepository,
  RevisionRepository,
  AuditEventRepository,
} from '../ports/repositories.js';
import type { Clock, IdGenerator, PolicyEnginePort, EventBus } from '../ports/services.js';

export interface CreateDraftInput {
  type: DocumentType;
  slug: string;
  title: string;
  excerpt?: string | null;
  authorId?: string;
  sourceMarkdown: string;
  frontmatter?: Record<string, unknown>;
  contentIr: unknown;
  contentHash: string;
  compilerVersion: string;
  wordCount: number;
  readingTimeSeconds: number;
  seo?: DocumentSeo | null;
}

export interface UpdateDraftInput {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  sourceMarkdown?: string;
  frontmatter?: Record<string, unknown>;
  contentIr?: unknown;
  contentHash?: string;
  compilerVersion?: string;
  wordCount?: number;
  readingTimeSeconds?: number;
  seo?: DocumentSeo | null;
  changeSummary?: string | null;
}

export class DocumentService {
  constructor(
    private readonly docRepo: DocumentRepository,
    private readonly revRepo: RevisionRepository,
    private readonly auditRepo: AuditEventRepository,
    private readonly policyEngine: PolicyEnginePort,
    private readonly clock: Clock,
    private readonly idGen: IdGenerator,
    private readonly eventBus?: EventBus
  ) {}

  async createDraft(actor: Actor, input: CreateDraftInput): Promise<{ document: Document; revision: Revision }> {
    // 1. Evaluate policy
    const policyResult = await this.policyEngine.evaluate({
      actor,
      action: 'content:create',
      resourceType: 'document',
      payload: input,
    });

    if (policyResult.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policyResult.decision, policyResult.reason);
    }

    // 2. Validate input
    if (!input.title || input.title.trim() === '') {
      throw new ValidationError('Document title is required.');
    }
    if (!input.slug || input.slug.trim() === '') {
      throw new ValidationError('Document slug is required.');
    }

    const existing = await this.docRepo.findBySlug(input.slug.trim());
    if (existing) {
      throw new ConflictError(`A document with slug '${input.slug}' already exists.`);
    }

    const now = this.clock.now();
    const docId = this.idGen.generate('doc');
    const revId = this.idGen.generate('rev');

    const document: Document = {
      id: docId,
      type: input.type,
      slug: input.slug.trim().toLowerCase(),
      title: input.title.trim(),
      excerpt: input.excerpt ?? null,
      status: 'DRAFT',
      authorId: input.authorId ?? (actor.type === 'human' ? actor.id : 'usr_admin_default'),
      publishedRevisionId: null,
      canonicalUrl: null,
      scheduledAt: null,
      seo: input.seo ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const savedDoc = await this.docRepo.create(document);

    const revision: Revision = {
      id: revId,
      documentId: docId,
      revisionNumber: 1,
      sourceMarkdown: input.sourceMarkdown,
      frontmatter: input.frontmatter ?? {},
      contentIr: input.contentIr,
      contentHash: input.contentHash,
      compilerVersion: input.compilerVersion,
      wordCount: input.wordCount,
      readingTimeSeconds: input.readingTimeSeconds,
      createdBy: actor.id,
      changeSummary: 'Initial draft',
      createdAt: now,
    };

    const savedRev = await this.revRepo.create(revision);

    // Audit log
    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.created',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: savedDoc.id,
      after: { document: savedDoc, revision: savedRev },
    });

    if (this.eventBus) {
      await this.eventBus.publish({
        type: 'content.created',
        payload: { documentId: savedDoc.id, revisionId: savedRev.id },
        actor,
      });
    }

    return { document: savedDoc, revision: savedRev };
  }

  async updateDraft(
    actor: Actor,
    id: string,
    input: UpdateDraftInput
  ): Promise<{ document: Document; revision?: Revision }> {
    const doc = await this.docRepo.findById(id);
    if (!doc) {
      throw new NotFoundError('Document', id);
    }

    // Policy check
    const policyResult = await this.policyEngine.evaluate({
      actor,
      action: 'content:update',
      resourceType: 'document',
      resourceId: id,
      payload: input,
    });

    if (policyResult.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policyResult.decision, policyResult.reason);
    }

    if (input.slug && input.slug !== doc.slug) {
      const existing = await this.docRepo.findBySlug(input.slug.trim());
      if (existing && existing.id !== id) {
        throw new ConflictError(`A document with slug '${input.slug}' already exists.`);
      }
    }

    const now = this.clock.now();
    const docUpdates: Partial<Document> = {
      updatedAt: now,
    };

    if (input.title !== undefined) docUpdates.title = input.title.trim();
    if (input.slug !== undefined) docUpdates.slug = input.slug.trim().toLowerCase();
    if (input.excerpt !== undefined) docUpdates.excerpt = input.excerpt;
    if (input.seo !== undefined) docUpdates.seo = input.seo;

    const updatedDoc = await this.docRepo.update(id, docUpdates);

    let savedRev: Revision | undefined;

    if (input.sourceMarkdown !== undefined && input.contentHash) {
      const latestRev = await this.revRepo.getLatestByDocumentId(id);
      const nextRevNum = (latestRev?.revisionNumber ?? 0) + 1;

      const newRev: Revision = {
        id: this.idGen.generate('rev'),
        documentId: id,
        revisionNumber: nextRevNum,
        sourceMarkdown: input.sourceMarkdown,
        frontmatter: input.frontmatter ?? {},
        contentIr: input.contentIr ?? {},
        contentHash: input.contentHash,
        compilerVersion: input.compilerVersion ?? '1.0.0',
        wordCount: input.wordCount ?? 0,
        readingTimeSeconds: input.readingTimeSeconds ?? 0,
        createdBy: actor.id,
        changeSummary: input.changeSummary ?? 'Updated draft content',
        createdAt: now,
      };

      savedRev = await this.revRepo.create(newRev);
    }

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.updated',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: id,
      before: doc,
      after: { document: updatedDoc, revision: savedRev },
    });

    if (this.eventBus) {
      await this.eventBus.publish({
        type: 'content.updated',
        payload: { documentId: id, revisionId: savedRev?.id },
        actor,
      });
    }

    return { document: updatedDoc, revision: savedRev };
  }

  async getDocument(id: string): Promise<Document> {
    const doc = await this.docRepo.findById(id);
    if (!doc) {
      throw new NotFoundError('Document', id);
    }
    return doc;
  }

  async getDocumentBySlug(slug: string): Promise<Document> {
    const doc = await this.docRepo.findBySlug(slug);
    if (!doc) {
      throw new NotFoundError('Document', slug);
    }
    return doc;
  }

  async listDocuments(filter?: DocumentFilter): Promise<{ items: Document[]; total: number; nextCursor?: string }> {
    return this.docRepo.list(filter);
  }

  /**
   * Lists revisions for a document through the service boundary (validates
   * the document exists). Reads stay open; mutations remain policy-gated.
   */
  async getRevisions(documentId: string): Promise<Revision[]> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) {
      throw new NotFoundError('Document', documentId);
    }
    return this.revRepo.listByDocumentId(documentId);
  }

  async deleteDocument(actor: Actor, id: string): Promise<void> {
    const doc = await this.docRepo.findById(id);
    if (!doc) {
      throw new NotFoundError('Document', id);
    }

    const policyResult = await this.policyEngine.evaluate({
      actor,
      action: 'content:delete',
      resourceType: 'document',
      resourceId: id,
    });

    if (policyResult.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policyResult.decision, policyResult.reason);
    }

    await this.docRepo.delete(id);

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.deleted',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: id,
      before: doc,
    });

    if (this.eventBus) {
      await this.eventBus.publish({
        type: 'content.deleted',
        payload: { documentId: id },
        actor,
      });
    }
  }
}
