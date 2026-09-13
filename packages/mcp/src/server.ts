import type {
  Actor,
  DocumentService,
  WorkflowService,
  AgentService,
  AuditService,
  TaxonomyService,
  RevisionRepository,
} from '@brew-cms/core';
import { compileContent } from '@brew-cms/content';
import type { McpResource, McpTool, McpToolCallResult } from './types.js';

export interface McpServerContext {
  documentService: DocumentService;
  workflowService: WorkflowService;
  agentService: AgentService;
  auditService: AuditService;
  taxonomyService: TaxonomyService;
  revisionRepo: RevisionRepository;
  siteName?: string;
  siteDescription?: string;
}

export class BrewMcpServer {
  constructor(private readonly ctx: McpServerContext) {}

  listResources(): McpResource[] {
    return [
      { uri: 'brew://site', name: 'Site Overview', mimeType: 'application/json' },
      { uri: 'brew://schema/content', name: 'Content Schema', mimeType: 'application/json' },
      { uri: 'brew://topics', name: 'Taxonomy Topics', mimeType: 'application/json' },
    ];
  }

  async readResource(uri: string): Promise<{ contents: unknown }> {
    if (uri === 'brew://site') {
      return {
        contents: {
          name: this.ctx.siteName ?? 'BrewCMS',
          description: this.ctx.siteDescription ?? 'Agent-ready content operating system',
          version: '0.1.0',
        },
      };
    }

    if (uri === 'brew://schema/content') {
      return {
        contents: {
          documentTypes: ['post', 'page'],
          statuses: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
          compilerVersion: '1.0.0',
        },
      };
    }

    if (uri === 'brew://topics') {
      const topics = await this.ctx.taxonomyService.listTopics();
      return { contents: { topics } };
    }

    // Document resource: brew://document/{id}
    const docMatch = uri.match(/^brew:\/\/document\/([^/]+)$/);
    if (docMatch) {
      const doc = await this.ctx.documentService.getDocument(docMatch[1]);
      const revisions = await this.ctx.documentService.getRevisions(doc.id);
      return { contents: { document: doc, latestRevision: revisions[0] ?? null } };
    }

    // Revision resource: brew://document/{id}/revision/{revId}
    const revMatch = uri.match(/^brew:\/\/document\/([^/]+)\/revision\/([^/]+)$/);
    if (revMatch) {
      const revisions = await this.ctx.documentService.getRevisions(revMatch[1]);
      const rev = revisions.find((r) => r.id === revMatch[2]) ?? null;
      return { contents: { revision: rev } };
    }

    throw new Error(`Resource '${uri}' not found`);
  }

