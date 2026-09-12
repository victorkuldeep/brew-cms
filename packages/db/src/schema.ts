import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

// Users & RBAC
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  status: text('status').notNull().default('active'), // active, inactive, suspended
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
});

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.roleId] }),
  })
);

// Documents & Revisions
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // post | page
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  excerpt: text('excerpt'),
  status: text('status').notNull().default('DRAFT'), // DRAFT, IN_REVIEW, APPROVED, SCHEDULED, PUBLISHED, ARCHIVED
  authorId: text('author_id')
    .notNull()
    .references(() => users.id),
  publishedRevisionId: text('published_revision_id'),
  canonicalUrl: text('canonical_url'),
  scheduledAt: text('scheduled_at'),
  seoJson: text('seo_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const revisions = sqliteTable('revisions', {
  id: text('id').primaryKey(),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revision_number').notNull(),
  sourceMarkdown: text('source_markdown').notNull(),
  frontmatterJson: text('frontmatter_json').notNull(),
  contentIrJson: text('content_ir_json').notNull(),
  contentHash: text('content_hash').notNull(),
  compilerVersion: text('compiler_version').notNull(),
  wordCount: integer('word_count').notNull(),
  readingTimeSeconds: integer('reading_time_seconds').notNull(),
  createdBy: text('created_by').notNull(),
  changeSummary: text('change_summary'),
  createdAt: text('created_at').notNull(),
});

// Taxonomies
export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const documentTopics = sqliteTable(
  'document_topics',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.documentId, table.topicId] }),
  })
);

export const documentTags = sqliteTable(
  'document_tags',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.documentId, table.tagId] }),
  })
);

export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
});

export const documentSeries = sqliteTable(
  'document_series',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.documentId, table.seriesId] }),
  })
);

// Media
export const mediaAssets = sqliteTable('media_assets', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(), // local, s3, r2
  providerKey: text('provider_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  altText: text('alt_text'),
  caption: text('caption'),
  metadataJson: text('metadata_json'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

// Audit
export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  correlationId: text('correlation_id'),
  requestId: text('request_id'),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at').notNull(),
});

// Agents
export const agentIdentities = sqliteTable('agent_identities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const agentCredentials = sqliteTable('agent_credentials', {
  id: text('id').primaryKey(),
  agentIdentityId: text('agent_identity_id')
    .notNull()
    .references(() => agentIdentities.id, { onDelete: 'cascade' }),
  credentialHash: text('credential_hash').notNull(),
  scopesJson: text('scopes_json').notNull(),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
});

export const actionRuns = sqliteTable('action_runs', {
  id: text('id').primaryKey(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  idempotencyKey: text('idempotency_key'),
  policyDecision: text('policy_decision').notNull(),
  status: text('status').notNull().default('pending'),
  dryRun: integer('dry_run', { mode: 'boolean' }).notNull().default(false),
  inputJson: text('input_json'),
  outputJson: text('output_json'),
  errorJson: text('error_json'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
});

export const approvalRequests = sqliteTable('approval_requests', {
  id: text('id').primaryKey(),
  actionRunId: text('action_run_id')
    .notNull()
    .references(() => actionRuns.id, { onDelete: 'cascade' }),
  requestedBy: text('requested_by').notNull(),
  requestedAt: text('requested_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  decision: text('decision'), // approved, rejected
  decidedBy: text('decided_by'),
  decidedAt: text('decided_at'),
  reason: text('reason'),
});

// Webhooks & Redirects
export const webhookEndpoints = sqliteTable('webhook_endpoints', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  secretHash: text('secret_hash').notNull(),
  eventTypesJson: text('event_types_json').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  endpointId: text('endpoint_id')
    .notNull()
    .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull(),
  attempt: integer('attempt').notNull().default(1),
  status: text('status').notNull(), // pending, success, failure
  responseCode: integer('response_code'),
  nextAttemptAt: text('next_attempt_at'),
  deliveredAt: text('delivered_at'),
});

export const redirects = sqliteTable('redirects', {
  id: text('id').primaryKey(),
  fromPath: text('from_path').notNull().unique(),
  toPath: text('to_path').notNull(),
  statusCode: integer('status_code').notNull().default(301),
});
