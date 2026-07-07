import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { apiError } from '../api/client';
import ScoreGauge from '../components/ScoreGauge';
import MetricsPanel from '../components/MetricsPanel';
import IssueCard from '../components/IssueCard';
import { SEVERITY_ORDER, timeAgo } from '../lib/score';

const CATEGORIES = ['bug', 'security', 'performance', 'style', 'debt'];

export default function AuditReport() {
  const { auditId } = useParams();
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [fileFilter, setFileFilter] = useState(null);

  useEffect(() => {
    api
      .get(`/api/audits/${auditId}`)
      .then(({ data }) => setAudit(data))
      .catch((err) => setError(apiError(err, 'Failed to load audit')));
  }, [auditId]);

  const files = useMemo(() => {
    const names = new Set((audit?.issues || []).map((i) => i.file?.filename).filter(Boolean));
    return [...names].sort();
  }, [audit]);

  const toggleResolve = async (issue) => {
    try {
      const { data } = await api.patch(`/api/issues/${issue.id}/resolve`);
      setAudit((a) => ({
        ...a,
        issues: a.issues.map((i) => (i.id === issue.id ? { ...i, resolved: data.resolved } : i)),
      }));
    } catch (err) {
      setError(apiError(err, 'Failed to update issue'));
    }
  };

  if (error) {
    return <p className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</p>;
  }
  if (!audit) return <p className="text-sm text-zinc-500">Loading…</p>;

  if (audit.status === 'failed') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6">
        <h1 className="mb-2 text-lg font-semibold text-red-400">Audit failed</h1>
        <p className="font-mono text-sm text-red-300">{audit.errorMessage}</p>
        <Link to={`/projects/${audit.projectId}`} className="mt-4 inline-block text-sm text-indigo-400">
          Back to project
        </Link>
      </div>
    );
  }

  const visibleIssues = (audit.issues || []).filter((i) => {
    if (categoryFilter && i.category !== categoryFilter) return false;
    if (fileFilter && i.file?.filename !== fileFilter) return false;
    return true;
  });
  const bySeverity = SEVERITY_ORDER.map((sev) => [
    sev,
    visibleIssues.filter((i) => i.severity === sev),
  ]).filter(([, list]) => list.length > 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Audit report</h1>
          <p className="text-sm text-zinc-500">
            <Link to={`/projects/${audit.projectId}`} className="text-indigo-400 hover:text-indigo-300">
              {audit.projectName}
            </Link>
            {' · '}
            {timeAgo(audit.completedAt || audit.createdAt)}
            {audit.trigger === 'ci' && ' · triggered by CI'}
          </p>
        </div>
        {audit.incremental && (
          <span className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-300">
            Incremental audit — {audit.analyzedFileCount} analyzed, {audit.reusedFileCount} reused
          </span>
        )}
        <Link
          to={`/projects/${audit.projectId}/timeline`}
          className="ml-auto rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600"
        >
          Timeline
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <ScoreGauge score={audit.overallScore} label="Overall" size={150} strokeWidth={10} />
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="mb-4 flex flex-wrap justify-around gap-4">
            <ScoreGauge score={audit.securityScore} label="Security" size={84} strokeWidth={6} />
            <ScoreGauge score={audit.performanceScore} label="Performance" size={84} strokeWidth={6} />
            <ScoreGauge score={audit.maintainabilityScore} label="Maintainability" size={84} strokeWidth={6} />
            <ScoreGauge score={audit.debtScore} label="Debt" size={84} strokeWidth={6} />
            <ScoreGauge score={audit.complexityScore} label="Complexity" size={84} strokeWidth={6} />
          </div>
          {audit.summary && (
            <p className="border-t border-zinc-800 pt-4 text-sm leading-relaxed text-zinc-400">
              {audit.summary}
            </p>
          )}
        </div>
      </div>

      <div className="mb-5">
        <MetricsPanel staticMetrics={audit.staticMetrics} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
          Issues <span className="font-mono text-sm text-zinc-500">({audit.totalIssues})</span>
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                categoryFilter === cat
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {cat}
            </button>
          ))}
          {files.length > 0 && (
            <select
              value={fileFilter || ''}
              onChange={(e) => setFileFilter(e.target.value || null)}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400"
            >
              <option value="">all files</option>
              {files.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {visibleIssues.length === 0 && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center text-sm text-zinc-500">
          {audit.totalIssues === 0 ? 'No issues found. Clean audit.' : 'No issues match the filters.'}
        </p>
      )}

      <div className="space-y-5">
        {bySeverity.map(([sev, list]) => (
          <div key={sev}>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-zinc-500">
              {sev} ({list.length})
            </h3>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {list.map((issue) => (
                <IssueCard key={issue.id} issue={issue} onResolve={toggleResolve} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
