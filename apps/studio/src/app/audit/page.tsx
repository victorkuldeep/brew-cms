import React from 'react';
import { cms } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const events = await cms.auditService.listEvents({ limit: 100 });

  return (
    <div className="flex-1 p-8 bg-canvas overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink tracking-tight">Audit Trail</h1>
            <p className="text-xs text-muted mt-1">
              Append-only, cryptographically verifiable record of all human editorial decisions and agent operations.
            </p>
          </div>
          <div className="text-xs font-semibold px-3 py-1.5 rounded bg-surface border border-line text-ink">
            {events.length} Recorded Events
          </div>
        </div>

        {/* Events Table */}
        <div className="bg-surface rounded-lg border border-line divide-y divide-line overflow-hidden shadow-sm">
          {events.length === 0 ? (
            <div className="p-8 text-xs text-muted text-center">No audit events found.</div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="p-4 hover:bg-surface-strong/20 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-ink bg-canvas px-2 py-0.5 rounded border border-line">
                      {event.eventType}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        event.actorType === 'agent'
                          ? 'bg-purple-100 text-purple-900 border border-purple-200'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      }`}
                    >
                      {event.actorType.toUpperCase()} &bull; {event.actorId}
                    </span>
                  </div>

                  <div className="text-muted text-[11px] font-mono">
                    Resource: <span className="text-ink font-semibold">{event.resourceType}</span>
                    {event.resourceId && <span> &bull; ID: {event.resourceId}</span>}
                  </div>

                  {(event.before || event.after || event.metadata) && (
                    <div className="text-[11px] text-muted">
                      {event.after ? (
                        <span>State: {JSON.stringify(event.after)}</span>
                      ) : event.metadata ? (
                        <span>Meta: {JSON.stringify(event.metadata)}</span>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="text-muted font-mono text-[11px]">
                    {new Date(event.createdAt).toLocaleString()}
                  </div>
                  <div className="text-[10px] font-mono text-muted/60 mt-0.5">{event.id}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
