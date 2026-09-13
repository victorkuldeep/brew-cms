import type {
  Actor,
  AgentIdentity,
  ActionRun,
  ApprovalRequest,
} from '../domain/types.js';
import {
  NotFoundError,
  PolicyDeniedError,
  ValidationError,
  ConflictError,
} from '../domain/errors.js';
import type {
  AgentRepository,
  AuditEventRepository,
} from '../ports/repositories.js';
import type { Clock, IdGenerator, PolicyEnginePort } from '../ports/services.js';

export interface ExecuteActionRunInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  input?: unknown;
  idempotencyKey?: string | null;
  dryRun?: boolean;
  executor: (input: unknown) => Promise<unknown>;
}

export class AgentService {
  constructor(
    private readonly agentRepo: AgentRepository,
    private readonly auditRepo: AuditEventRepository,
    private readonly policyEngine: PolicyEnginePort,
    private readonly clock: Clock,
    private readonly idGen: IdGenerator
  ) {}

  async registerAgent(
    actor: Actor,
    input: { id?: string; name: string; description?: string; scopes: string[] }
  ): Promise<AgentIdentity> {
    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'agent:manage',
      resourceType: 'agent',
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    const agentId = input.id ?? this.idGen.generate('agent');
    const existing = await this.agentRepo.findById(agentId);
    if (existing) {
      throw new ConflictError(`Agent with id '${agentId}' already exists.`);
    }

    const agent: AgentIdentity = {
      id: agentId,
      name: input.name,
      description: input.description ?? null,
      status: 'active',
      scopes: input.scopes,
      createdAt: this.clock.now(),
    };

    return this.agentRepo.create(agent);
  }

  async listAgents(): Promise<AgentIdentity[]> {
    return this.agentRepo.list();
  }

