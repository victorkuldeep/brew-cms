import type {
  Document,
  DocumentFilter,
  Revision,
  User,
  Role,
  Topic,
  Tag,
  Series,
  MediaAsset,
  AuditEvent,
  AgentIdentity,
  ActionRun,
  ApprovalRequest,
  Redirect,
  WebhookEndpoint,
  WebhookDelivery,
} from '../domain/types.js';

export interface DocumentRepository {
  findById(id: string): Promise<Document | null>;
  findBySlug(slug: string): Promise<Document | null>;
  create(doc: Omit<Document, 'createdAt' | 'updatedAt'>): Promise<Document>;
  update(id: string, updates: Partial<Document>): Promise<Document>;
  delete(id: string): Promise<void>;
  list(filter?: DocumentFilter): Promise<{ items: Document[]; total: number }>;
}

export interface RevisionRepository {
  findById(id: string): Promise<Revision | null>;
  listByDocumentId(documentId: string): Promise<Revision[]>;
  getLatestByDocumentId(documentId: string): Promise<Revision | null>;
  create(revision: Omit<Revision, 'createdAt'>): Promise<Revision>;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User>;
  list(): Promise<User[]>;
  getUserRoles(userId: string): Promise<Role[]>;
  getUserPermissions(userId: string): Promise<string[]>;
  setUserRoles(userId: string, roleIds: string[]): Promise<void>;
}

export interface TaxonomyRepository {
  // Topics
  createTopic(topic: Topic): Promise<Topic>;
  findTopicById(id: string): Promise<Topic | null>;
  findTopicBySlug(slug: string): Promise<Topic | null>;
  listTopics(): Promise<Topic[]>;

  // Tags
  createTag(tag: Tag): Promise<Tag>;
  findTagById(id: string): Promise<Tag | null>;
  findTagBySlug(slug: string): Promise<Tag | null>;
  listTags(): Promise<Tag[]>;
  setDocumentTags(documentId: string, tagIds: string[]): Promise<void>;
  getDocumentTags(documentId: string): Promise<Tag[]>;

  // Series
  createSeries(series: Series): Promise<Series>;
  findSeriesById(id: string): Promise<Series | null>;
  findSeriesBySlug(slug: string): Promise<Series | null>;
  listSeries(): Promise<Series[]>;
  setDocumentSeries(documentId: string, seriesId: string, position: number): Promise<void>;
  getDocumentSeries(documentId: string): Promise<{ series: Series; position: number } | null>;
}

export interface MediaAssetRepository {
  findById(id: string): Promise<MediaAsset | null>;
  create(asset: Omit<MediaAsset, 'createdAt'>): Promise<MediaAsset>;
  list(filter?: { mimeType?: string; limit?: number; offset?: number }): Promise<MediaAsset[]>;
  delete(id: string): Promise<void>;
}

export interface AuditEventRepository {
  create(event: Omit<AuditEvent, 'createdAt'>): Promise<AuditEvent>;
  list(filter?: {
    resourceType?: string;
    resourceId?: string;
    actorId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]>;
}

export interface AgentRepository {
  findById(id: string): Promise<AgentIdentity | null>;
  create(agent: Omit<AgentIdentity, 'createdAt'>): Promise<AgentIdentity>;
  list(): Promise<AgentIdentity[]>;
  createActionRun(run: Omit<ActionRun, 'startedAt'>): Promise<ActionRun>;
  getActionRunById(id: string): Promise<ActionRun | null>;
  updateActionRun(id: string, updates: Partial<ActionRun>): Promise<ActionRun>;
  listActionRuns(filter?: { agentId?: string; status?: string; limit?: number }): Promise<ActionRun[]>;
  createApprovalRequest(req: Omit<ApprovalRequest, 'requestedAt'>): Promise<ApprovalRequest>;
  getApprovalRequestByActionRunId(actionRunId: string): Promise<ApprovalRequest | null>;
  updateApprovalRequest(id: string, updates: Partial<ApprovalRequest>): Promise<ApprovalRequest>;
}

export interface WebhookRepository {
  createEndpoint(endpoint: Omit<WebhookEndpoint, 'createdAt'>): Promise<WebhookEndpoint>;
  listEndpoints(): Promise<WebhookEndpoint[]>;
  findEndpointById(id: string): Promise<WebhookEndpoint | null>;
  createDelivery(delivery: Omit<WebhookDelivery, 'id'>): Promise<WebhookDelivery>;
  listDeliveries(endpointId: string): Promise<WebhookDelivery[]>;
}

export interface RedirectRepository {
  create(redirect: Redirect): Promise<Redirect>;
  findByFromPath(fromPath: string): Promise<Redirect | null>;
  list(): Promise<Redirect[]>;
  delete(id: string): Promise<void>;
}
