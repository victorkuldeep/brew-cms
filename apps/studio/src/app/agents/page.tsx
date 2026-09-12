import React from 'react';
import { cms } from '@/lib/cms';
import { ApprovalActions } from './approval-actions';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const agents = await cms.agentService.listAgents();
  const runs = await cms.agentRepo.listActionRuns({ limit: 50 });

  const pendingRuns = runs.filter((r) => r.status === 'pending');
  const pastRuns = runs.filter((r) => r.status !== 'pending');

  return (
    <div className="flex-1 p-8 bg-canvas overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Agent Control Plane</h1>
          <p className="text-xs text-muted mt-1">
            Bounded autonomy, scoped credentials, and human governance gates for autonomous AI agents.
          </p>
        </div>

        {/* Pending Approvals Gate */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink flex items-center">
              Pending Human Approval Queue
              {pendingRuns.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-900 rounded-full border border-amber-300">
                  {pendingRuns.length} Action{pendingRuns.length > 1 ? 's' : ''} Require Approval
                </span>
              )}
            </h2>
          </div>

          {pendingRuns.length === 0 ? (
            <div className="bg-surface rounded-lg border border-line p-6 text-center text-xs text-muted">
              No pending agent actions requiring human approval. All autonomous operations are governed.
            </div>
          ) : (
            <div className="bg-surface rounded-lg border border-line divide-y divide-line">
              {pendingRuns.map((run) => (
                <div key={run.id} className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-xs text-ink">{run.action}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        {run.policyDecision}
                      </span>
                      <span className="text-[11px] text-muted">by {run.actorId}</span>
                    </div>
                    <div className="text-[11px] font-mono text-muted">
                      Resource: {run.resourceType} &bull; ID: {run.resourceId || 'N/A'}
                    </div>
                    {run.input ? (
                      <pre className="text-[10px] font-mono bg-canvas p-2 rounded border border-line mt-2 text-ink max-w-xl overflow-x-auto">
                        {JSON.stringify(run.input, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  <ApprovalActions runId={run.id} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Registered Agent Identities */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
            Registered Agent Identities ({agents.length})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-surface rounded-lg border border-line p-5 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-ink">{agent.name}</div>
                    <div className="font-mono text-xs text-muted mt-0.5">{agent.id}</div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      agent.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                    }`}
                  >
                    {agent.status}
                  </span>
                </div>

                {agent.description && (
                  <p className="text-xs text-ink-soft leading-relaxed">{agent.description}</p>
                )}

                <div className="pt-2 border-t border-line">
                  <div className="text-[11px] font-semibold text-muted mb-1.5 uppercase tracking-wider">
                    Assigned Scopes:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="px-2 py-0.5 text-[10px] font-mono rounded bg-canvas border border-line text-ink"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Past Action Runs */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
            Recent Agent Executions ({pastRuns.length})
          </h2>

          <div className="bg-surface rounded-lg border border-line divide-y divide-line">
            {pastRuns.length === 0 ? (
              <div className="p-4 text-xs text-muted text-center">No past executions recorded.</div>
            ) : (
              pastRuns.map((run) => (
                <div
                  key={run.id}
                  className="p-4 flex items-center justify-between text-xs hover:bg-surface-strong/20"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-ink">{run.action}</span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                          run.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : run.status === 'rejected'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-neutral-100 text-neutral-800 border-neutral-200'
                        }`}
                      >
                        {run.status}
                      </span>
                      <span className="text-[10px] font-mono text-muted">
                        Policy: {run.policyDecision}
                      </span>
                    </div>
                    <div className="text-muted text-[11px] font-mono">
                      Actor: {run.actorId} &bull; Started: {new Date(run.startedAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-muted">{run.id}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
