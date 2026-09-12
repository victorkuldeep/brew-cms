import * as path from 'node:path';
import {
  DocumentService,
  WorkflowService,
  AgentService,
  AuditService,
  TaxonomyService,
  type Clock,
  type IdGenerator,
  type Actor,
} from '@brew-cms/core';
import { PolicyEngine } from '@brew-cms/policy';
import {
  createDatabaseConnection,
  seedInitialData,
  SQLiteDocumentRepository,
  SQLiteRevisionRepository,
  SQLiteUserRepository,
  SQLiteTaxonomyRepository,
  SQLiteMediaAssetRepository,
  SQLiteAuditEventRepository,
  SQLiteAgentRepository,
} from '@brew-cms/db';
import { LocalMediaProvider } from '@brew-cms/media';
import { InMemorySearchProvider, DeterministicRecommendationEngine } from '@brew-cms/search';
import { InMemoryIdempotencyStore } from '@brew-cms/api';
import { BrewMcpServer } from '@brew-cms/mcp';

class CmsContainer {
  public db;
  public docRepo;
  public revRepo;
  public userRepo;
  public taxonomyRepo;
  public mediaRepo;
  public auditRepo;
  public agentRepo;

  public policyEngine;
  public clock: Clock;
  public idGen: IdGenerator;

  public documentService;
  public workflowService;
  public agentService;
  public auditService;
  public taxonomyService;

  public mediaProvider;
  public searchProvider;
  public recommendationEngine;
  public idempotencyStore;
  public mcpServer;

  constructor() {
    const dbFilePath = process.env.DATABASE_URL?.replace(/^file:/, '') || './data/brew.db';
    this.db = createDatabaseConnection({ filePath: dbFilePath });
    seedInitialData(this.db);

    this.docRepo = new SQLiteDocumentRepository(this.db);
    this.revRepo = new SQLiteRevisionRepository(this.db);
    this.userRepo = new SQLiteUserRepository(this.db);
    this.taxonomyRepo = new SQLiteTaxonomyRepository(this.db);
    this.mediaRepo = new SQLiteMediaAssetRepository(this.db);
    this.auditRepo = new SQLiteAuditEventRepository(this.db);
    this.agentRepo = new SQLiteAgentRepository(this.db);

    this.policyEngine = new PolicyEngine({ requireApprovalForAgentPublish: true });
    this.clock = { now: () => new Date() };

    let counter = 1;
    this.idGen = {
      generate: (prefix = 'id') => `${prefix}_${Date.now()}_${counter++}`,
    };

    this.documentService = new DocumentService(
      this.docRepo,
      this.revRepo,
      this.auditRepo,
      this.policyEngine,
      this.clock,
      this.idGen
    );

    this.workflowService = new WorkflowService(
      this.docRepo,
      this.revRepo,
      this.auditRepo,
      this.policyEngine,
      this.clock,
      this.idGen
    );

    this.agentService = new AgentService(
      this.agentRepo,
      this.auditRepo,
      this.policyEngine,
      this.clock,
      this.idGen
    );

    this.auditService = new AuditService(this.auditRepo);
    this.taxonomyService = new TaxonomyService(this.taxonomyRepo);

    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    this.mediaProvider = new LocalMediaProvider({
      uploadDir: uploadsDir,
      baseUrl: '/uploads',
    });

    this.searchProvider = new InMemorySearchProvider();
    this.recommendationEngine = new DeterministicRecommendationEngine();
    this.idempotencyStore = new InMemoryIdempotencyStore();

    this.mcpServer = new BrewMcpServer({
      documentService: this.documentService,
      workflowService: this.workflowService,
      agentService: this.agentService,
      auditService: this.auditService,
      taxonomyService: this.taxonomyService,
      revisionRepo: this.revRepo,
    });
  }

  getDefaultAdminActor(): Actor {
    return {
      id: 'usr_admin_default',
      type: 'human',
      name: 'BrewCMS Administrator',
      role: 'Admin',
    };
  }

  getApiContext() {
    return {
      documentService: this.documentService,
      workflowService: this.workflowService,
      agentService: this.agentService,
      auditService: this.auditService,
      taxonomyService: this.taxonomyService,
      revisionRepo: this.revRepo,
      mediaProvider: this.mediaProvider,
      mediaRepo: this.mediaRepo,
      agentRepo: this.agentRepo,
      idempotencyStore: this.idempotencyStore,
    };
  }
}

// Global singleton instance
const globalForCms = globalThis as unknown as { cmsContainer?: CmsContainer };

export const cms = globalForCms.cmsContainer ?? new CmsContainer();

if (process.env.NODE_ENV !== 'production') {
  globalForCms.cmsContainer = cms;
}