  listTools(): McpTool[] {
    return [
      {
        name: 'brew_list_capabilities',
        description: 'Discover available BrewCMS capabilities, workflows, and current agent policy boundaries.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'brew_search_content',
        description: 'Search published and draft documents by text query and filters.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term' },
            type: { type: 'string', enum: ['post', 'page'] },
            status: { type: 'string' },
          },
          required: ['query'],
        },
      },
      {
        name: 'brew_get_document',
        description: 'Get document details and latest revision content by ID or slug.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            slug: { type: 'string' },
          },
        },
      },
      {
        name: 'brew_validate_document',
        description: 'Validate and compile Markdown source against the Content IR without saving.',
        parameters: {
          type: 'object',
          properties: {
            sourceMarkdown: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['sourceMarkdown'],
        },
      },
      {
        name: 'brew_create_draft',
        description: 'Create a new content draft with compiled Content IR and revision history.',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['post', 'page'] },
            slug: { type: 'string' },
            title: { type: 'string' },
            excerpt: { type: 'string' },
            sourceMarkdown: { type: 'string' },
          },
          required: ['type', 'slug', 'title', 'sourceMarkdown'],
        },
      },
      {
        name: 'brew_update_draft',
        description: 'Update an existing draft document and create a new immutable revision.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            sourceMarkdown: { type: 'string' },
            changeSummary: { type: 'string' },
          },
          required: ['id'],
        },
      },
      {
        name: 'brew_submit_for_review',
        description: 'Submit a draft document for editorial review (transitions DRAFT -> IN_REVIEW).',
        parameters: {
          type: 'object',
          properties: {
            documentId: { type: 'string' },
          },
          required: ['documentId'],
        },
      },
      {
        name: 'brew_publish',
        description: 'Publish an approved content revision. Requires human approval for agents by default policy.',
        parameters: {
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            revisionId: { type: 'string' },
          },
          required: ['documentId'],
        },
      },
    ];
  }

  async callTool(
    name: string,
    args: Record<string, any>,
    actor: Actor,
    options?: { dryRun?: boolean; idempotencyKey?: string }
  ): Promise<McpToolCallResult> {
    const isDryRun = Boolean(options?.dryRun);

    // Discovery & Read tools (do not require ActionRun mutations)
    if (name === 'brew_list_capabilities') {
      return {
        status: 'COMPLETED',
        output: {
          capabilities: [
            'content:read',
            'content:create',
            'content:update',
            'content:review',
            'content:publish',
            'search',
            'validation',
          ],
          workflowStates: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
          policyDefaults: {
            allowDrafting: true,
            allowSearch: true,
            requireApprovalForPublish: true,
            denySecurityManagement: true,
          },
        },
      };
    }

    if (name === 'brew_validate_document') {
      try {
        const compiled = compileContent(args.sourceMarkdown);
        return {
          status: 'COMPLETED',
          output: {
            valid: true,
            contentHash: compiled.contentHash,
            wordCount: compiled.wordCount,
            readingTimeSeconds: compiled.readingTimeSeconds,
            nodeCount: compiled.contentIr.nodes.length,
          },
        };
      } catch (err: any) {
        return {
          status: 'FAILED',
          error: err.message,
        };
      }
    }

    if (name === 'brew_search_content') {
      const docs = await this.ctx.documentService.listDocuments({
        query: args.query,
        type: args.type,
        status: args.status,
      });
      return {
        status: 'COMPLETED',
        output: docs,
      };
    }

    if (name === 'brew_get_document') {
      let doc;
      if (args.id) doc = await this.ctx.documentService.getDocument(args.id);
      else if (args.slug) doc = await this.ctx.documentService.getDocumentBySlug(args.slug);
      if (!doc) return { status: 'FAILED', error: 'Document not found' };

      const revisions = await this.ctx.documentService.getRevisions(doc.id);
      return {
        status: 'COMPLETED',
        output: { document: doc, latestRevision: revisions[0] ?? null },
      };
    }

    // Mutating tools — Route through agentService.executeActionRun for strict policy enforcement, dry-run, and audit
    let action = '';
    let resourceType = 'document';
    let resourceId: string | null = null;
    let executor: (input: any) => Promise<unknown>;

    if (name === 'brew_create_draft') {
      action = 'content:create';
      executor = async (input: any) => {
        const compiled = compileContent(input.sourceMarkdown);
        return this.ctx.documentService.createDraft(actor, {
          type: input.type,
          slug: input.slug,
          title: input.title,
          excerpt: input.excerpt,
          sourceMarkdown: compiled.sourceMarkdown,
          frontmatter: compiled.frontmatter,
          contentIr: compiled.contentIr,
          contentHash: compiled.contentHash,
          compilerVersion: compiled.compilerVersion,
          wordCount: compiled.wordCount,
          readingTimeSeconds: compiled.readingTimeSeconds,
        });
      };
    } else if (name === 'brew_update_draft') {
      action = 'content:update';
      resourceId = args.id;
      executor = async (input: any) => {
        let compiled;
        if (input.sourceMarkdown) compiled = compileContent(input.sourceMarkdown);
        return this.ctx.documentService.updateDraft(actor, input.id, {
          title: input.title,
          sourceMarkdown: compiled?.sourceMarkdown,
          frontmatter: compiled?.frontmatter,
          contentIr: compiled?.contentIr,
          contentHash: compiled?.contentHash,
          compilerVersion: compiled?.compilerVersion,
          wordCount: compiled?.wordCount,
          readingTimeSeconds: compiled?.readingTimeSeconds,
          changeSummary: input.changeSummary,
        });
      };
    } else if (name === 'brew_submit_for_review') {
      action = 'content:review';
      resourceId = args.documentId;
      executor = async (input: any) => {
        return this.ctx.workflowService.submitForReview(actor, input.documentId);
      };
    } else if (name === 'brew_publish') {
      action = 'content:publish';
      resourceId = args.documentId;
      executor = async (input: any) => {
        return this.ctx.workflowService.publish(actor, input.documentId, input.revisionId);
      };
    } else {
      return { status: 'FAILED', error: `Unknown tool: '${name}'` };
    }

    try {
      const actionRun = await this.ctx.agentService.executeActionRun(actor, {
        action,
        resourceType,
        resourceId,
        input: args,
        idempotencyKey: options?.idempotencyKey,
        dryRun: isDryRun,
        executor,
      });

      if (actionRun.policyDecision === 'REQUIRE_APPROVAL') {
        return {
          status: 'REQUIRE_APPROVAL',
          actionRunId: actionRun.id,
          documentId: resourceId ?? undefined,
          policy: {
            decision: 'REQUIRE_APPROVAL',
            reason: 'Agent publication requires human editorial approval.',
          },
          nextAction: 'approve_action_run',
        };
      }

      return {
        status: actionRun.status === 'completed' ? 'COMPLETED' : 'FAILED',
        actionRunId: actionRun.id,
        output: actionRun.output,
        error: actionRun.error ? (actionRun.error as any).message : undefined,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        error: err.message,
      };
    }
  }
}
