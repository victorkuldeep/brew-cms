import type { DatabaseSync } from 'node:sqlite';
import type { IdempotencyRecord, IdempotencyStore } from '@brew-cms/core';

/**
 * SQLite-backed Idempotency-Key store (Charter §13).
 * Drop-in replacement for the in-memory store: replays survive restarts
 * and multi-instance deployments sharing one database file. Expired rows
 * are evicted lazily on read.
 */
export class SqliteIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: DatabaseSync) {}

  get(key: string, actorId: string): IdempotencyRecord | null {
    const row = this.db
      .prepare('SELECT * FROM idempotency_records WHERE key = ? AND actor_id = ?')
      .get(key, actorId) as any;
    if (!row) return null;

    if (row.expires_at < new Date().toISOString()) {
      this.db.prepare('DELETE FROM idempotency_records WHERE key = ? AND actor_id = ?').run(key, actorId);
      return null;
    }

    return {
      key: row.key,
      actorId: row.actor_id,
      responseStatus: Number(row.response_status),
      responseBody: row.response_body_json ? JSON.parse(row.response_body_json) : null,
      expiresAt: new Date(row.expires_at),
    };
  }

  set(
    key: string,
    actorId: string,
    responseStatus: number,
    responseBody: unknown,
    ttlSeconds: number = 3600
  ): void {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO idempotency_records
        (key, actor_id, response_status, response_body_json, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(key, actorId, responseStatus, JSON.stringify(responseBody) ?? 'null', expiresAt);
  }
}
