import type { PolicyEnginePort, PolicyEvaluationContext } from '@brew-cms/core';
import type { PolicyConfig, PolicyResult } from './types.js';

const FORBIDDEN_AGENT_ACTIONS = new Set([
  'user:manage',
  'user:create',
  'user:delete',
  'role:manage',
  'credentials:manage',
  'security:manage',
  'policy:manage',
]);

const HIGH_CONSEQUENCE_AGENT_ACTIONS = new Set([
  'content:publish',
  'content:unpublish',
  'content:delete',
  'media:delete',
]);

export class PolicyEngine implements PolicyEnginePort {
  constructor(private readonly config: PolicyConfig = {}) {}

  async evaluate(context: PolicyEvaluationContext): Promise<PolicyResult> {
    const { actor, action } = context;

    if (!actor || !actor.id) {
      return { decision: 'DENY', reason: 'Unauthenticated actor.' };
    }

    // 1. System actor always allowed
    if (actor.type === 'system') {
      return { decision: 'ALLOW' };
    }

    // 2. Human role-based access
    if (actor.type === 'human') {
      return this.evaluateHumanActor(context);
    }

    // 3. Agent bounded autonomy
    if (actor.type === 'agent') {
      return this.evaluateAgentActor(context);
    }

    // 4. Service account
    if (actor.type === 'service') {
      if (actor.scopes && actor.scopes.includes(action)) {
        return { decision: 'ALLOW' };
      }
      return { decision: 'DENY', reason: `Service account lacks scope '${action}'.` };
    }

    return { decision: 'DENY', reason: 'Unrecognized actor type.' };
  }

  private evaluateHumanActor(context: PolicyEvaluationContext): PolicyResult {
    const { actor, action } = context;
    const role = (actor.role || '').toLowerCase();

    // Owner and Admin have unrestricted access
    if (role === 'owner' || role === 'admin') {
      return { decision: 'ALLOW' };
    }

    // Editor
    if (role === 'editor') {
      if (action.startsWith('user:manage') || action.startsWith('security:')) {
        return { decision: 'DENY', reason: 'Editors cannot manage users or security settings.' };
      }
      return { decision: 'ALLOW' };
    }

    // Author
    if (role === 'author') {
      if (action === 'content:publish' || action === 'content:approve') {
        return {
          decision: 'REQUIRE_APPROVAL',
          reason: 'Authors require editorial review and approval to publish.',
        };
      }
      if (action.startsWith('content:create') || action.startsWith('content:update') || action === 'content:review') {
        return { decision: 'ALLOW' };
      }
      return { decision: 'DENY', reason: `Author role lacks permission for '${action}'.` };
    }

    // Viewer
    if (role === 'viewer') {
      if (action.endsWith(':read') || action === 'content:search') {
        return { decision: 'ALLOW' };
      }
      return { decision: 'DENY', reason: 'Viewers only have read access.' };
    }

    // Check scopes if explicitly defined
    if (actor.scopes && actor.scopes.includes(action)) {
      return { decision: 'ALLOW' };
    }

    return { decision: 'DENY', reason: `Role '${actor.role}' lacks permission for '${action}'.` };
  }

  private evaluateAgentActor(context: PolicyEvaluationContext): PolicyResult {
    const { actor, action } = context;

    // A. Strictly forbidden security actions
    if (FORBIDDEN_AGENT_ACTIONS.has(action)) {
      return {
        decision: 'DENY',
        reason: `Agents are strictly prohibited from performing '${action}'.`,
      };
    }

    // B. Check agent scopes
    const scopes = actor.scopes || [];
    const hasScope = scopes.includes(action) || scopes.includes('*');
    if (!hasScope) {
      return {
        decision: 'DENY',
        reason: `Agent '${actor.id}' lacks required scope '${action}'.`,
      };
    }

    // C. Consequential operations require human approval
    const requireApproval =
      this.config.requireApprovalForAgentPublish !== false &&
      HIGH_CONSEQUENCE_AGENT_ACTIONS.has(action);

    if (requireApproval) {
      return {
        decision: 'REQUIRE_APPROVAL',
        reason: `Agent action '${action}' requires human editorial approval.`,
      };
    }

    // D. Standard drafting, reading, classifying, validating
    return { decision: 'ALLOW' };
  }
}
