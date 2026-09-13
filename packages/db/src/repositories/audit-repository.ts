import type { DatabaseSync } from 'node:sqlite';
import type { AuditEvent, AuditEventRepository } from '@brew-cms/core';
import { decodeCursor, encodeCursor } from '@brew-cms/core';

export class SQLiteAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: DatabaseSync) {}

  async create(event: Omit<AuditEvent, 'createdAt'>): Promise<AuditEvent> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO audit_events (
        id, event_type, actor_type, actor_id, resource_type,
        resource_id, correlation_id, request_id, before_json,
        after_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.eventType,
      event.actorType,
      event.actorId,
      event.resourceType,
      event.resourceId,
      event.correlationId ?? null,
      event.requestId ?? null,
      event.before ? JSON.stringify(event.before) : null,
      event.after ? JSON.stringify(event.after) : null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      now
    );

    const row = this.db.prepare('SELECT * FROM audit_events WHERE id = ?').get(event.id) as any;
    return this.mapRow(row);
  }

  async list(filter?: {
    resourceType?: string;
    resourceId?: string;
    actorId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
    cursor?: string;
  }): Promise<{ items: AuditEvent[]; total: number; nextCursor?: string }> {
    const where: string[] = [];
    const filterParams: any[] = [];

    if (filter?.resourceType) {
      where.push('resource_type = ?');
      filterParams.push(filter.resourceType);
    }
    if (filter?.resourceId) {
      where.push('resource_id = ?');
      filterParams.push(filter.resourceId);
    }
    if (filter?.actorId) {
      where.push('actor_id = ?');
      filterParams.push(filter.actorId);
    }
    if (filter?.eventType) {
      where.push('event_type = ?');
      filterParams.push(filter.eventType);
    }

    const cursorParams: any[] = [];
    let cursorPredicate = '';
    if (filter?.cursor) {
      const { t, id } = decodeCursor(filter.cursor);
      cursorPredicate = ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      cursorParams.push(t, t, id);
    }

    const baseWhere = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const pageWhere = baseWhere ? `${baseWhere}${cursorPredicate}` : cursorPredicate ? `WHERE 1=1${cursorPredicate}` : '';
    const countRow = this.db.prepare(`SELECT COUNT(*) as total FROM audit_events ${baseWhere}`).get(...filterParams) as any;
    const total = countRow ? Number(countRow.total) : 0;

    const limit = filter?.limit ?? 50;
    const offset = filter?.cursor ? 0 : (filter?.offset ?? 0);

    const rows = this.db.prepare(`
      SELECT * FROM audit_events ${pageWhere}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(...filterParams, ...cursorParams, limit, offset) as any[];
    const items = rows.map((r) => this.mapRow(r));

    let nextCursor: string | undefined;
    if (items.length === limit && limit > 0) {
      const last = items[items.length - 1];
      nextCursor = encodeCursor({ t: last.createdAt.toISOString(), id: last.id });
    }

    return { items, total, nextCursor };
  }

  private mapRow(row: any): AuditEvent {
    return {
      id: row.id,
      eventType: row.event_type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      correlationId: row.correlation_id,
      requestId: row.request_id,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
