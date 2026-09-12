import type { DatabaseSync } from 'node:sqlite';
import type {
  AgentIdentity,
  ActionRun,
  ApprovalRequest,
  AgentRepository,
} from '@brew-cms/core';

export class SQLiteAgentRepository implements AgentRepository {
  constructor(private readonly db: DatabaseSync) {}

  async findById(id: string): Promise<AgentIdentity | null> {
    const row = this.db.prepare('SELECT * FROM agent_identities WHERE id = ?').get(id) as any;
    if (!row) return null;

    // Fetch scopes from agent_credentials if any
    const credRow = this.db.prepare('SELECT scopes_json FROM agent_credentials WHERE agent_identity_id = ?').get(id) as any;
    const scopes = credRow ? JSON.parse(credRow.scopes_json) : [];

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      scopes,
      createdAt: new Date(row.created_at),
    };
  }

  async create(agent: Omit<AgentIdentity, 'createdAt'>): Promise<AgentIdentity> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO agent_identities (id, name, description, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(agent.id, agent.name, agent.description ?? null, agent.status, now);

    this.db.prepare(`
      INSERT INTO agent_credentials (id, agent_identity_id, credential_hash, scopes_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(`cred_${agent.id}`, agent.id, 'dummy_hash', JSON.stringify(agent.scopes), now);

    return (await this.findById(agent.id))!;
  }

  async list(): Promise<AgentIdentity[]> {
    const rows = this.db.prepare('SELECT * FROM agent_identities ORDER BY created_at ASC').all() as any[];
    const list: AgentIdentity[] = [];
    for (const r of rows) {
      const agent = await this.findById(r.id);
      if (agent) list.push(agent);
    }
    return list;
  }

  async createActionRun(run: Omit<ActionRun, 'startedAt'>): Promise<ActionRun> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO action_runs (
        id, actor_type, actor_id, action, resource_type,
        resource_id, idempotency_key, policy_decision, status,
        dry_run, input_json, output_json, error_json, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.actorType,
      run.actorId,
      run.action,
      run.resourceType,
      run.resourceId ?? null,
      run.idempotencyKey ?? null,
      run.policyDecision,
      run.status,
      run.dryRun ? 1 : 0,
      run.input ? JSON.stringify(run.input) : null,
      run.output ? JSON.stringify(run.output) : null,
      run.error ? JSON.stringify(run.error) : null,
      now,
      run.completedAt ? new Date(run.completedAt).toISOString() : null
    );

    return (await this.getActionRunById(run.id))!;
  }

  async getActionRunById(id: string): Promise<ActionRun | null> {
    const row = this.db.prepare('SELECT * FROM action_runs WHERE id = ?').get(id) as any;
    return row ? this.mapActionRun(row) : null;
  }

  async updateActionRun(id: string, updates: Partial<ActionRun>): Promise<ActionRun> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);
    }
    if (updates.output !== undefined) {
      sets.push('output_json = ?');
      values.push(updates.output ? JSON.stringify(updates.output) : null);
    }
    if (updates.error !== undefined) {
      sets.push('error_json = ?');
      values.push(updates.error ? JSON.stringify(updates.error) : null);
    }
    if (updates.completedAt !== undefined) {
      sets.push('completed_at = ?');
      values.push(updates.completedAt ? new Date(updates.completedAt).toISOString() : null);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE action_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }

    return (await this.getActionRunById(id))!;
  }

  async listActionRuns(filter?: { agentId?: string; status?: string; limit?: number }): Promise<ActionRun[]> {
    const where: string[] = [];
    const params: any[] = [];

    if (filter?.agentId) {
      where.push('actor_id = ?');
      params.push(filter.agentId);
    }
    if (filter?.status) {
      where.push('status = ?');
      params.push(filter.status);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;

    const rows = this.db.prepare(`
      SELECT * FROM action_runs ${whereClause}
      ORDER BY started_at DESC LIMIT ?
    `).all(...params, limit) as any[];

    return rows.map((r) => this.mapActionRun(r));
  }

  async createApprovalRequest(req: Omit<ApprovalRequest, 'requestedAt'>): Promise<ApprovalRequest> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO approval_requests (
        id, action_run_id, requested_by, requested_at,
        expires_at, decision, decided_by, decided_at, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.id,
      req.actionRunId,
      req.requestedBy,
      now,
      new Date(req.expiresAt).toISOString(),
      req.decision ?? null,
      req.decidedBy ?? null,
      req.decidedAt ? new Date(req.decidedAt).toISOString() : null,
      req.reason ?? null
    );

    const row = this.db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.id) as any;
    return this.mapApproval(row);
  }

  async getApprovalRequestByActionRunId(actionRunId: string): Promise<ApprovalRequest | null> {
    const row = this.db.prepare('SELECT * FROM approval_requests WHERE action_run_id = ?').get(actionRunId) as any;
    return row ? this.mapApproval(row) : null;
  }

  async updateApprovalRequest(id: string, updates: Partial<ApprovalRequest>): Promise<ApprovalRequest> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.decision !== undefined) {
      sets.push('decision = ?');
      values.push(updates.decision);
    }
    if (updates.decidedBy !== undefined) {
      sets.push('decided_by = ?');
      values.push(updates.decidedBy);
    }
    if (updates.decidedAt !== undefined) {
      sets.push('decided_at = ?');
      values.push(updates.decidedAt ? new Date(updates.decidedAt).toISOString() : null);
    }
    if (updates.reason !== undefined) {
      sets.push('reason = ?');
      values.push(updates.reason);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE approval_requests SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }

    const row = this.db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id) as any;
    return this.mapApproval(row);
  }

  private mapActionRun(row: any): ActionRun {
    return {
      id: row.id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      idempotencyKey: row.idempotency_key,
      policyDecision: row.policy_decision,
      status: row.status,
      dryRun: Boolean(row.dry_run),
      input: row.input_json ? JSON.parse(row.input_json) : null,
      output: row.output_json ? JSON.parse(row.output_json) : null,
      error: row.error_json ? JSON.parse(row.error_json) : null,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }

  private mapApproval(row: any): ApprovalRequest {
    return {
      id: row.id,
      actionRunId: row.action_run_id,
      requestedBy: row.requested_by,
      requestedAt: new Date(row.requested_at),
      expiresAt: new Date(row.expires_at),
      decision: row.decision,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at ? new Date(row.decided_at) : null,
      reason: row.reason,
    };
  }
}