  /**
   * Lists agent action runs through the service boundary (read passthrough;
   * mutations stay policy-gated via executeActionRun/approve/reject).
   */
  async listActionRuns(filter?: {
    agentId?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: ActionRun[]; total: number; nextCursor?: string }> {
    return this.agentRepo.listActionRuns(filter);
  }

  async getAgent(id: string): Promise<AgentIdentity> {
    const agent = await this.agentRepo.findById(id);
    if (!agent) throw new NotFoundError('Agent', id);
    return agent;
  }

  async executeActionRun(actor: Actor, input: ExecuteActionRunInput): Promise<ActionRun> {
    // 1. Check idempotency if key provided
    if (input.idempotencyKey) {
      const existingRuns = await this.agentRepo.listActionRuns({ limit: 100 });
      const matched = existingRuns.items.find(
        (r) => r.idempotencyKey === input.idempotencyKey && r.actorId === actor.id
      );
      if (matched) {
        return matched;
      }
    }

    const runId = this.idGen.generate('run');
    const now = this.clock.now();

    // 2. Policy evaluation
    const policyResult = await this.policyEngine.evaluate({
      actor,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? undefined,
      payload: input.input,
      isDryRun: input.dryRun,
    });

    if (policyResult.decision === 'DENY') {
      const failedRun: ActionRun = {
        id: runId,
        actorType: actor.type,
        actorId: actor.id,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        policyDecision: 'DENY',
        status: 'rejected',
        dryRun: Boolean(input.dryRun),
        input: input.input ?? null,
        output: null,
        error: { message: policyResult.reason || 'Action denied by policy.' },
        startedAt: now,
        completedAt: this.clock.now(),
      };
      await this.agentRepo.createActionRun(failedRun);
      throw new PolicyDeniedError('DENY', policyResult.reason);
    }

    if (policyResult.decision === 'REQUIRE_APPROVAL') {
      const pendingRun: ActionRun = {
        id: runId,
        actorType: actor.type,
        actorId: actor.id,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        policyDecision: 'REQUIRE_APPROVAL',
        status: 'pending',
        dryRun: Boolean(input.dryRun),
        input: input.input ?? null,
        output: null,
        error: null,
        startedAt: now,
        completedAt: null,
      };

      const savedRun = await this.agentRepo.createActionRun(pendingRun);

      // Create human approval request
      await this.agentRepo.createApprovalRequest({
        id: this.idGen.generate('appr'),
        actionRunId: runId,
        requestedBy: actor.id,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours expiry
        decision: null,
        decidedBy: null,
        decidedAt: null,
        reason: policyResult.reason,
      });

      return savedRun;
    }

    // ALLOW decision
    if (input.dryRun) {
      const dryRunRecord: ActionRun = {
        id: runId,
        actorType: actor.type,
        actorId: actor.id,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        policyDecision: 'ALLOW',
        status: 'completed',
        dryRun: true,
        input: input.input ?? null,
        output: { dryRunResult: 'Validation successful. Action would be executed.' },
        error: null,
        startedAt: now,
        completedAt: this.clock.now(),
      };
      return this.agentRepo.createActionRun(dryRunRecord);
    }

    // Execute actual mutation
    try {
      const output = await input.executor(input.input);
      const completedRun: ActionRun = {
        id: runId,
        actorType: actor.type,
        actorId: actor.id,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        policyDecision: 'ALLOW',
        status: 'completed',
        dryRun: false,
        input: input.input ?? null,
        output,
        error: null,
        startedAt: now,
        completedAt: this.clock.now(),
      };

      const saved = await this.agentRepo.createActionRun(completedRun);

      await this.auditRepo.create({
        id: this.idGen.generate('aud'),
        eventType: 'agent.action_run_completed',
        actorType: actor.type,
        actorId: actor.id,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? runId,
        metadata: { runId, action: input.action },
      });

      return saved;
    } catch (err: any) {
      const errorRun: ActionRun = {
        id: runId,
        actorType: actor.type,
        actorId: actor.id,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        policyDecision: 'ALLOW',
        status: 'failed',
        dryRun: false,
        input: input.input ?? null,
        output: null,
        error: { message: err.message ?? 'Unknown error' },
        startedAt: now,
        completedAt: this.clock.now(),
      };
      return this.agentRepo.createActionRun(errorRun);
    }
  }

  async approveActionRun(
    actor: Actor,
    actionRunId: string,
    reason?: string
  ): Promise<{ actionRun: ActionRun; approval: ApprovalRequest }> {
    const run = await this.agentRepo.getActionRunById(actionRunId);
    if (!run) throw new NotFoundError('ActionRun', actionRunId);

    if (run.status !== 'pending') {
      throw new ValidationError(`Action run is not in pending state (current state: '${run.status}').`);
    }

    const policy = await this.policyEngine.evaluate({
      actor,
      action: 'agent:approve',
      resourceType: 'action_run',
      resourceId: actionRunId,
    });
    if (policy.decision !== 'ALLOW') {
      throw new PolicyDeniedError(policy.decision, policy.reason);
    }

    const approval = await this.agentRepo.getApprovalRequestByActionRunId(actionRunId);
    if (!approval) throw new NotFoundError('ApprovalRequest for ActionRun', actionRunId);

    const now = this.clock.now();
    const updatedApproval = await this.agentRepo.updateApprovalRequest(approval.id, {
      decision: 'approved',
      decidedBy: actor.id,
      decidedAt: now,
      reason,
    });

    const updatedRun = await this.agentRepo.updateActionRun(actionRunId, {
      status: 'completed',
      completedAt: now,
    });

    await this.auditRepo.create({
      id: this.idGen.generate('aud'),
      eventType: 'agent.action_run_approved',
      actorType: actor.type,
      actorId: actor.id,
      resourceType: 'action_run',
      resourceId: actionRunId,
      metadata: { reason },
    });

    return { actionRun: updatedRun, approval: updatedApproval };
  }

  async rejectActionRun(
    actor: Actor,
    actionRunId: string,
    reason?: string
  ): Promise<{ actionRun: ActionRun; approval: ApprovalRequest }> {
    const run = await this.agentRepo.getActionRunById(actionRunId);
    if (!run) throw new NotFoundError('ActionRun', actionRunId);

    const approval = await this.agentRepo.getApprovalRequestByActionRunId(actionRunId);
    if (!approval) throw new NotFoundError('ApprovalRequest for ActionRun', actionRunId);

    const now = this.clock.now();
    const updatedApproval = await this.agentRepo.updateApprovalRequest(approval.id, {
      decision: 'rejected',
      decidedBy: actor.id,
      decidedAt: now,
      reason,
    });

    const updatedRun = await this.agentRepo.updateActionRun(actionRunId, {
      status: 'rejected',
      completedAt: now,
      error: { message: reason || 'Rejected by reviewer.' },
    });

    return { actionRun: updatedRun, approval: updatedApproval };
  }
}
