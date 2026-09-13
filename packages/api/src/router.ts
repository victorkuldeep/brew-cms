import { randomUUID } from 'node:crypto';
import type {
  Actor,
  DocumentService,
  WorkflowService,
  AgentService,
  AuditService,
  TaxonomyService,
  MediaService,
  IdempotencyStore,
  PolicyDecision,
} from '@brew-cms/core';
import type {
  SourceRegistry,
  IndexingService,
  HybridRetrievalService,
  CanonicalSourceResolver,
} from '@brew-cms/intelligence';
import { compileContent } from '@brew-cms/content';
import {
  formatErrorResponse,
  NoMediaRepositoryError,
  IntelligenceUnavailableError,
  InvalidQueryError,
  RouteNotFoundError,
} from './errors.js';
import { ValidationError } from '@brew-cms/core';
import {
  CreateDocumentRequestSchema,
  UpdateDocumentRequestSchema,
  PublishDocumentRequestSchema,
  ScheduleDocumentRequestSchema,
  CreateTopicRequestSchema,
  CreateTagRequestSchema,
  CreateSeriesRequestSchema,
} from './validators.js';

export interface ApiRequest {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: unknown;
  actor: Actor;
}

export interface ApiResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

/**
 * Success envelope (Charter Phase 1). Default shape for every 2xx response:
 * `{ data, requestId, policy? }`. Pass `?envelope=legacy` to receive the
 * historic raw body (supported for one release cycle, then removed).
 * `policy` is populated only where the router truthfully knows the gate
 * outcome (agent approval flows); it is omitted elsewhere rather than
 * fabricated. Full policy surfacing arrives with service-returned decisions.
 */
export interface ApiSuccessEnvelope {
  data: unknown;
  requestId: string;
  policy?: {
    decision: PolicyDecision;
    reason?: string;
  };
}

export interface ApiContext {
  documentService: DocumentService;
  workflowService: WorkflowService;
  agentService: AgentService;
  auditService: AuditService;
  taxonomyService: TaxonomyService;
  mediaService?: MediaService;
  idempotencyStore?: IdempotencyStore;
  sourceRegistry?: SourceRegistry;
  indexingService?: IndexingService;
  retrievalService?: HybridRetrievalService;
  canonicalResolver?: CanonicalSourceResolver;
}

/** Route result: a response plus an optional truthful policy outcome. */
type RouteResult = ApiResponse & {
  policy?: { decision: PolicyDecision; reason?: string };
};

export async function handleApiRequest(
  req: ApiRequest,
  ctx: ApiContext
): Promise<ApiResponse> {
  const requestId = req.headers?.['x-request-id'] || `req_${randomUUID()}`;
  const legacy = req.query?.envelope === 'legacy';
  const idempotencyKey = req.headers?.['idempotency-key'];
  const idempotencyStore = ctx.idempotencyStore;
  // Scope replay keys by envelope mode so legacy and enveloped callers
  // never receive each other's cached shapes.
  const cacheKey = idempotencyKey ? `${legacy ? 'legacy' : 'enveloped'}:${idempotencyKey}` : undefined;

  // 1. Idempotency Check for mutations (raw bodies are cached; the envelope
  //    is applied on the way out so both modes replay correctly).
  if (cacheKey && req.method !== 'GET' && idempotencyStore) {
    const cached = idempotencyStore.get(cacheKey, req.actor.id);
    if (cached) {
      return {
        status: cached.responseStatus,
        headers: { 'X-Cache-Lookup': 'HIT', 'Idempotency-Key': idempotencyKey! },
        body: legacy ? cached.responseBody : toEnvelope(cached.responseBody, requestId),
      };
    }
  }

  try {
    const result: RouteResult = await dispatchRoute(req, ctx);
    const { policy, ...response } = result;

    // Save in idempotency store if mutation (raw dispatch body)
    if (cacheKey && req.method !== 'GET' && idempotencyStore && response.status < 400) {
      idempotencyStore.set(cacheKey, req.actor.id, response.status, response.body);
    }

    if (legacy) return response;
    if (response.status >= 400) return response; // errors are already enveloped
    return {
      ...response,
      body: toEnvelope(response.body, requestId, policy),
    };
  } catch (err: any) {
    const errorFormatted = formatErrorResponse(err, requestId);
    return {
      status: errorFormatted.status,
      headers: { 'Content-Type': 'application/json' },
      body: errorFormatted.body,
    };
  }
}

