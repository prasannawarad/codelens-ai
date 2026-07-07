import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

const STAGES = ['Queued', 'Static metrics', 'AI analysis', 'Scoring'];

// Polls GET /api/audits/:id every 2s. The API exposes queued/running/
// completed/failed; within "running" the stage indicator advances on elapsed
// time as an approximation.
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
        if (data.status === 'completed') return onCompleted?.(data);
        if (data.status === 'failed') return onFailed?.(data);
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

  let activeStage = 0;
  if (audit?.status === 'running') {
    if (!startedRunning.current) startedRunning.current = Date.now();
    const elapsed = (Date.now() - startedRunning.current) / 1000;
    activeStage = Math.min(STAGES.length - 1, 1 + Math.floor(elapsed / 4));
  } else if (audit?.status === 'completed') {
    activeStage = STAGES.length;
  }

  const failed = audit?.status === 'failed';

  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-center gap-3">
        {!failed && <span className="pulse-dot h-2 w-2 rounded-full bg-volt-400" />}
        <span className="text-sm font-medium text-snow">
          {failed ? 'Audit failed' : 'Auditing'}
        </span>
        {audit?.incremental && !failed && (
          <span className="font-mono text-[11px] text-fog">
            incremental — {audit.analyzedFileCount || '…'} changed file(s)
          </span>
        )}
      </div>
      {failed ? (
        <p className="mt-2 font-mono text-xs text-red-400">{audit.errorMessage}</p>
      ) : (
        <ol className="mt-3 flex items-center gap-2">
          {STAGES.map((stage, i) => (
            <li key={stage} className="flex flex-1 flex-col gap-1.5">
              <span
                className={`h-1 rounded-full transition-colors duration-500 ${
                  i < activeStage
                    ? 'bg-volt-400'
                    : i === activeStage
                      ? 'bg-volt-400/50'
                      : 'bg-edge'
                }`}
              />
              <span
                className={`font-mono text-[10px] uppercase tracking-wider ${
                  i <= activeStage ? 'text-mist' : 'text-fog/60'
                }`}
              >
                {stage}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
