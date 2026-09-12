import type { DatabaseSync } from 'node:sqlite';
import type { AuditEvent, AuditEventRepository } from '@brew-cms/core';

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
  }): Promise<AuditEvent[]> {
    const where: string[] = [];
    const params: any[] = [];

    if (filter?.resourceType) {
      where.push('resource_type = ?');
      params.push(filter.resourceType);
    }
    if (filter?.resourceId) {
      where.push('resource_id = ?');
      params.push(filter.resourceId);
    }
    if (filter?.actorId) {
      where.push('actor_id = ?');
      params.push(filter.actorId);
    }
    if (filter?.eventType) {
      where.push('event_type = ?');
      params.push(filter.eventType);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const rows = this.db.prepare(`
      SELECT * FROM audit_events ${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    return rows.map((r) => this.mapRow(r));
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
