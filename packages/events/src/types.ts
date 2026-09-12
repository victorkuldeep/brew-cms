import type { Actor } from '@brew-cms/core';

export type DomainEventType =
  | 'content.created'
  | 'content.updated'
  | 'content.deleted'
  | 'revision.created'
  | 'content.submitted'
  | 'content.changes_requested'
  | 'content.approved'
  | 'content.published'
  | 'content.unpublished'
  | 'content.scheduled'
  | 'content.archived'
  | 'revision.restored'
  | 'media.created'
  | 'media.deleted'
  | 'taxonomy.changed'
  | 'agent.action_run_completed'
  | 'agent.action_run_approved';

export interface DomainEvent<T = unknown> {
  id: string;
  type: DomainEventType | string;
  payload: T;
  actor?: Actor;
  correlationId?: string;
  timestamp: Date;
}

export interface OutboxRecord {
  id: string;
  eventType: string;
  payloadJson: string;
  status: 'pending' | 'processed' | 'failed';
  attempts: number;
  lastError?: string | null;
  createdAt: Date;
  processedAt?: Date | null;
}