function toEnvelope(
  data: unknown,
  requestId: string,
  policy?: { decision: PolicyDecision; reason?: string }
): ApiSuccessEnvelope {
  return policy ? { data, requestId, policy } : { data, requestId };
}

/**
 * Parses a `limit` query parameter. Rejects non-integers and values < 1
 * (a negative LIMIT means "unlimited" in SQLite — never honor that from
 * a remote caller). Absent → undefined (repository default applies).
 */
function parseLimit(raw: string | undefined, def?: number): number | undefined {
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError(`Invalid 'limit' parameter: '${raw}'. Must be a positive integer.`);
  }
  return n;
}

async function dispatchRoute(req: ApiRequest, ctx: ApiContext): Promise<RouteResult> {
  const { path: rawPath, method, actor } = req;
  const urlPath = rawPath.replace(/\/$/, '');

  // 1. Health Endpoints
  if (urlPath === '/api/health/live' && method === 'GET') {
    return { status: 200, body: { status: 'live', timestamp: new Date().toISOString() } };
  }
  if (urlPath === '/api/health/ready' && method === 'GET') {
    return { status: 200, body: { status: 'ready', database: 'connected', timestamp: new Date().toISOString() } };
  }

  // 2. Documents
  if (urlPath === '/api/v1/documents') {
    if (method === 'GET') {
      const result = await ctx.documentService.listDocuments({
        type: req.query?.type as any,
        status: req.query?.status as any,
        query: req.query?.q,
        limit: parseLimit(req.query?.limit),
        cursor: req.query?.cursor,
      });
      return { status: 200, body: result };
    }

    if (method === 'POST') {
      const validated = CreateDocumentRequestSchema.parse(req.body);
      const compiled = compileContent(validated.sourceMarkdown, {
        frontmatterDefaults: validated.frontmatter,
      });

      const res = await ctx.documentService.createDraft(actor, {
        type: validated.type,
        slug: validated.slug,
        title: validated.title,
        excerpt: validated.excerpt,
        sourceMarkdown: compiled.sourceMarkdown,
        frontmatter: compiled.frontmatter,
        contentIr: compiled.contentIr,
        contentHash: compiled.contentHash,
        compilerVersion: compiled.compilerVersion,
        wordCount: compiled.wordCount,
        readingTimeSeconds: compiled.readingTimeSeconds,
        seo: validated.seo,
      });

      return { status: 201, body: res };
    }
  }

  // Document by ID: /api/v1/documents/:id
  const docIdMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)$/);
  if (docIdMatch) {
    const id = docIdMatch[1];
    if (method === 'GET') {
      const doc = await ctx.documentService.getDocument(id);
      return { status: 200, body: doc };
    }
    if (method === 'PUT' || method === 'PATCH') {
      const validated = UpdateDocumentRequestSchema.parse(req.body);
      let compiled: ReturnType<typeof compileContent> | undefined;
      if (validated.sourceMarkdown !== undefined) {
        compiled = compileContent(validated.sourceMarkdown, {
          frontmatterDefaults: validated.frontmatter,
        });
      }

      const res = await ctx.documentService.updateDraft(actor, id, {
        title: validated.title,
        slug: validated.slug,
        excerpt: validated.excerpt,
        sourceMarkdown: compiled?.sourceMarkdown,
        frontmatter: compiled?.frontmatter,
        contentIr: compiled?.contentIr,
        contentHash: compiled?.contentHash,
        compilerVersion: compiled?.compilerVersion,
        wordCount: compiled?.wordCount,
        readingTimeSeconds: compiled?.readingTimeSeconds,
        seo: validated.seo,
        changeSummary: validated.changeSummary,
      });

      return { status: 200, body: res };
    }
    if (method === 'DELETE') {
      await ctx.documentService.deleteDocument(actor, id);
      return { status: 200, body: { success: true, id } };
    }
  }

  // Revisions for document: /api/v1/documents/:id/revisions
  const revMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/revisions$/);
  if (revMatch && method === 'GET') {
    const id = revMatch[1];
    const revisions = await ctx.documentService.getRevisions(id);
    return { status: 200, body: { revisions } };
  }

  // Publish: /api/v1/documents/:id/publish
  const publishMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/publish$/);
  if (publishMatch && method === 'POST') {
    const id = publishMatch[1];
    const validated = PublishDocumentRequestSchema.parse(req.body || {});
    const res = await ctx.workflowService.publish(actor, id, validated.revisionId);
    return { status: 200, body: res };
  }

  // Submit for review: /api/v1/documents/:id/submit
  const submitMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/submit$/);
  if (submitMatch && method === 'POST') {
    const id = submitMatch[1];
    const revisionId = (req.body as any)?.revisionId;
    const res = await ctx.workflowService.submitForReview(actor, id, revisionId);
    return { status: 200, body: res };
  }

  // Approve: /api/v1/documents/:id/approve
  const approveMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/approve$/);
  if (approveMatch && method === 'POST') {
    const id = approveMatch[1];
    const revisionId = (req.body as any)?.revisionId;
    const res = await ctx.workflowService.approve(actor, id, revisionId);
    return { status: 200, body: res };
  }

  // Request Changes: /api/v1/documents/:id/request-changes
  const reqChangesMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/request-changes$/);
  if (reqChangesMatch && method === 'POST') {
    const id = reqChangesMatch[1];
    const reason = (req.body as any)?.reason;
    const res = await ctx.workflowService.requestChanges(actor, id, reason);
    return { status: 200, body: res };
  }

  // Unpublish: /api/v1/documents/:id/unpublish
  const unpublishMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/unpublish$/);
  if (unpublishMatch && method === 'POST') {
    const id = unpublishMatch[1];
    const res = await ctx.workflowService.unpublish(actor, id);
    return { status: 200, body: res };
  }

  // Archive: /api/v1/documents/:id/archive
  const archiveMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/archive$/);
  if (archiveMatch && method === 'POST') {
    const id = archiveMatch[1];
    const res = await ctx.workflowService.archive(actor, id);
    return { status: 200, body: res };
  }

  // Restore Revision: /api/v1/documents/:id/restore
  const restoreMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/restore$/);
  if (restoreMatch && method === 'POST') {
    const id = restoreMatch[1];
    const targetRevId = (req.body as any)?.revisionId;
    const changeSummary = (req.body as any)?.changeSummary;
    const res = await ctx.workflowService.restoreRevision(actor, id, targetRevId, changeSummary);
    return { status: 200, body: res };
  }

  // Schedule: /api/v1/documents/:id/schedule
  const scheduleMatch = urlPath.match(/^\/api\/v1\/documents\/([^/]+)\/schedule$/);
  if (scheduleMatch && method === 'POST') {
    const id = scheduleMatch[1];
    const validated = ScheduleDocumentRequestSchema.parse(req.body);
    const res = await ctx.workflowService.schedule(
      actor,
      id,
      new Date(validated.scheduledAt),
      validated.revisionId
    );
    return { status: 200, body: res };
  }

  // Taxonomies: Topics
  if (urlPath === '/api/v1/topics') {
    if (method === 'GET') {
      const items = await ctx.taxonomyService.listTopics();
      return { status: 200, body: { items } };
    }
    if (method === 'POST') {
      const validated = CreateTopicRequestSchema.parse(req.body);
      const res = await ctx.taxonomyService.createTopic({
        id: `top_${validated.slug}`,
        ...validated,
      });
      return { status: 201, body: res };
    }
  }

  // Taxonomies: Tags
  if (urlPath === '/api/v1/tags') {
    if (method === 'GET') {
      const items = await ctx.taxonomyService.listTags();
      return { status: 200, body: { items } };
    }
    if (method === 'POST') {
      const validated = CreateTagRequestSchema.parse(req.body);
      const res = await ctx.taxonomyService.createTag({
        id: `tag_${validated.slug}`,
        ...validated,
      });
      return { status: 201, body: res };
    }
  }

  // Taxonomies: Series
  if (urlPath === '/api/v1/series') {
    if (method === 'GET') {
      const items = await ctx.taxonomyService.listSeries();
      return { status: 200, body: { items } };
    }
    if (method === 'POST') {
      const validated = CreateSeriesRequestSchema.parse(req.body);
      const res = await ctx.taxonomyService.createSeries({
        id: `ser_${validated.slug}`,
        ...validated,
      });
      return { status: 201, body: res };
    }
  }

  // Media: /api/v1/media (converged on MediaService — no direct provider/repo use)
  if (urlPath === '/api/v1/media') {
    if (!ctx.mediaService) {
      throw new NoMediaRepositoryError();
    }
    if (method === 'GET') {
      const items = await ctx.mediaService.listAssets({
        mimeType: req.query?.mimeType,
        limit: parseLimit(req.query?.limit, 50),
      });
      return { status: 200, body: { items } };
    }
    if (method === 'POST') {
      const body = (req.body ?? {}) as Record<string, any>;
      const asset = await ctx.mediaService.uploadAsset(actor, {
        id: body.id,
        filename: body.filename,
        mimeType: body.mimeType,
        contentBase64: body.contentBase64,
        prefix: body.prefix,
        providerKey: body.providerKey,
        sizeBytes: body.sizeBytes,
        width: body.width ?? null,
        height: body.height ?? null,
        altText: body.altText ?? null,
        caption: body.caption ?? null,
        metadata: body.metadata ?? null,
      });
      return { status: 201, body: asset };
    }
  }

  // Single media asset: /api/v1/media/:id
  const mediaMatch = urlPath.match(/^\/api\/v1\/media\/([^/]+)$/);
  if (mediaMatch) {
    if (!ctx.mediaService) {
      throw new NoMediaRepositoryError();
    }
    const mediaId = mediaMatch[1];
    if (method === 'GET') {
      const asset = await ctx.mediaService.getAsset(mediaId);
      return { status: 200, body: { asset } };
    }
    if (method === 'DELETE') {
      const res = await ctx.mediaService.deleteAsset(actor, mediaId);
      return { status: 200, body: res };
    }
  }

  // Audit Events
  if (urlPath === '/api/v1/audit' && method === 'GET') {
    const result = await ctx.auditService.listEvents({
      resourceType: req.query?.resourceType,
      resourceId: req.query?.resourceId,
      actorId: req.query?.actorId,
      limit: parseLimit(req.query?.limit),
      cursor: req.query?.cursor,
    });
    return { status: 200, body: result };
  }

  // Agents: /api/v1/agents
  if (urlPath === '/api/v1/agents') {
    if (method === 'GET') {
      const agents = await ctx.agentService.listAgents();
      return { status: 200, body: { items: agents } };
    }
    if (method === 'POST') {
      const body = req.body as any;
      const agent = await ctx.agentService.registerAgent(actor, {
        id: body.id,
        name: body.name,
        description: body.description,
        scopes: body.scopes || [],
      });
      return { status: 201, body: agent };
    }
  }

  // Agent Action Runs: /api/v1/agent/runs (converged on AgentService)
  if (urlPath === '/api/v1/agent/runs') {
    if (method === 'GET') {
      const result = await ctx.agentService.listActionRuns({
        limit: parseLimit(req.query?.limit),
        cursor: req.query?.cursor,
      });
      return { status: 200, body: result };
    }
  }

  // Agent Action Run Approval: /api/v1/agent/runs/:id/approve
  const approveRunMatch = urlPath.match(/^\/api\/v1\/agent\/runs\/([^/]+)\/approve$/);
  if (approveRunMatch && method === 'POST') {
    const runId = approveRunMatch[1];
    const res = await ctx.agentService.approveActionRun(actor, runId, (req.body as any)?.reason);
    return {
      status: 200,
      body: res,
      // Truthful gate outcome: the decision that forced human approval.
      policy: { decision: res.actionRun.policyDecision },
    };
  }

  // Agent Action Run Rejection: /api/v1/agent/runs/:id/reject
  const rejectRunMatch = urlPath.match(/^\/api\/v1\/agent\/runs\/([^/]+)\/reject$/);
  if (rejectRunMatch && method === 'POST') {
    const runId = rejectRunMatch[1];
    const res = await ctx.agentService.rejectActionRun(actor, runId, (req.body as any)?.reason);
    return {
      status: 200,
      body: res,
      policy: { decision: res.actionRun.policyDecision },
    };
  }

  // Intelligence: Status / Sources
  if (urlPath === '/api/v1/intelligence/status' && method === 'GET') {
    const registry = ctx.sourceRegistry ?? ctx.indexingService?.registry;
    return {
      status: 200,
      body: {
        status: 'operational',
        hasIndexingService: Boolean(ctx.indexingService),
        hasRetrievalService: Boolean(ctx.retrievalService),
        hasCanonicalResolver: Boolean(ctx.canonicalResolver),
        sources: registry
          ? registry.list().map((s) => ({
              id: s.sourceId,
              capabilities: s.capabilities,
            }))
          : [],
      },
    };
  }

  // Intelligence: Hybrid Retrieval
  if (urlPath === '/api/v1/intelligence/search' && method === 'GET') {
    if (!ctx.retrievalService) {
      throw new IntelligenceUnavailableError('Retrieval service is not configured.');
    }
    const q = req.query?.q;
    if (!q || typeof q !== 'string') {
      throw new InvalidQueryError();
    }
    const limit = req.query?.limit ? Number(req.query.limit) : 10;
    const minScore = req.query?.minScore ? Number(req.query.minScore) : undefined;
    const sourceId = req.query?.sourceId;

    const results = await ctx.retrievalService.search({
      query: q,
      limit,
      minScore,
      sourceId,
    });

    const shouldResolve = req.query?.resolve === 'true' && ctx.canonicalResolver;
    if (shouldResolve && ctx.canonicalResolver) {
      const resolved = await ctx.canonicalResolver.resolveMany(results);
      return {
        status: 200,
        body: {
          query: q,
          total: results.length,
          items: resolved.map((r) => ({
            reference: r.reference,
            canonical: r.content,
            error: r.error,
          })),
        },
      };
    }

    return {
      status: 200,
      body: {
        query: q,
        total: results.length,
        items: results,
      },
    };
  }

  // Intelligence: Indexing
  if (urlPath === '/api/v1/intelligence/index' && method === 'POST') {
    if (!ctx.indexingService) {
      throw new IntelligenceUnavailableError('Indexing service is not configured.');
    }
    const body = (req.body || {}) as { sourceId?: string; contentId?: string; revisionId?: string };
    if (body.sourceId && body.contentId) {
      const result = await ctx.indexingService.indexDocument(body.sourceId, body.contentId, body.revisionId);
      return { status: 200, body: { success: true, result } };
    } else if (body.sourceId) {
      const summary = await ctx.indexingService.syncSource(body.sourceId);
      return { status: 200, body: { success: true, summary } };
    } else {
      const summaries = await ctx.indexingService.syncAll();
      return { status: 200, body: { success: true, summaries } };
    }
  }

  throw new RouteNotFoundError(`${method} ${urlPath}`);
}
