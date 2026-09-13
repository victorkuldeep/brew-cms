/**
 * BrewCMS Core Domain Types
 * Independent of any framework or driver.
 */

export type DocumentType = 'post' | 'page';

export type DocumentStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type ActorType = 'human' | 'agent' | 'system' | 'service';

export interface Actor {
  id: string;
  type: ActorType;
  name?: string;
  role?: string;
  scopes?: string[];
}

export interface DocumentSeo {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}

export interface Document {
  id: string;
  type: DocumentType;
  slug: string;
  title: string;
  excerpt?: string | null;
  status: DocumentStatus;
  authorId: string;
  publishedRevisionId?: string | null;
  canonicalUrl?: string | null;
  scheduledAt?: Date | null;
  seo?: DocumentSeo | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentFilter {
  type?: DocumentType;
  status?: DocumentStatus;
  authorId?: string;
  topicId?: string;
  tagId?: string;
  query?: string;
  limit?: number;
  offset?: number;
  /**
   * Opaque keyset cursor (see pagination.ts). When present, repositories
   * page from the named row instead of OFFSET — stable under inserts.
   */
  cursor?: string;
}

export interface Revision {
  id: string;
  documentId: string;
  revisionNumber: number;
  sourceMarkdown: string;
  frontmatter: Record<string, unknown>;
  contentIr: unknown;
  contentHash: string;
  compilerVersion: string;
  wordCount: number;
  readingTimeSeconds: number;
  createdBy: string;
  changeSummary?: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
}

export interface Permission {
  id: string;
  key: string;
}

export interface Topic {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
}

export interface Series {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface MediaAsset {
  id: string;
  provider: 'local' | 's3' | 'r2';
  providerKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy: string;
  createdAt: Date;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actorType: ActorType;
  actorId: string;
  resourceType: string;
  resourceId: string;
  correlationId?: string | null;
  requestId?: string | null;
  before?: unknown | null;
  after?: unknown | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AgentIdentity {
  id: string;
  name: string;
  description?: string | null;
  status: 'active' | 'disabled';
  scopes: string[];
  createdAt: Date;
}

export type PolicyDecision = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export type ActionRunStatus = 'pending' | 'executing' | 'completed' | 'rejected' | 'failed';

export interface ActionRun {
  id: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  idempotencyKey?: string | null;
  policyDecision: PolicyDecision;
  status: ActionRunStatus;
  dryRun: boolean;
  input?: unknown | null;
  output?: unknown | null;
  error?: unknown | null;
  startedAt: Date;
  completedAt?: Date | null;
}

export interface ApprovalRequest {
  id: string;
  actionRunId: string;
  requestedBy: string;
  requestedAt: Date;
  expiresAt: Date;
  decision?: 'approved' | 'rejected' | null;
  decidedBy?: string | null;
  decidedAt?: Date | null;
  reason?: string | null;
}

export interface Redirect {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302 | 307 | 308;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  secretHash: string;
  eventTypes: string[];
  active: boolean;
  createdAt: Date;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventId: string;
  attempt: number;
  status: 'pending' | 'success' | 'failure';
  responseCode?: number | null;
  nextAttemptAt?: Date | null;
  deliveredAt?: Date | null;
}
