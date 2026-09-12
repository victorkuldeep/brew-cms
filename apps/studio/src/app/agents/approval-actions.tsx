'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function ApprovalActions({ runId }: { runId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleDecision = (decision: 'approve' | 'reject') => {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/agent/runs/${runId}/${decision}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: `Decided via Editorial Studio` }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error?.message || `Failed to ${decision} run`);
        }

        router.refresh();
      } catch (err: any) {
        setMessage(err.message);
      }
    });
  };

  return (
    <div className="flex items-center space-x-2">
      {message && <span className="text-[10px] text-red-600 mr-2">{message}</span>}
      <button
        onClick={() => handleDecision('approve')}
        disabled={isPending}
        className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-700 text-surface hover:bg-emerald-800 transition-colors disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => handleDecision('reject')}
        disabled={isPending}
        className="px-2.5 py-1 text-xs font-medium rounded border border-red-300 text-red-800 hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
