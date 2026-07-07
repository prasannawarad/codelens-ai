import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { apiError } from '../api/client';
import DebtChart from '../components/DebtChart';
import { timeAgo, scoreBand } from '../lib/score';

export default function DebtTimeline() {
  const { id } = useParams();
  const [audits, setAudits] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/api/projects/${id}/audits`)
      .then(({ data }) => setAudits(data))
      .catch((err) => setError(apiError(err, 'Failed to load audit history')));
  }, [id]);

  if (error) {
    return <p className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</p>;
  }
  if (!audits) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Debt timeline</h1>
        <Link
          to={`/projects/${id}`}
          className="ml-auto rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600"
        >
          Back to project
        </Link>
      </div>

      <div className="mb-5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <DebtChart audits={audits} />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-zinc-200">Audit history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Overall</th>
                <th className="px-4 py-2 font-medium">Debt</th>
                <th className="px-4 py-2 font-medium">Issues</th>
                <th className="px-4 py-2 font-medium">Mode</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {audits
                .slice()
                .reverse()
                .map((a) => {
                  const band = scoreBand(a.overallScore);
                  return (
                    <tr key={a.id} className="border-t border-zinc-800/60">
                      <td className="px-4 py-2 text-zinc-400">{timeAgo(a.completedAt || a.createdAt)}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`font-mono text-xs ${
                            a.status === 'completed'
                              ? 'text-emerald-400'
                              : a.status === 'failed'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className={`px-4 py-2 font-mono ${band.text}`}>
                        {a.overallScore != null ? Math.round(a.overallScore) : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono text-zinc-300">
                        {a.debtScore != null ? Math.round(a.debtScore) : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono text-zinc-300">
                        {a.status === 'completed' ? `${a.totalIssues} (${a.criticalCount} crit)` : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-500">
                        {a.incremental
                          ? `incremental ${a.analyzedFileCount}/${a.analyzedFileCount + a.reusedFileCount}`
                          : 'full'}
                        {a.trigger === 'ci' ? ' · ci' : ''}
                      </td>
                      <td className="px-4 py-2">
                        {a.status === 'completed' && (
                          <Link to={`/audits/${a.id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
                            View report
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
