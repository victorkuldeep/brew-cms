import type { AuditEvent } from '../domain/types.js';
import type { AuditEventRepository } from '../ports/repositories.js';

export class AuditService {
  constructor(private readonly auditRepo: AuditEventRepository) {}

  async listEvents(filter?: {
    resourceType?: string;
    resourceId?: string;
    actorId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    return this.auditRepo.list(filter);
  }
}
