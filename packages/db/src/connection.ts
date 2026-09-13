import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';

export type SqliteJournalMode = 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';

export interface DatabaseConfig {
  filePath?: string; // e.g. "./data/brew.db" or ":memory:"
  /**
   * SQLite journal mode. Defaults to `DELETE`.
   *
   * Rationale: on shared/ephemeral Node.js hosts, leftover `-wal`/`-shm`
   * files from a previous deploy or crash block clean startup and surface
   * as gateway timeouts. `DELETE` keeps the database self-contained in a
   * single file. Override with `BREW_SQLITE_JOURNAL_MODE=WAL` when the host
   * guarantees a persistent, single-writer volume.
   */
  journalMode?: SqliteJournalMode;
}

export function createDatabaseConnection(config: DatabaseConfig = {}): DatabaseSync {
  const targetPath = config.filePath ?? ':memory:';
  const journalMode: SqliteJournalMode =
    config.journalMode ??
    (process.env.BREW_SQLITE_JOURNAL_MODE as SqliteJournalMode | undefined) ??
    'DELETE';

  if (targetPath !== ':memory:') {
    const dir = path.dirname(path.resolve(targetPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);

  if (targetPath !== ':memory:') {
    // Recover WAL content left by a previous WAL-mode session (parallel
    // build workers, crash, or journal-mode switch) BEFORE enforcing the
    // configured mode, so no committed data is stranded in a stale -wal.
    if (fs.existsSync(targetPath + '-wal')) {
      try {
        db.exec('PRAGMA journal_mode = WAL;');
        try {
          db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        } catch {
          // Another live connection may block TRUNCATE — take what we can get
          db.exec('PRAGMA wal_checkpoint(PASSIVE);');
        }
        // eslint-disable-next-line no-empty
      } catch {}
    }
    db.exec(`PRAGMA journal_mode = ${journalMode};`);
    // The -shm file is pure shared-memory state; meaningless across restarts.
    if (journalMode === 'DELETE') {
      try {
        if (fs.existsSync(targetPath + '-shm')) {
          fs.unlinkSync(targetPath + '-shm');
        }
        // eslint-disable-next-line no-empty
      } catch {}
    }
    // eslint-disable-next-line no-console
    console.log(`[brew-cms:db] ${targetPath} (journal_mode=${journalMode})`);
  }
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');

  initializeSchema(db);

  return db;
}

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      excerpt TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      author_id TEXT NOT NULL REFERENCES users(id),
      published_revision_id TEXT,
      canonical_url TEXT,
      scheduled_at TEXT,
      seo_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      revision_number INTEGER NOT NULL,
      source_markdown TEXT NOT NULL,
      frontmatter_json TEXT NOT NULL,
      content_ir_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      compiler_version TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      reading_time_seconds INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      change_summary TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_topics (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      PRIMARY KEY (document_id, topic_id)
    );

    CREATE TABLE IF NOT EXISTS document_tags (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (document_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS document_series (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (document_id, series_id)
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      alt_text TEXT,
      caption TEXT,
      metadata_json TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      correlation_id TEXT,
      request_id TEXT,
      before_json TEXT,
      after_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_identities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_credentials (
      id TEXT PRIMARY KEY,
      agent_identity_id TEXT NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
      credential_hash TEXT NOT NULL,
      scopes_json TEXT NOT NULL,
      expires_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_runs (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      idempotency_key TEXT,
      policy_decision TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      dry_run INTEGER NOT NULL DEFAULT 0,
      input_json TEXT,
      output_json TEXT,
      error_json TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      action_run_id TEXT NOT NULL REFERENCES action_runs(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      decision TEXT,
      decided_by TEXT,
      decided_at TEXT,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      event_types_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      response_code INTEGER,
      next_attempt_at TEXT,
      delivered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS redirects (
      id TEXT PRIMARY KEY,
      from_path TEXT NOT NULL UNIQUE,
      to_path TEXT NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 301
    );

    CREATE TABLE IF NOT EXISTS idempotency_records (
      key TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_body_json TEXT,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (key, actor_id)
    );

    -- Indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_revisions_doc ON revisions(document_id);
    CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_id);
    CREATE INDEX IF NOT EXISTS idx_action_runs_key ON action_runs(idempotency_key);
  `);
}
