import type {
  Actor,
  Document,
  Revision,
} from '../domain/types.js';
import {
  NotFoundError,
  PolicyDeniedError,
  InvalidStateTransitionError,
  ValidationError,
} from '../domain/errors.js';
import type {
  DocumentRepository,
  RevisionRepository,
  AuditEventRepository,
} from '../ports/repositories.js';
import type { Clock, IdGenerator, PolicyEnginePort, EventBus } from '../ports/services.js';

export class WorkflowService {
  constructor(
    private readonly docRepo: DocumentRepository,
    private readonly revRepo: RevisionRepository,
    private readonly auditRepo: AuditEventRepository,
    private readonly policyEngine: PolicyEnginePort,
    private readonly clock: Clock,
    private readonly idGen: IdGenerator,
    private readonly eventBus?: EventBus
  ) {}

  async submitForReview(actor: Actor, documentId: string, revisionId?: string): Promise<Document> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new NotFoundError('Document', documentId);

    if (doc.status !== 'DRAFT') {
      throw new InvalidStateTransitionError(doc.status, 'IN_REVIEW');
    }

    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'content:review',
      resourceType: 'document',
      resourceId: documentId,
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    const updated = await this.docRepo.update(documentId, {
      status: 'IN_REVIEW',
      updatedAt: this.clock.now(),
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.submitted',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: documentId,
      before: { status: doc.status },
      after: { status: updated.status, revisionId },
    });

    if (this.eventBus) {
      await this.eventBus.publish({
        type: 'content.submitted',
        payload: { documentId, revisionId },
        actor,
      });
    }

