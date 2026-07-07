import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { apiError } from '../api/client';
import ScoreGauge from '../components/ScoreGauge';
import MetricsPanel from '../components/MetricsPanel';
import IssueCard from '../components/IssueCard';
import AuditProgress from '../components/AuditProgress';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/Toaster';
import { SEVERITY_ORDER, timeAgo } from '../lib/score';

const CATEGORIES = ['bug', 'security', 'performance', 'style', 'debt'];

function Delta({ label, value }) {
  if (value == null) return null;
  const color = value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-fog';
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-xs text-fog">{label}</span>
      <span className={`font-mono text-sm font-semibold ${color}`}>
        {value > 0 ? `+${value}` : value}
      </span>
    </span>
  );
}

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditReport() {
  const { auditId } = useParams();
  const toast = useToast();
  const [audit, setAudit] = useState(null);
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [fileFilter, setFileFilter] = useState(null);

  const loadAudit = () =>
    api
      .get(`/api/audits/${auditId}`)
      .then(({ data }) => setAudit(data))
      .catch((err) => setError(apiError(err, 'Failed to load audit')));

  useEffect(() => {
    loadAudit();
  }, [auditId]);

  useEffect(() => {
    if (audit?.status === 'completed') {
      api
        .get(`/api/audits/${auditId}/diff`)
        .then(({ data }) => setDiff(data))
        .catch(() => {}); // diff is additive — never block the report on it
    }
  }, [auditId, audit?.status]);

  const exportMarkdown = async () => {
    try {
      const { data } = await api.get(`/api/audits/${auditId}/markdown`, { responseType: 'text' });
      downloadFile(`codelens-audit-${auditId.slice(0, 8)}.md`, data, 'text/markdown');
    } catch (err) {
      toast(apiError(err, 'Export failed'), 'error');
    }
  };

  const exportJson = () => {
    downloadFile(
      `codelens-audit-${auditId.slice(0, 8)}.json`,
      JSON.stringify(audit, null, 2),
      'application/json'
    );
  };

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

  if (error) return <p className="alert-error">{error}</p>;
  if (!audit) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr]">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  // Audit still in flight (e.g. opened by direct link) — show live progress
  // instead of empty gauges, then swap to the report when it lands.
  if (audit.status === 'queued' || audit.status === 'running') {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="font-display mb-4 text-xl font-semibold tracking-tight text-snow">
          Audit in progress
        </h1>
        <AuditProgress auditId={auditId} onCompleted={setAudit} onFailed={setAudit} />
      </div>
    );
  }

  if (audit.status === 'failed') {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-red-500/25 bg-red-500/10 p-6">
        <h1 className="font-display mb-2 text-lg font-semibold text-red-400">Audit failed</h1>
        <p className="font-mono text-sm leading-relaxed text-red-300">{audit.errorMessage}</p>
        <Link to={`/projects/${audit.projectId}`} className="btn-ghost mt-5">
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

  const subScores = [
    ['Security', audit.securityScore],
    ['Performance', audit.performanceScore],
    ['Maintainability', audit.maintainabilityScore],
    ['Debt', audit.debtScore],
    ['Complexity', audit.complexityScore],
  ];

  return (
    <div>
      <div className="rise mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-snow">
            Audit report
          </h1>
          <p className="mt-0.5 text-sm text-fog">
            <Link
              to={`/projects/${audit.projectId}`}
              className="font-medium text-volt-400 hover:text-volt-300"
            >
              {audit.projectName}
            </Link>
            {' · '}
            {timeAgo(audit.completedAt || audit.createdAt)}
            {audit.trigger === 'ci' && ' · triggered by CI'}
          </p>
        </div>
        {audit.incremental && (
          <span className="rounded-md border border-volt-500/30 bg-volt-500/10 px-2.5 py-1 font-mono text-[11px] text-volt-300">
            incremental — {audit.analyzedFileCount} analyzed, {audit.reusedFileCount} reused
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportMarkdown} className="btn-ghost" title="Download the PR-comment markdown">
            Export .md
          </button>
          <button onClick={exportJson} className="btn-ghost" title="Download the full audit as JSON">
            Export .json
          </button>
          <Link to={`/projects/${audit.projectId}/timeline`} className="btn-ghost">
            Timeline
          </Link>
        </div>
      </div>

      {diff && (
        <div
          className="rise panel mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
          style={{ animationDelay: '30ms' }}
        >
          <span className="microlabel">vs previous audit</span>
          <Delta label="overall" value={diff.scoreDeltas.overallScore} />
          <Delta label="security" value={diff.scoreDeltas.securityScore} />
          <Delta label="performance" value={diff.scoreDeltas.performanceScore} />
          <Delta label="maintainability" value={diff.scoreDeltas.maintainabilityScore} />
          <Delta label="debt" value={diff.scoreDeltas.debtScore} />
          <span className="ml-auto font-mono text-xs">
            <span className={diff.newCount > 0 ? 'text-red-400' : 'text-fog'}>
              {diff.newCount} new
            </span>
            <span className="text-fog"> · </span>
            <span className={diff.fixedCount > 0 ? 'text-emerald-400' : 'text-fog'}>
              {diff.fixedCount} fixed
            </span>
          </span>
        </div>
      )}

      <div className="rise mb-6 grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr]" style={{ animationDelay: '60ms' }}>
        <div className="panel flex flex-col items-center justify-center gap-1 p-6">
          <ScoreGauge score={audit.overallScore} size={168} strokeWidth={11} showBand />
          <span className="microlabel mt-2">Overall score</span>
        </div>
        <div className="panel flex flex-col p-6">
          <div className="flex flex-wrap items-start justify-around gap-x-4 gap-y-6">
            {subScores.map(([label, score]) => (
              <ScoreGauge key={label} score={score} label={label} size={88} strokeWidth={6} />
            ))}
          </div>
          {audit.summary && (
            <p className="mt-auto border-t border-edge pt-4 text-sm leading-relaxed text-mist">
              {audit.summary}
            </p>
          )}
        </div>
      </div>

      <div className="rise mb-6" style={{ animationDelay: '120ms' }}>
        <MetricsPanel staticMetrics={audit.staticMetrics} />
      </div>

      <div className="rise mb-4 flex flex-wrap items-center gap-2" style={{ animationDelay: '160ms' }}>
        <h2 className="font-display text-lg font-semibold tracking-tight text-snow">
          Issues <span className="font-mono text-sm font-normal text-fog">({audit.totalIssues})</span>
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                categoryFilter === cat
                  ? 'border-volt-500/40 bg-volt-500/10 text-volt-300'
                  : 'border-edge text-fog hover:text-mist'
              }`}
            >
              {cat}
            </button>
          ))}
          {files.length > 0 && (
            <select
              value={fileFilter || ''}
              onChange={(e) => setFileFilter(e.target.value || null)}
              className="rounded-md border border-edge bg-ink-900 px-2 py-0.5 font-mono text-[11px] text-mist"
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
        <p className="panel p-8 text-center text-sm text-fog">
          {audit.totalIssues === 0 ? 'No issues found. Clean audit.' : 'No issues match the filters.'}
        </p>
      )}

      <div className="space-y-6">
        {bySeverity.map(([sev, list]) => (
          <div key={sev}>
            <h3 className="microlabel mb-2">
              {sev} · {list.length}
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
