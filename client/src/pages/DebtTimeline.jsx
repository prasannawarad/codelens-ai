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

  if (error) return <p className="alert-error">{error}</p>;
  if (!audits) return <p className="text-sm text-fog">Loading…</p>;

  return (
    <div>
      <div className="rise mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-snow">
            Debt timeline
          </h1>
          <p className="mt-0.5 text-sm text-fog">
            Overall and debt scores across every completed audit — the trend is the point.
          </p>
        </div>
        <Link to={`/projects/${id}`} className="btn-ghost ml-auto">
          Back to project
        </Link>
      </div>

      <div className="rise panel mb-6 p-4" style={{ animationDelay: '60ms' }}>
        <DebtChart audits={audits} />
      </div>

      <div className="rise panel overflow-hidden" style={{ animationDelay: '120ms' }}>
        <div className="panel-header">
          <h2 className="text-sm font-semibold text-snow">Audit history</h2>
          <span className="font-mono text-[11px] text-fog">{audits.length} runs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {['When', 'Status', 'Overall', 'Debt', 'Issues', 'Mode', ''].map((h, i) => (
                  <th key={i} className="microlabel px-4 py-2.5 !font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audits
                .slice()
                .reverse()
                .map((a) => {
                  const band = scoreBand(a.overallScore);
                  return (
                    <tr key={a.id} className="border-t border-edge/70 transition-colors hover:bg-ink-850">
                      <td className="px-4 py-2.5 text-fog">{timeAgo(a.completedAt || a.createdAt)}</td>
                      <td className="px-4 py-2.5">
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
                      <td className={`px-4 py-2.5 font-mono font-semibold ${band.text}`}>
                        {a.overallScore != null ? Math.round(a.overallScore) : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-mist">
                        {a.debtScore != null ? Math.round(a.debtScore) : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-mist">
                        {a.status === 'completed' ? `${a.totalIssues} (${a.criticalCount} crit)` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-fog">
                        {a.incremental
                          ? `incr ${a.analyzedFileCount}/${a.analyzedFileCount + a.reusedFileCount}`
                          : 'full'}
                        {a.trigger === 'ci' ? ' · ci' : ''}
                      </td>
                      <td className="px-4 py-2.5">
                        {a.status === 'completed' && (
                          <Link
                            to={`/audits/${a.id}`}
                            className="text-xs font-medium text-volt-400 hover:text-volt-300"
                          >
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
