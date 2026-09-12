import { describe, it, expect, beforeEach } from 'vitest';
import { handleApiRequest, type ApiContext } from '../router.js';
import { InMemoryIdempotencyStore } from '../idempotency.js';
import {
  DocumentService,
  WorkflowService,
  AgentService,
  AuditService,
  TaxonomyService,
  type Actor,
  type Clock,
  type IdGenerator,
} from '@brew-cms/core';
import { PolicyEngine } from '@brew-cms/policy';
import {
  createDatabaseConnection,
  seedInitialData,
  SQLiteDocumentRepository,
  SQLiteRevisionRepository,
  SQLiteTaxonomyRepository,
  SQLiteAuditEventRepository,
  SQLiteAgentRepository,
  SQLiteMediaAssetRepository,
} from '@brew-cms/db';
import {
  DefaultSourceRegistry,
  DeterministicMockEmbeddingProvider,
  MemorySemanticIndexAdapter,
  MockContentSourceAdapter,
  IndexingService,
  HybridRetrievalService,
  CanonicalSourceResolver,
} from '@brew-cms/intelligence';

describe('REST API /api/v1 and Router', () => {
  let ctx: ApiContext;
  const adminActor: Actor = {
    id: 'usr_admin_default',
    type: 'human',
    role: 'Admin',
  };

  beforeEach(() => {
    const db = createDatabaseConnection({ filePath: ':memory:' });
    seedInitialData(db);

    const docRepo = new SQLiteDocumentRepository(db);
    const revRepo = new SQLiteRevisionRepository(db);
    const taxRepo = new SQLiteTaxonomyRepository(db);
    const auditRepo = new SQLiteAuditEventRepository(db);
    const agentRepo = new SQLiteAgentRepository(db);

    const policy = new PolicyEngine();
    const clock: Clock = { now: () => new Date('2026-09-12T12:00:00Z') };
    let idCounter = 1;
    const idGen: IdGenerator = { generate: (p = 'id') => `${p}_${idCounter++}` };

    const documentService = new DocumentService(docRepo, revRepo, auditRepo, policy, clock, idGen);
    const workflowService = new WorkflowService(docRepo, revRepo, auditRepo, policy, clock, idGen);
    const agentService = new AgentService(agentRepo, auditRepo, policy, clock, idGen);
    const auditService = new AuditService(auditRepo);
    const taxonomyService = new TaxonomyService(taxRepo);

    const mediaRepo = new SQLiteMediaAssetRepository(db);

    ctx = {
      documentService,
      workflowService,
      agentService,
      auditService,
      taxonomyService,
      revisionRepo: revRepo,
      mediaRepo,
      agentRepo,
      idempotencyStore: new InMemoryIdempotencyStore(),
    };
  });

  it('serves health endpoints', async () => {
    const live = await handleApiRequest(
      { method: 'GET', path: '/api/health/live', actor: adminActor },
      ctx
    );
    expect(live.status).toBe(200);
    expect((live.body as any).status).toBe('live');

    const ready = await handleApiRequest(
      { method: 'GET', path: '/api/health/ready', actor: adminActor },
      ctx
    );
    expect(ready.status).toBe(200);
    expect((ready.body as any).status).toBe('ready');
  });

  it('creates and publishes a document via REST endpoints', async () => {
    // 1. Create document
    const createRes = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        actor: adminActor,
        body: {
          type: 'post',
          slug: 'rest-intro',
          title: 'REST Architecture in BrewCMS',
          sourceMarkdown: '# REST Architecture\n\nContent operating system REST APIs.',
        },
      },
      ctx
    );

    expect(createRes.status).toBe(201);
    const doc = (createRes.body as any).document;
    expect(doc.id).toBeDefined();
    expect(doc.status).toBe('DRAFT');

    // 2. Publish document
    const publishRes = await handleApiRequest(
      {
        method: 'POST',
        path: `/api/v1/documents/${doc.id}/publish`,
        actor: adminActor,
        body: {},
      },
      ctx
    );

    expect(publishRes.status).toBe(200);
    expect((publishRes.body as any).document.status).toBe('PUBLISHED');
  });

  it('enforces idempotency using Idempotency-Key header', async () => {
    const key = 'idem_unique_key_123';

    // First mutation
    const req1 = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        headers: { 'idempotency-key': key },
        actor: adminActor,
        body: {
          type: 'post',
          slug: 'idempotent-doc',
          title: 'Idempotency Post',
          sourceMarkdown: '# Test',
        },
      },
      ctx
    );

    expect(req1.status).toBe(201);
    const initialId = (req1.body as any).document.id;

    // Second identical request with same key
    const req2 = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        headers: { 'idempotency-key': key },
        actor: adminActor,
        body: {
          type: 'post',
          slug: 'idempotent-doc',
          title: 'Idempotency Post',
          sourceMarkdown: '# Test',
        },
      },
      ctx
    );

    expect(req2.status).toBe(201);
    expect(req2.headers?.['X-Cache-Lookup']).toBe('HIT');
    expect((req2.body as any).document.id).toBe(initialId);
  });

  it('returns standard machine-readable error envelope on validation failure', async () => {
    const res = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        actor: adminActor,
        headers: { 'x-request-id': 'req_xyz' },
        body: {
          type: 'invalid_type',
        },
      },
      ctx
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = res.body as any;
    expect(body.error).toBeDefined();
    expect(body.error.code).toBeDefined();
    expect(body.error.requestId).toBe('req_xyz');
  });

  it('handles full editorial lifecycle: submit -> approve -> publish -> unpublish -> restore', async () => {
    // 1. Create draft
    const createRes = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        actor: adminActor,
        body: {
          type: 'post',
          slug: 'lifecycle-test',
          title: 'Lifecycle Post',
          sourceMarkdown: '# Lifecycle Test\n\nInitial version.',
        },
      },
      ctx
    );
    expect(createRes.status).toBe(201);
    const docId = (createRes.body as any).document.id;
    const initialRevId = (createRes.body as any).revision.id;

    // 2. Submit for review
    const submitRes = await handleApiRequest(
      {
        method: 'POST',
        path: `/api/v1/documents/${docId}/submit`,
        actor: adminActor,
        body: {},
      },
      ctx
    );
    expect(submitRes.status).toBe(200);
    expect((submitRes.body as any).status).toBe('IN_REVIEW');

    // 3. Approve
    const approveRes = await handleApiRequest(
      {
        method: 'POST',
        path: `/api/v1/documents/${docId}/approve`,
        actor: adminActor,
        body: {},
      },
      ctx
    );
    expect(approveRes.status).toBe(200);
    expect((approveRes.body as any).status).toBe('APPROVED');

    // 4. Publish
    const publishRes = await handleApiRequest(
      {
        method: 'POST',
        path: `/api/v1/documents/${docId}/publish`,
        actor: adminActor,
        body: {},
      },
      ctx
    );
    expect(publishRes.status).toBe(200);
    expect((publishRes.body as any).document.status).toBe('PUBLISHED');

    // 5. Unpublish
    const unpublishRes = await handleApiRequest(
      {
        method: 'POST',
        path: `/api/v1/documents/${docId}/unpublish`,
        actor: adminActor,
        body: {},
      },
      ctx
    );
    expect(unpublishRes.status).toBe(200);
    expect((unpublishRes.body as any).status).toBe('DRAFT');

    // 6. Restore initial revision
    const restoreRes = await handleApiRequest(
      {
        method: 'POST',
        path: `/api/v1/documents/${docId}/restore`,
        actor: adminActor,
        body: { revisionId: initialRevId },
      },
      ctx
    );
    expect(restoreRes.status).toBe(200);
    expect((restoreRes.body as any).restoredRevision).toBeDefined();
    expect((restoreRes.body as any).restoredRevision.sourceMarkdown).toBe('# Lifecycle Test\n\nInitial version.');
  });

  it('manages media and agent endpoints', async () => {
    // Media list and create
    const mediaCreate = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/media',
        actor: adminActor,
        body: {
          filename: 'banner.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
          altText: 'Banner Image',
        },
      },
      ctx
    );
    expect(mediaCreate.status).toBe(201);
    expect((mediaCreate.body as any).id).toBeDefined();

    const mediaList = await handleApiRequest(
      {
        method: 'GET',
        path: '/api/v1/media',
        actor: adminActor,
      },
      ctx
    );
    expect(mediaList.status).toBe(200);
    expect((mediaList.body as any).items.length).toBeGreaterThan(0);

    // Agent list
    const agentList = await handleApiRequest(
      {
        method: 'GET',
        path: '/api/v1/agents',
        actor: adminActor,
      },
      ctx
    );
    expect(agentList.status).toBe(200);
    expect(Array.isArray((agentList.body as any).items)).toBe(true);
  });

  it('exposes intelligence status, indexing, and hybrid retrieval endpoints', async () => {
    // Set up intelligence services
    const registry = new DefaultSourceRegistry();
    const mockSource = new MockContentSourceAdapter('brew-sqlite', [
      {
        sourceId: 'brew-sqlite',
        contentId: 'doc-ai-1',
        revisionId: 'rev-1',
        title: 'Distributed Enterprise Intelligence',
        canonicalUrl: '/posts/distributed-enterprise-intelligence',
        summary: 'How AI agents work with governed content workflows.',
        body: '# Distributed Enterprise Intelligence\n\nHow AI agents work with governed content workflows and retrieval.',
        publishedAt: '2026-09-12T00:00:00Z',
      },
    ]);
    registry.register(mockSource);

    const embeddingProvider = new DeterministicMockEmbeddingProvider();
    const semanticIndex = new MemorySemanticIndexAdapter();
    const indexingService = new IndexingService(registry, embeddingProvider, semanticIndex);
    const retrievalService = new HybridRetrievalService(embeddingProvider, semanticIndex);
    const canonicalResolver = new CanonicalSourceResolver(registry);

    const intelligenceCtx: ApiContext = {
      ...ctx,
      sourceRegistry: registry,
      indexingService,
      retrievalService,
      canonicalResolver,
    };

    // 1. Status endpoint
    const statusRes = await handleApiRequest(
      { method: 'GET', path: '/api/v1/intelligence/status', actor: adminActor },
      intelligenceCtx
    );
    expect(statusRes.status).toBe(200);
    expect((statusRes.body as any).status).toBe('operational');
    expect((statusRes.body as any).sources.length).toBe(1);
    expect((statusRes.body as any).sources[0].id).toBe('brew-sqlite');

    // 2. Trigger Indexing
    const indexRes = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/intelligence/index',
        actor: adminActor,
        body: { sourceId: 'brew-sqlite' },
      },
      intelligenceCtx
    );
    expect(indexRes.status).toBe(200);
    expect((indexRes.body as any).summary.indexed).toBe(1);

    // 3. Search endpoint (references only)
    const searchRes = await handleApiRequest(
      {
        method: 'GET',
        path: '/api/v1/intelligence/search',
        actor: adminActor,
        query: { q: 'enterprise intelligence' },
      },
      intelligenceCtx
    );
    expect(searchRes.status).toBe(200);
    expect((searchRes.body as any).total).toBeGreaterThan(0);
    const item = (searchRes.body as any).items[0];
    expect(item.contentId).toBe('doc-ai-1');
    expect(item.sourceId).toBe('brew-sqlite');
    // Content body must NOT be in search reference result
    expect(item.markdown).toBeUndefined();

    // 4. Search with resolve=true (canonical resolution)
    const resolvedSearchRes = await handleApiRequest(
      {
        method: 'GET',
        path: '/api/v1/intelligence/search',
        actor: adminActor,
        query: { q: 'enterprise intelligence', resolve: 'true' },
      },
      intelligenceCtx
    );
    expect(resolvedSearchRes.status).toBe(200);
    const resolvedItem = (resolvedSearchRes.body as any).items[0];
    expect(resolvedItem.reference.contentId).toBe('doc-ai-1');
    expect(resolvedItem.canonical.title).toBe('Distributed Enterprise Intelligence');
    expect(resolvedItem.canonical.body).toContain('governed content workflows');
  });
});
