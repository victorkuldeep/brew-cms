import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentService } from '../application/document-service.js';
import { WorkflowService } from '../application/workflow-service.js';
import type {
  DocumentRepository,
  RevisionRepository,
  AuditEventRepository,
} from '../ports/repositories.js';
import type { Clock, IdGenerator, PolicyEnginePort } from '../ports/services.js';
import type { Document, Revision, AuditEvent, Actor } from '../domain/types.js';
import { InvalidStateTransitionError, PolicyDeniedError } from '../domain/errors.js';

class MockDocumentRepository implements DocumentRepository {
  public docs = new Map<string, Document>();

  async findById(id: string): Promise<Document | null> {
    return this.docs.get(id) || null;
  }
  async findBySlug(slug: string): Promise<Document | null> {
    for (const doc of this.docs.values()) {
      if (doc.slug === slug) return doc;
    }
    return null;
  }
  async create(doc: Omit<Document, 'createdAt' | 'updatedAt'>): Promise<Document> {
    const full: Document = { ...doc, createdAt: new Date(), updatedAt: new Date() };
    this.docs.set(doc.id, full);
    return full;
  }
  async update(id: string, updates: Partial<Document>): Promise<Document> {
    const doc = this.docs.get(id);
    if (!doc) throw new Error('Not found');
    const updated = { ...doc, ...updates, updatedAt: new Date() };
    this.docs.set(id, updated);
    return updated;
  }
  async delete(id: string): Promise<void> {
    this.docs.delete(id);
  }
  async list(): Promise<{ items: Document[]; total: number }> {
    const items = Array.from(this.docs.values());
    return { items, total: items.length };
  }
}

class MockRevisionRepository implements RevisionRepository {
  public revs = new Map<string, Revision>();

  async findById(id: string): Promise<Revision | null> {
    return this.revs.get(id) || null;
  }
  async listByDocumentId(documentId: string): Promise<Revision[]> {
    return Array.from(this.revs.values()).filter((r) => r.documentId === documentId);
  }
  async getLatestByDocumentId(documentId: string): Promise<Revision | null> {
    const revs = await this.listByDocumentId(documentId);
    if (revs.length === 0) return null;
    return revs.sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
  }
  async create(revision: Omit<Revision, 'createdAt'>): Promise<Revision> {
    const full: Revision = { ...revision, createdAt: new Date() };
    this.revs.set(revision.id, full);
    return full;
  }
}

class MockAuditRepository implements AuditEventRepository {
  public events: AuditEvent[] = [];
  async create(event: Omit<AuditEvent, 'createdAt'>): Promise<AuditEvent> {
    const full: AuditEvent = { ...event, createdAt: new Date() };
    this.events.push(full);
    return full;
  }
  async list(): Promise<AuditEvent[]> {
    return this.events;
  }
}

