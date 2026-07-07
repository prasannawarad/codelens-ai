import { SEVERITY_STYLES } from '../lib/score';

export default function IssueCard({ issue, onResolve }) {
  return (
    <div
      className={`rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 ${
        issue.resolved ? 'opacity-50' : ''
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase ${
            SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.low
          }`}
        >
          {issue.severity}
        </span>
        <span className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
          {issue.category}
        </span>
        {issue.file && (
          <span className="truncate font-mono text-[11px] text-zinc-500">
            {issue.file.filename}
            {issue.lineNumber ? `:${issue.lineNumber}` : ''}
          </span>
        )}
      </div>
      <p className={`text-sm font-medium text-zinc-200 ${issue.resolved ? 'line-through' : ''}`}>
        {issue.title}
      </p>
      {issue.description && (
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{issue.description}</p>
      )}
      {issue.suggestion && (
        <p className="mt-2 rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs leading-relaxed text-zinc-400">
          {issue.suggestion}
        </p>
      )}
      {onResolve && (
        <button
          onClick={() => onResolve(issue)}
          className="mt-2 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        >
          {issue.resolved ? 'Reopen' : 'Mark resolved'}
        </button>
      )}
    </div>
  );
}
