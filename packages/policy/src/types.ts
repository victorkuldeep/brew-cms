import type { Actor, PolicyDecision } from '@brew-cms/core';

export interface PolicyRuleContext {
  actor: Actor;
  action: string;
  resourceType: string;
  resourceId?: string;
  payload?: unknown;
  isDryRun?: boolean;
}

export interface PolicyResult {
  decision: PolicyDecision;
  reason?: string;
}

export interface PolicyConfig {
  agentAutoPublish?: boolean;
  requireApprovalForAgentPublish?: boolean;
  requireApprovalForAgentDelete?: boolean;
  allowedAgentScopes?: string[];
}
