import { describe, it, expect, beforeEach } from 'vitest';
import { BrewMcpServer } from '../server.js';
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
} from '@brew-cms/db';

describe('BrewMcpServer — Model Context Protocol with Bounded Autonomy', () => {
  let server: BrewMcpServer;
  let agentRepo: SQLiteAgentRepository;

  const agentActor: Actor = {
    id: 'agent_editorial_assistant',
    type: 'agent',
    role: 'Editor',
    scopes: ['content:read', 'content:create', 'content:update', 'content:review', 'content:publish', 'content:search'],
  };

  beforeEach(() => {
    const db = createDatabaseConnection({ filePath: ':memory:' });
    seedInitialData(db);

    const docRepo = new SQLiteDocumentRepository(db);
    const revRepo = new SQLiteRevisionRepository(db);
    const taxRepo = new SQLiteTaxonomyRepository(db);
    const auditRepo = new SQLiteAuditEventRepository(db);
    agentRepo = new SQLiteAgentRepository(db);

    const policy = new PolicyEngine({ requireApprovalForAgentPublish: true });
    const clock: Clock = { now: () => new Date('2026-09-12T12:00:00Z') };
    let idCounter = 1;
    const idGen: IdGenerator = { generate: (p = 'id') => `${p}_${idCounter++}` };

    const documentService = new DocumentService(docRepo, revRepo, auditRepo, policy, clock, idGen);
    const workflowService = new WorkflowService(docRepo, revRepo, auditRepo, policy, clock, idGen);
    const agentService = new AgentService(agentRepo, auditRepo, policy, clock, idGen);
    const auditService = new AuditService(auditRepo);
    const taxonomyService = new TaxonomyService(taxRepo);

    server = new BrewMcpServer({
      documentService,
      workflowService,
      agentService,
      auditService,
      taxonomyService,
      revisionRepo: revRepo,
    });
  });

  it('exposes MCP standard resources and tools', async () => {
    const resources = server.listResources();
    expect(resources.some((r) => r.uri === 'brew://site')).toBe(true);
    expect(resources.some((r) => r.uri === 'brew://schema/content')).toBe(true);

    const siteContent = await server.readResource('brew://site');
    expect((siteContent.contents as any).name).toBe('BrewCMS');

    const tools = server.listTools();
    expect(tools.some((t) => t.name === 'brew_create_draft')).toBe(true);
    expect(tools.some((t) => t.name === 'brew_publish')).toBe(true);
  });

  it('validates document without mutating repository via brew_validate_document', async () => {
    const res = await server.callTool(
      'brew_validate_document',
      { sourceMarkdown: '# MCP Validated Article\n\nTesting dry validation.' },
      agentActor
    );

    expect(res.status).toBe('COMPLETED');
    expect((res.output as any).valid).toBe(true);
    expect((res.output as any).wordCount).toBeGreaterThan(0);
  });

  it('allows agent to create a content draft through brew_create_draft', async () => {
    const res = await server.callTool(
      'brew_create_draft',
      {
        type: 'post',
        slug: 'mcp-agent-draft',
        title: 'MCP Agent Draft',
        sourceMarkdown: '# Drafted by Agent\n\nAgent generated draft.',
      },
      agentActor
    );

    expect(res.status).toBe('COMPLETED');
    expect(res.actionRunId).toBeDefined();

    // Verify ActionRun was durably created
    const run = await agentRepo.getActionRunById(res.actionRunId!);
    expect(run).not.toBeNull();
    expect(run?.actorId).toBe('agent_editorial_assistant');
    expect(run?.status).toBe('completed');
  });

  it('enforces REQUIRE_APPROVAL when agent attempts to publish via brew_publish', async () => {
    // 1. Create draft first
    const draftRes = await server.callTool(
      'brew_create_draft',
      {
        type: 'post',
        slug: 'mcp-publish-test',
        title: 'Publish Test',
        sourceMarkdown: '# Content to publish',
      },
      agentActor
    );
    const docId = (draftRes.output as any).document.id;

    // 2. Attempt publish
    const publishRes = await server.callTool(
      'brew_publish',
      { documentId: docId },
      agentActor
    );

    expect(publishRes.status).toBe('REQUIRE_APPROVAL');
    expect(publishRes.nextAction).toBe('approve_action_run');
    expect(publishRes.policy?.decision).toBe('REQUIRE_APPROVAL');

    // Verify approval request was generated
    const approval = await agentRepo.getApprovalRequestByActionRunId(publishRes.actionRunId!);
    expect(approval).not.toBeNull();
    expect(approval?.requestedBy).toBe('agent_editorial_assistant');
  });
});
