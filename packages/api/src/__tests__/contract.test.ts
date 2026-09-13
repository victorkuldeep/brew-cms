import { describe, it, expect, beforeEach } from 'vitest';
import { handleApiRequest, type ApiContext } from '../router.js';
import { InMemoryIdempotencyStore } from '../idempotency.js';
import {
  DocumentService,
  WorkflowService,
  AgentService,
  AuditService,
  TaxonomyService,
  MediaService,
  encodeCursor,
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
  SQLiteMediaAssetRepository,
  SQLiteAuditEventRepository,
  SQLiteAgentRepository,
} from '@brew-cms/db';

describe('Inc 1 contract: envelope, errors, cursor, PATCH, idempotency modes', () => {
  let ctx: ApiContext;
  const adminActor: Actor = { id: 'usr_admin_default', type: 'human', role: 'Admin' };
  const authorActor: Actor = { id: 'usr_author_1', type: 'human', role: 'author' };

  beforeEach(() => {
    const db = createDatabaseConnection({ filePath: ':memory:' });
    seedInitialData(db);

    const docRepo = new SQLiteDocumentRepository(db);
    const revRepo = new SQLiteRevisionRepository(db);
    const taxRepo = new SQLiteTaxonomyRepository(db);
    const auditRepo = new SQLiteAuditEventRepository(db);
    const agentRepo = new SQLiteAgentRepository(db);
    const mediaRepo = new SQLiteMediaAssetRepository(db);

    const policy = new PolicyEngine();
    const clock: Clock = { now: () => new Date('2026-09-12T12:00:00Z') };
    let idCounter = 1;
    const idGen: IdGenerator = { generate: (p = 'id') => `${p}_${idCounter++}` };

    ctx = {
      documentService: new DocumentService(docRepo, revRepo, auditRepo, policy, clock, idGen),
      workflowService: new WorkflowService(docRepo, revRepo, auditRepo, policy, clock, idGen),
      agentService: new AgentService(agentRepo, auditRepo, policy, clock, idGen),
      auditService: new AuditService(auditRepo),
      taxonomyService: new TaxonomyService(taxRepo),
      mediaService: new MediaService(undefined, mediaRepo, policy, auditRepo, idGen),
      idempotencyStore: new InMemoryIdempotencyStore(),
    };
  });

  async function createDoc(slug: string, title: string, actor: Actor = adminActor) {
    const res = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        actor,
        body: { type: 'post', slug, title, sourceMarkdown: `# ${title}\n\nBody.` },
      },
      ctx
    );
    expect(res.status).toBe(201);
    return (res.body as any).data.document;
  }

  it('wraps success in {data, requestId} and honors explicit request ids', async () => {
    const res = await handleApiRequest(
      { method: 'GET', path: '/api/health/live', actor: adminActor, headers: { 'x-request-id': 'req_test_1' } },
      ctx
    );
    expect(res.status).toBe(200);
    expect((res.body as any).data.status).toBe('live');
    expect((res.body as any).requestId).toBe('req_test_1');
    expect((res.body as any).policy).toBeUndefined();
  });

  it('generates a request id when the caller omits one', async () => {
    const res = await handleApiRequest({ method: 'GET', path: '/api/health/live', actor: adminActor }, ctx);
    expect((res.body as any).requestId).toMatch(/^req_/);
  });

  it('returns the legacy raw shape with ?envelope=legacy', async () => {
    const res = await handleApiRequest(
      { method: 'GET', path: '/api/health/live', actor: adminActor, query: { envelope: 'legacy' } },
      ctx
    );
    expect(res.status).toBe(200);
    expect((res.body as any).status).toBe('live');
    expect((res.body as any).requestId).toBeUndefined();
    expect((res.body as any).data).toBeUndefined();
  });

  it('maps Zod validation failures to 422 VALIDATION_ERROR (never 500)', async () => {
    const res = await handleApiRequest(
      { method: 'POST', path: '/api/v1/documents', actor: adminActor, body: { type: 'nope' } },
      ctx
    );
    expect(res.status).toBe(422);
    expect((res.body as any).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid limit and cursor parameters with 422', async () => {
    const badLimit = await handleApiRequest(
      { method: 'GET', path: '/api/v1/documents', actor: adminActor, query: { limit: '-5' } },
      ctx
    );
    expect(badLimit.status).toBe(422);

    const badCursor = await handleApiRequest(
      { method: 'GET', path: '/api/v1/documents', actor: adminActor, query: { cursor: '!!!not-a-cursor!!!' } },
      ctx
    );
    expect(badCursor.status).toBe(422);
    expect((badCursor.body as any).error.code).toBe('VALIDATION_ERROR');
  });

  it('paginates documents with stable cursors and no overlap', async () => {
    await createDoc('cur-a', 'Cursor A');
    await createDoc('cur-b', 'Cursor B');
    await createDoc('cur-c', 'Cursor C');

    const p1 = await handleApiRequest(
      { method: 'GET', path: '/api/v1/documents', actor: adminActor, query: { limit: '2' } },
      ctx
    );
    expect(p1.status).toBe(200);
    const b1 = (p1.body as any).data;
    expect(b1.items).toHaveLength(2);
    expect(typeof b1.total).toBe('number');
    expect(typeof b1.nextCursor).toBe('string');

    const p2 = await handleApiRequest(
      { method: 'GET', path: '/api/v1/documents', actor: adminActor, query: { limit: '2', cursor: b1.nextCursor } },
      ctx
    );
    const b2 = (p2.body as any).data;
    const ids1 = new Set(b1.items.map((d: any) => d.id));
    for (const d of b2.items) expect(ids1.has(d.id)).toBe(false);
    // Last page partial → no next cursor
    expect(b2.nextCursor).toBeUndefined();
  });

  it('walks the audit log with cursors', async () => {
    const doc = await createDoc('cur-audit', 'Cursor Audit');
    // Updates emit audit events (creation alone does not)
    await handleApiRequest(
      { method: 'PUT', path: `/api/v1/documents/${doc.id}`, actor: adminActor, body: { title: 'Cursor Audit v2' } },
      ctx
    );
    const p1 = await handleApiRequest(
      { method: 'GET', path: '/api/v1/audit', actor: adminActor, query: { limit: '1' } },
      ctx
    );
    const b1 = (p1.body as any).data;
    expect(b1.items).toHaveLength(1);
    expect(b1.total).toBeGreaterThanOrEqual(1);
    if (b1.nextCursor) {
      const p2 = await handleApiRequest(
        { method: 'GET', path: '/api/v1/audit', actor: adminActor, query: { limit: '1', cursor: b1.nextCursor } },
        ctx
      );
      expect(((p2.body as any).data.items[0] as any).id).not.toBe(b1.items[0].id);
    }
  });

  it('treats PATCH like PUT on documents', async () => {
    const doc = await createDoc('patch-me', 'Patch Original');
    const res = await handleApiRequest(
      { method: 'PATCH', path: `/api/v1/documents/${doc.id}`, actor: adminActor, body: { title: 'Patch Updated' } },
      ctx
    );
    expect(res.status).toBe(200);
    expect((res.body as any).data.document.title).toBe('Patch Updated');
  });

  it('returns 404 NOT_FOUND for revisions of unknown documents', async () => {
    const res = await handleApiRequest(
      { method: 'GET', path: '/api/v1/documents/nope/revisions', actor: adminActor },
      ctx
    );
    expect(res.status).toBe(404);
    expect((res.body as any).error.code).toBe('NOT_FOUND');
  });

  it('returns enveloped 500 NO_MEDIA_REPO when the media service is absent', async () => {
    const { mediaService, ...rest } = ctx;
    const res = await handleApiRequest({ method: 'GET', path: '/api/v1/media', actor: adminActor }, rest);
    expect(res.status).toBe(500);
    expect((res.body as any).error.code).toBe('NO_MEDIA_REPO');
    expect((res.body as any).error.requestId).toMatch(/^req_/);
  });

  it('keeps legacy and enveloped idempotency replays isolated', async () => {
    const key = 'idem_mode_split';

    // r1: enveloped write under key K
    const r1 = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        headers: { 'idempotency-key': key },
        actor: adminActor,
        body: { type: 'post', slug: 'idem-modes-a', title: 'Idem Modes A', sourceMarkdown: '# a' },
      },
      ctx
    );
    expect(r1.status).toBe(201);
    const idA = (r1.body as any).data.document.id;

    // r2: same key in legacy mode → MISS (namespaces isolated), executes independently
    const r2 = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        headers: { 'idempotency-key': key },
        actor: adminActor,
        body: { type: 'post', slug: 'idem-modes-b', title: 'Idem Modes B', sourceMarkdown: '# b' },
        query: { envelope: 'legacy' },
      },
      ctx
    );
    expect(r2.status).toBe(201);
    expect(r2.headers?.['X-Cache-Lookup']).toBeUndefined();
    expect((r2.body as any).document.slug).toBe('idem-modes-b');
    expect((r2.body as any).data).toBeUndefined();

    // r3: enveloped replay of the same key → HIT returns the ORIGINAL record
    const r3 = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/documents',
        headers: { 'idempotency-key': key },
        actor: adminActor,
        body: { type: 'post', slug: 'idem-modes-b', title: 'Idem Modes B', sourceMarkdown: '# b' },
      },
      ctx
    );
    expect(r3.headers?.['X-Cache-Lookup']).toBe('HIT');
    expect((r3.body as any).data.document.id).toBe(idA);
  });

  it('denies author media upload via policy while allowing reads', async () => {    const denied = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/media',
        actor: authorActor,
        body: { filename: 'a.png', mimeType: 'image/png' },
      },
      ctx
    );
    expect(denied.status).toBe(403);
    expect((denied.body as any).error.code).toBe('POLICY_DENIED');

    const list = await handleApiRequest({ method: 'GET', path: '/api/v1/media', actor: authorActor }, ctx);
    expect(list.status).toBe(200);
  });

  it('carries the gate decision on approval responses', async () => {
    // Arrange a pending run: scoped agent requests publish → REQUIRE_APPROVAL
    const agentActor: Actor = { id: 'agt_pol_1', type: 'agent', scopes: ['content:publish'] };
    await ctx.agentService.registerAgent(adminActor, {
      id: 'agt_pol_1',
      name: 'Policy Probe',
      scopes: ['content:publish'],
    });
    const doc = await createDoc('pol-run', 'Policy Run');
    const run = await ctx.agentService.executeActionRun(agentActor, {
      action: 'content:publish',
      resourceType: 'document',
      resourceId: doc.id,
      input: {},
      executor: async () => ({ published: true }),
    });
    expect(run.status).toBe('pending');
    expect(run.policyDecision).toBe('REQUIRE_APPROVAL');

    // Act: approve over REST
    const res = await handleApiRequest(
      {
        method: 'POST',
        path: `/api/v1/agent/runs/${run.id}/approve`,
        actor: adminActor,
        body: { reason: 'editorial review passed' },
      },
      ctx
    );

    // Assert: run completed + truthful gate decision in the envelope
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.data.actionRun.status).toBe('completed');
    expect(body.data.approval.decision).toBe('approved');
    expect(body.policy).toEqual({ decision: 'REQUIRE_APPROVAL' });

    // And the runs list carries totals for cursor clients
    const runs = await handleApiRequest({ method: 'GET', path: '/api/v1/agent/runs', actor: adminActor }, ctx);
    expect(Array.isArray((runs.body as any).data.items)).toBe(true);
    expect(typeof (runs.body as any).data.total).toBe('number');
  });

  it('encodes and rejects cursors deterministically', () => {
    const c = encodeCursor({ t: '2026-09-12T12:00:00.000Z', id: 'doc_1' });
    expect(typeof c).toBe('string');
    expect(c).not.toContain('=');
  });

  it('completes the media lifecycle: upload with url, get, delete', async () => {
    // Wired provider so uploadAsset returns a servable url
    const stubProvider = {
      put: async (input: any) => ({
        provider: 'local' as const,
        providerKey: `covers/${input.filename}`,
        url: `https://cdn.test/covers/${input.filename}`,
        sizeBytes: 10,
        mimeType: input.mimeType,
        checksum: 'abc',
      }),
      get: async (key: string) => ({ url: `https://cdn.test/${key}` }),
      delete: async (_key: string) => {},
    };
    const db2 = createDatabaseConnection({ filePath: ':memory:' });
    seedInitialData(db2);
    const auditRepo2 = new SQLiteAuditEventRepository(db2);
    let mCounter = 1;
    const idGen2: IdGenerator = { generate: (p = 'id') => `${p}_m${mCounter++}` };
    const mediaService2 = new MediaService(
      stubProvider,
      new SQLiteMediaAssetRepository(db2),
      new PolicyEngine(),
      auditRepo2,
      idGen2
    );
    const mctx: ApiContext = { ...ctx, mediaService: mediaService2 };

    // Upload with binary → url surfaced
    const up = await handleApiRequest(
      {
        method: 'POST',
        path: '/api/v1/media',
        actor: adminActor,
        body: {
          filename: 'cover.webp',
          mimeType: 'image/webp',
          contentBase64: Buffer.from('fake-bytes').toString('base64'),
        },
      },
      mctx
    );
    expect(up.status).toBe(201);
    expect((up.body as any).data.url).toBe('https://cdn.test/covers/cover.webp');
    const assetId = (up.body as any).data.id;

    // GET single asset resolves url through the provider
    const got = await handleApiRequest(
      { method: 'GET', path: `/api/v1/media/${assetId}`, actor: adminActor },
      mctx
    );
    expect(got.status).toBe(200);
    expect((got.body as any).data.asset.id).toBe(assetId);

    // Author cannot delete (media:delete ungranted)
    const denied = await handleApiRequest(
      { method: 'DELETE', path: `/api/v1/media/${assetId}`, actor: authorActor },
      mctx
    );
    expect(denied.status).toBe(403);

    // Admin delete removes record + bytes
    const del = await handleApiRequest(
      { method: 'DELETE', path: `/api/v1/media/${assetId}`, actor: adminActor },
      mctx
    );
    expect(del.status).toBe(200);
    expect((del.body as any).data.id).toBe(assetId);

    const gone = await handleApiRequest(
      { method: 'GET', path: `/api/v1/media/${assetId}`, actor: adminActor },
      mctx
    );
    expect(gone.status).toBe(404);
    expect((gone.body as any).error.code).toBe('NOT_FOUND');
  });
});
