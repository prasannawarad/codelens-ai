import { SEVERITY_STYLES } from '../lib/score';

export default function IssueCard({ issue, onResolve }) {
  return (
    <div className={`panel p-3.5 transition-opacity ${issue.resolved ? 'opacity-45' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wide ${
            SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.low
          }`}
        >
          {issue.severity}
        </span>
        <span className="rounded border border-edge px-1.5 py-0.5 font-mono text-[10.5px] text-fog">
          {issue.category}
        </span>
        {issue.file && (
          <span className="ml-auto truncate font-mono text-[11px] text-fog/80">
            {issue.file.filename}
            {issue.lineNumber ? `:${issue.lineNumber}` : ''}
          </span>
        )}
      </div>
      <p className={`text-sm font-medium text-snow ${issue.resolved ? 'line-through' : ''}`}>
        {issue.title}
      </p>
      {issue.description && (
        <p className="mt-1 text-[13px] leading-relaxed text-fog">{issue.description}</p>
      )}
      {issue.suggestion && (
        <div className="mt-2.5 rounded-lg border border-edge bg-ink-950 p-2.5">
          <p className="microlabel mb-1 !text-[9.5px]">Suggested fix</p>
          <p className="font-mono text-xs leading-relaxed text-mist">{issue.suggestion}</p>
        </div>
      )}
      {onResolve && (
        <button
          onClick={() => onResolve(issue)}
          className={`mt-2.5 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
            issue.resolved
              ? 'border-edge text-fog hover:text-mist'
              : 'border-volt-500/30 text-volt-400 hover:border-volt-500/60 hover:text-volt-300'
          }`}
        >
          {issue.resolved ? 'Reopen' : 'Mark resolved'}
        </button>
      )}
    </div>
  );
}