describe('Document and Workflow Services', () => {
  let docRepo: MockDocumentRepository;
  let revRepo: MockRevisionRepository;
  let auditRepo: MockAuditRepository;
  let clock: Clock;
  let idGen: IdGenerator;
  let policyEngine: PolicyEnginePort;
  let docService: DocumentService;
  let workflowService: WorkflowService;

  const humanEditor: Actor = {
    id: 'user_1',
    type: 'human',
    name: 'Editor User',
    role: 'Editor',
    scopes: ['content:create', 'content:update', 'content:review', 'content:approve', 'content:publish'],
  };

  const agentActor: Actor = {
    id: 'agent_1',
    type: 'agent',
    name: 'ContentBot',
    role: 'Agent',
    scopes: ['content:create', 'content:update', 'content:review'],
  };

  beforeEach(() => {
    docRepo = new MockDocumentRepository();
    revRepo = new MockRevisionRepository();
    auditRepo = new MockAuditRepository();
    clock = { now: () => new Date('2026-09-12T12:00:00Z') };

    let counter = 1;
    idGen = { generate: (prefix = 'id') => `${prefix}_${counter++}` };

    policyEngine = {
      async evaluate(context) {
        // Default policy rules:
        // Agents cannot directly publish without human approval
        if (context.actor.type === 'agent' && context.action === 'content:publish') {
          return { decision: 'REQUIRE_APPROVAL', reason: 'Agents cannot publish autonomously.' };
        }
        return { decision: 'ALLOW' };
      },
    };

    docService = new DocumentService(docRepo, revRepo, auditRepo, policyEngine, clock, idGen);
    workflowService = new WorkflowService(docRepo, revRepo, auditRepo, policyEngine, clock, idGen);
  });

  it('creates an initial draft and revision', async () => {
    const { document, revision } = await docService.createDraft(humanEditor, {
      type: 'post',
      title: 'Architectural Content Systems',
      slug: 'architectural-content-systems',
      sourceMarkdown: '# Architectural Content Systems\n\nContent is data.',
      contentIr: { type: 'root', children: [] },
      contentHash: 'hash123',
      compilerVersion: '1.0.0',
      wordCount: 7,
      readingTimeSeconds: 3,
    });

    expect(document.id).toBeDefined();
    expect(document.status).toBe('DRAFT');
    expect(revision.revisionNumber).toBe(1);
    expect(auditRepo.events).toHaveLength(1);
    expect(auditRepo.events[0].eventType).toBe('content.created');
  });

  it('progresses through workflow: DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED', async () => {
    const { document, revision } = await docService.createDraft(humanEditor, {
      type: 'post',
      title: 'Workflow Test',
      slug: 'workflow-test',
      sourceMarkdown: '# Workflow Test',
      contentIr: { type: 'root', children: [] },
      contentHash: 'hash456',
      compilerVersion: '1.0.0',
      wordCount: 3,
      readingTimeSeconds: 2,
    });

    // 1. Submit for review
    const inReview = await workflowService.submitForReview(humanEditor, document.id, revision.id);
    expect(inReview.status).toBe('IN_REVIEW');

    // 2. Approve
    const approved = await workflowService.approve(humanEditor, document.id, revision.id);
    expect(approved.status).toBe('APPROVED');

    // 3. Publish
    const { document: published, publishedRevision } = await workflowService.publish(
      humanEditor,
      document.id,
      revision.id
    );
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedRevisionId).toBe(revision.id);
    expect(publishedRevision.id).toBe(revision.id);
  });

  it('rejects invalid state transition (e.g. DRAFT -> PUBLISHED when inReview required)', async () => {
    const { document } = await docService.createDraft(humanEditor, {
      type: 'post',
      title: 'Invalid Transition',
      slug: 'invalid-transition',
      sourceMarkdown: '# Invalid',
      contentIr: {},
      contentHash: 'hash789',
      compilerVersion: '1.0.0',
      wordCount: 2,
      readingTimeSeconds: 1,
    });

    // Attempting to approve while in DRAFT must throw InvalidStateTransitionError
    await expect(workflowService.approve(humanEditor, document.id)).rejects.toThrow(
      InvalidStateTransitionError
    );
  });

  it('enforces agent bounded policy: agent publishing requires approval', async () => {
    const { document, revision } = await docService.createDraft(agentActor, {
      type: 'post',
      title: 'Agent Post',
      slug: 'agent-post',
      sourceMarkdown: '# Agent content',
      contentIr: {},
      contentHash: 'hash_agent',
      compilerVersion: '1.0.0',
      wordCount: 3,
      readingTimeSeconds: 1,
    });

    await workflowService.submitForReview(humanEditor, document.id, revision.id);
    await workflowService.approve(humanEditor, document.id, revision.id);

    // Agent attempts to publish directly
    await expect(workflowService.publish(agentActor, document.id, revision.id)).rejects.toThrow(
      PolicyDeniedError
    );
  });

  it('preserves immutable revisions when restoring historical revision', async () => {
    // Create initial draft
    const { document, revision: rev1 } = await docService.createDraft(humanEditor, {
      type: 'post',
      title: 'History Test',
      slug: 'history-test',
      sourceMarkdown: 'Version 1 content',
      contentIr: {},
      contentHash: 'hash_v1',
      compilerVersion: '1.0.0',
      wordCount: 3,
      readingTimeSeconds: 1,
    });

    // Update with version 2
    const { revision: rev2 } = await docService.updateDraft(humanEditor, document.id, {
      sourceMarkdown: 'Version 2 content edited',
      contentHash: 'hash_v2',
      wordCount: 4,
      readingTimeSeconds: 2,
      changeSummary: 'Second version edits',
    });

    expect(rev2).toBeDefined();
    expect(rev2!.revisionNumber).toBe(2);

    // Restore rev1
    const { restoredRevision } = await workflowService.restoreRevision(
      humanEditor,
      document.id,
      rev1.id
    );

    // Revision 1 itself was NOT mutated!
    const originalRev1 = await revRepo.findById(rev1.id);
    expect(originalRev1?.revisionNumber).toBe(1);
    expect(originalRev1?.sourceMarkdown).toBe('Version 1 content');

    // Restored revision is a NEW immutable revision with number 3
    expect(restoredRevision.revisionNumber).toBe(3);
    expect(restoredRevision.sourceMarkdown).toBe('Version 1 content');
    expect(restoredRevision.changeSummary).toContain('Restored from revision #1');
  });
});
