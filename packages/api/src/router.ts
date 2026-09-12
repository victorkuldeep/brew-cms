import type {
  Actor,
  DocumentService,
  WorkflowService,
  AgentService,
  AuditService,
  TaxonomyService,
  RevisionRepository,
  MediaProvider,
  MediaAssetRepository,
  AgentRepository,
} from '@brew-cms/core';
import { compileContent } from '@brew-cms/content';
import { formatErrorResponse } from './errors.js';
import { InMemoryIdempotencyStore } from './idempotency.js';
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

export interface ApiContext {
  documentService: DocumentService;
  workflowService: WorkflowService;
  agentService: AgentService;
  auditService: AuditService;
  taxonomyService: TaxonomyService;
  revisionRepo: RevisionRepository;
  mediaProvider?: MediaProvider;
  mediaRepo?: MediaAssetRepository;
  agentRepo?: AgentRepository;
  idempotencyStore?: InMemoryIdempotencyStore;
}

export async function handleApiRequest(
  req: ApiRequest,
  ctx: ApiContext
): Promise<ApiResponse> {
  const idempotencyKey = req.headers?.['idempotency-key'];
  const idempotencyStore = ctx.idempotencyStore;

  // 1. Idempotency Check for mutations
  if (idempotencyKey && req.method !== 'GET' && idempotencyStore) {
    const cached = idempotencyStore.get(idempotencyKey, req.actor.id);
    if (cached) {
      return {
        status: cached.responseStatus,
        headers: { 'X-Cache-Lookup': 'HIT', 'Idempotency-Key': idempotencyKey },
        body: cached.responseBody,
      };
    }
  }

  try {
    const response = await dispatchRoute(req, ctx);

    // Save in idempotency store if mutation
    if (idempotencyKey && req.method !== 'GET' && idempotencyStore && response.status < 400) {
      idempotencyStore.set(idempotencyKey, req.actor.id, response.status, response.body);
    }

    return response;
  } catch (err: any) {
    const errorFormatted = formatErrorResponse(err, req.headers?.['x-request-id']);
    return {
      status: errorFormatted.status,
      headers: { 'Content-Type': 'application/json' },
      body: errorFormatted.body,
    };
  }
}

async function dispatchRoute(req: ApiRequest, ctx: ApiContext): Promise<ApiResponse> {
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
        limit: req.query?.limit ? Number(req.query.limit) : undefined,
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
    if (method === 'PUT') {
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
    const revisions = await ctx.revisionRepo.listByDocumentId(id);
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

  // Media: /api/v1/media
  if (urlPath === '/api/v1/media') {
    if (method === 'GET') {
      const items = ctx.mediaRepo
        ? await ctx.mediaRepo.list({
            mimeType: req.query?.mimeType,
            limit: req.query?.limit ? Number(req.query.limit) : 50,
          })
        : [];
      return { status: 200, body: { items } };
    }
    if (method === 'POST') {
      const body = req.body as any;
      if (!ctx.mediaRepo) {
        return { status: 500, body: { error: { code: 'NO_MEDIA_REPO', message: 'Media repository not configured.' } } };
      }
      let stored: any = null;
      if (ctx.mediaProvider && body.contentBase64) {
        stored = await ctx.mediaProvider.put({
          filename: body.filename,
          mimeType: body.mimeType,
          content: Buffer.from(body.contentBase64, 'base64'),
          prefix: body.prefix,
        });
      }
      const asset = await ctx.mediaRepo.create({
        id: body.id || `med_${Date.now()}`,
        provider: stored?.provider || 'local',
        providerKey: stored?.providerKey || body.providerKey || body.filename,
        mimeType: body.mimeType || 'application/octet-stream',
        sizeBytes: stored?.sizeBytes || body.sizeBytes || 0,
        width: body.width ?? null,
        height: body.height ?? null,
        altText: body.altText ?? null,
        caption: body.caption ?? null,
        metadata: body.metadata ?? null,
        createdBy: actor.id,
      });
      return { status: 201, body: asset };
    }
  }

  // Audit Events
  if (urlPath === '/api/v1/audit' && method === 'GET') {
    const events = await ctx.auditService.listEvents({
      resourceType: req.query?.resourceType,
      resourceId: req.query?.resourceId,
      actorId: req.query?.actorId,
      limit: req.query?.limit ? Number(req.query.limit) : 50,
    });
    return { status: 200, body: { items: events } };
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

  // Agent Action Runs: /api/v1/agent/runs
  if (urlPath === '/api/v1/agent/runs') {
    if (method === 'GET') {
      const runs = ctx.agentRepo
        ? await ctx.agentRepo.listActionRuns({ limit: req.query?.limit ? Number(req.query.limit) : 50 })
        : [];
      return { status: 200, body: { items: runs } };
    }
  }

  // Agent Action Run Approval: /api/v1/agent/runs/:id/approve
  const approveRunMatch = urlPath.match(/^\/api\/v1\/agent\/runs\/([^/]+)\/approve$/);
  if (approveRunMatch && method === 'POST') {
    const runId = approveRunMatch[1];
    const res = await ctx.agentService.approveActionRun(actor, runId, (req.body as any)?.reason);
    return { status: 200, body: res };
  }

  // Agent Action Run Rejection: /api/v1/agent/runs/:id/reject
  const rejectRunMatch = urlPath.match(/^\/api\/v1\/agent\/runs\/([^/]+)\/reject$/);
  if (rejectRunMatch && method === 'POST') {
    const runId = rejectRunMatch[1];
    const res = await ctx.agentService.rejectActionRun(actor, runId, (req.body as any)?.reason);
    return { status: 200, body: res };
  }

  return {
    status: 404,
    body: {
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint '${method} ${urlPath}' was not found.`,
      },
    },
  };
}