    return updated;
  }

  async requestChanges(actor: Actor, documentId: string, reason?: string): Promise<Document> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new NotFoundError('Document', documentId);

    if (doc.status !== 'IN_REVIEW') {
      throw new InvalidStateTransitionError(doc.status, 'DRAFT');
    }

    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'content:review',
      resourceType: 'document',
      resourceId: documentId,
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    const updated = await this.docRepo.update(documentId, {
      status: 'DRAFT',
      updatedAt: this.clock.now(),
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.changes_requested',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: documentId,
      metadata: { reason },
      before: { status: doc.status },
      after: { status: updated.status },
    });

    return updated;
  }

  async approve(actor: Actor, documentId: string, revisionId?: string): Promise<Document> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new NotFoundError('Document', documentId);

    if (doc.status !== 'IN_REVIEW') {
      throw new InvalidStateTransitionError(doc.status, 'APPROVED');
    }

    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'content:approve',
      resourceType: 'document',
      resourceId: documentId,
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    const updated = await this.docRepo.update(documentId, {
      status: 'APPROVED',
      updatedAt: this.clock.now(),
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.approved',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: documentId,
      before: { status: doc.status },
      after: { status: updated.status, revisionId },
    });

    if (this.eventBus) {
      await this.eventBus.publish({
        type: 'content.approved',
        payload: { documentId, revisionId },
        actor,
      });
    }

    return updated;
  }

  async publish(actor: Actor, documentId: string, revisionId?: string): Promise<{ document: Document; publishedRevision: Revision }> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new NotFoundError('Document', documentId);

    // Policy check: publishing is a privileged domain mutation
    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'content:publish',
      resourceType: 'document',
      resourceId: documentId,
    });

    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    // Resolve target revision
    let targetRev: Revision | null = null;
    if (revisionId) {
      targetRev = await this.revRepo.findById(revisionId);
      if (!targetRev || targetRev.documentId !== documentId) {
        throw new ValidationError(`Revision '${revisionId}' does not belong to document '${documentId}'.`);
      }
    } else {
      targetRev = await this.revRepo.getLatestByDocumentId(documentId);
      if (!targetRev) {
        throw new ValidationError('Cannot publish a document with no revisions.');
      }
    }

    const now = this.clock.now();
    const updated = await this.docRepo.update(documentId, {
      status: 'PUBLISHED',
      publishedRevisionId: targetRev.id,
      scheduledAt: null,
      updatedAt: now,
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.published',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: documentId,
      before: { status: doc.status, publishedRevisionId: doc.publishedRevisionId },
      after: { status: updated.status, publishedRevisionId: targetRev.id },
    });

    if (this.eventBus) {
      await this.eventBus.publish({
        type: 'content.published',
        payload: { documentId, revisionId: targetRev.id },
        actor,
      });
    }

    return { document: updated, publishedRevision: targetRev };
  }

  async unpublish(actor: Actor, documentId: string): Promise<Document> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new NotFoundError('Document', documentId);

    if (doc.status !== 'PUBLISHED') {
      throw new InvalidStateTransitionError(doc.status, 'DRAFT');
    }

    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'content:unpublish',
      resourceType: 'document',
      resourceId: documentId,
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    const updated = await this.docRepo.update(documentId, {
      status: 'DRAFT',
      publishedRevisionId: null,
      updatedAt: this.clock.now(),
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.unpublished',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: documentId,
      before: { status: doc.status, publishedRevisionId: doc.publishedRevisionId },
      after: { status: updated.status, publishedRevisionId: null },
    });

    if (this.eventBus) {
      await this.eventBus.publish({
        type: 'content.unpublished',
        payload: { documentId },
        actor,
      });
    }

    return updated;
  }

  async schedule(
    actor: Actor,
    documentId: string,
    scheduledAt: Date,
    revisionId?: string
  ): Promise<Document> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new NotFoundError('Document', documentId);

    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'content:publish',
      resourceType: 'document',
      resourceId: documentId,
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    if (scheduledAt <= this.clock.now()) {
      throw new ValidationError('Scheduled publication timestamp must be in the future.');
    }

    const updated = await this.docRepo.update(documentId, {
      status: 'SCHEDULED',
      scheduledAt,
      updatedAt: this.clock.now(),
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.scheduled',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: documentId,
      metadata: { scheduledAt: scheduledAt.toISOString(), revisionId },
      before: { status: doc.status },
      after: { status: updated.status, scheduledAt },
    });

    return updated;
  }

  async archive(actor: Actor, documentId: string): Promise<Document> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new NotFoundError('Document', documentId);

    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'content:archive',
      resourceType: 'document',
      resourceId: documentId,
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    const updated = await this.docRepo.update(documentId, {
      status: 'ARCHIVED',
      updatedAt: this.clock.now(),
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'content.archived',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: documentId,
      before: { status: doc.status },
      after: { status: updated.status },
    });

    if (this.eventBus) {
      await this.eventBus.publish({
        type: 'content.archived',
        payload: { documentId },
        actor,
      });
    }

    return updated;
  }

  /**
   * Revisions are IMMUTABLE. Never mutate historical revisions.
   * Restore creates a brand new revision snapshot copying content from the target revision.
   */
  async restoreRevision(
    actor: Actor,
    documentId: string,
    targetRevisionId: string,
    changeSummary?: string
  ): Promise<{ document: Document; restoredRevision: Revision }> {
    const doc = await this.docRepo.findById(documentId);
    if (!doc) throw new NotFoundError('Document', documentId);

    const targetRev = await this.revRepo.findById(targetRevisionId);
    if (!targetRev || targetRev.documentId !== documentId) {
      throw new NotFoundError('Revision', targetRevisionId);
    }

    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'content:update',
      resourceType: 'document',
      resourceId: documentId,
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    const latestRev = await this.revRepo.getLatestByDocumentId(documentId);
    const nextRevNum = (latestRev?.revisionNumber ?? 0) + 1;
    const now = this.clock.now();

    const restoredRevision: Revision = {
      id: this.idGen.generate('rev'),
      documentId,
      revisionNumber: nextRevNum,
      sourceMarkdown: targetRev.sourceMarkdown,
      frontmatter: targetRev.frontmatter,
      contentIr: targetRev.contentIr,
      contentHash: targetRev.contentHash,
      compilerVersion: targetRev.compilerVersion,
      wordCount: targetRev.wordCount,
      readingTimeSeconds: targetRev.readingTimeSeconds,
      createdBy: actor.id,
      changeSummary: changeSummary ?? `Restored from revision #${targetRev.revisionNumber} (${targetRevisionId})`,
      createdAt: now,
    };

    const savedRev = await this.revRepo.create(restoredRevision);
    const updatedDoc = await this.docRepo.update(documentId, {
      updatedAt: now,
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'revision.restored',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'document',
      resourceId: documentId,
      metadata: { targetRevisionId, newRevisionId: savedRev.id },
      after: { revision: savedRev },
    });

    return { document: updatedDoc, restoredRevision: savedRev };
  }
}
