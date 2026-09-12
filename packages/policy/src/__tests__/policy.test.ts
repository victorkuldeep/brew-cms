import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../engine.js';
import type { Actor } from '@brew-cms/core';

describe('PolicyEngine — RBAC and Bounded Agent Autonomy', () => {
  const engine = new PolicyEngine({ requireApprovalForAgentPublish: true });

  const adminActor: Actor = {
    id: 'user_admin',
    type: 'human',
    role: 'Admin',
  };

  const authorActor: Actor = {
    id: 'user_author',
    type: 'human',
    role: 'Author',
  };

  const agentActor: Actor = {
    id: 'agent_editorial',
    type: 'agent',
    scopes: ['content:create', 'content:update', 'content:publish', 'content:read'],
  };

  it('allows human Admin unrestricted access', async () => {
    const res = await engine.evaluate({
      actor: adminActor,
      action: 'content:publish',
      resourceType: 'document',
    });
    expect(res.decision).toBe('ALLOW');
  });

  it('requires approval when human Author attempts to publish directly', async () => {
    const res = await engine.evaluate({
      actor: authorActor,
      action: 'content:publish',
      resourceType: 'document',
    });
    expect(res.decision).toBe('REQUIRE_APPROVAL');
  });

  it('allows agent to create and update content if in scope', async () => {
    const res = await engine.evaluate({
      actor: agentActor,
      action: 'content:create',
      resourceType: 'document',
    });
    expect(res.decision).toBe('ALLOW');
  });

  it('requires human approval when agent attempts to publish content even with scope', async () => {
    const res = await engine.evaluate({
      actor: agentActor,
      action: 'content:publish',
      resourceType: 'document',
    });
    expect(res.decision).toBe('REQUIRE_APPROVAL');
    expect(res.reason).toContain('requires human editorial approval');
  });

  it('strictly denies agent attempts to manage credentials or users', async () => {
    const res = await engine.evaluate({
      actor: agentActor,
      action: 'credentials:manage',
      resourceType: 'security',
    });
    expect(res.decision).toBe('DENY');
    expect(res.reason).toContain('strictly prohibited');
  });

  it('denies agent if required scope is missing', async () => {
    const res = await engine.evaluate({
      actor: agentActor,
      action: 'media:delete',
      resourceType: 'media',
    });
    expect(res.decision).toBe('DENY');
    expect(res.reason).toContain('lacks required scope');
  });
});
