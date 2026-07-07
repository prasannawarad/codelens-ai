import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

// Stage messages shown while the worker runs (the API only exposes
// queued/running/completed/failed, so running stages advance on elapsed time).
const RUNNING_STAGES = [
  'Computing static metrics…',
  'AI analysis on changed files…',
  'Scoring…',
];

export default function AuditProgress({ auditId, onCompleted, onFailed }) {
  const [audit, setAudit] = useState(null);
  const startedRunning = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get(`/api/audits/${auditId}`);
        if (cancelled) return;
        setAudit(data);
        if (data.status === 'completed') {
          onCompleted?.(data);
          return;
        }
        if (data.status === 'failed') {
          onFailed?.(data);
          return;
        }
        setTimeout(poll, 2000);
      } catch {
        if (!cancelled) setTimeout(poll, 2000);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  let message = 'Queued…';
  if (audit?.status === 'running') {
    if (!startedRunning.current) startedRunning.current = Date.now();
    const elapsed = (Date.now() - startedRunning.current) / 1000;
    const stage = Math.min(RUNNING_STAGES.length - 1, Math.floor(elapsed / 4));
    message =
      stage === 1 && audit.incremental
        ? `AI analysis on ${audit.analyzedFileCount || 'changed'} changed files…`
        : RUNNING_STAGES[stage];
  } else if (audit?.status === 'failed') {
    message = 'Audit failed';
  } else if (audit?.status === 'completed') {
    message = 'Completed';
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      {audit?.status !== 'failed' && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
      )}
      <span className="text-sm text-zinc-300">{message}</span>
      {audit?.status === 'failed' && (
        <span className="truncate font-mono text-xs text-red-400">{audit.errorMessage}</span>
      )}
    </div>
  );
}
