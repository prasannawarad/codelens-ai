import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { scoreBand } from '../lib/score';

function BandDot({ cx, cy, payload, dataKey }) {
  if (cx == null || cy == null) return null;
  const band = scoreBand(payload[dataKey]);
  return <circle cx={cx} cy={cy} r={4} fill={band.hex} stroke="#09090b" strokeWidth={1.5} />;
}

function AuditTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const audit = payload[0].payload;
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-mono text-zinc-400">{label}</p>
      <p className="text-zinc-200">
        Overall <span className="font-mono">{audit.overallScore ?? '—'}</span> · Debt{' '}
        <span className="font-mono">{audit.debtScore ?? '—'}</span>
      </p>
      <p className="mt-0.5 text-zinc-400">
        {audit.totalIssues} issues ({audit.criticalCount} critical)
        {audit.incremental
          ? ` · ${audit.analyzedFileCount} analyzed / ${audit.reusedFileCount} reused`
          : ''}
      </p>
    </div>
  );
}

// Line chart of overallScore + debtScore across completed audits.
export default function DebtChart({ audits, height = 320 }) {
  const data = audits
    .filter((a) => a.status === 'completed')
    .map((a) => ({
      ...a,
      label: new Date(a.completedAt || a.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }) +
        ' ' +
        new Date(a.completedAt || a.createdAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }),
    }));

  if (data.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center text-sm text-zinc-500">
        No completed audits yet — run one to start the timeline.
      </p>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: -15 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} stroke="#3f3f46" />
          <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 11 }} stroke="#3f3f46" />
          <Tooltip content={<AuditTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
          <Line
            name="Overall score"
            type="monotone"
            dataKey="overallScore"
            stroke="#818cf8"
            strokeWidth={2}
            dot={<BandDot dataKey="overallScore" />}
          />
          <Line
            name="Debt score"
            type="monotone"
            dataKey="debtScore"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={<BandDot dataKey="debtScore" />}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
