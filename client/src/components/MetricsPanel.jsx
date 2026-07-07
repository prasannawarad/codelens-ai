// Per-file static metrics table from Audit.staticMetrics.
export default function MetricsPanel({ staticMetrics }) {
  if (!staticMetrics?.perFile?.length) return null;
  const { perFile, totals } = staticMetrics;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-zinc-200">Static metrics</h3>
        <span className="font-mono text-xs text-zinc-500">
          {totals.loc} LOC · avg complexity {totals.avgComplexity} · duplication{' '}
          {totals.duplicationPct}%
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">LOC</th>
              <th className="px-4 py-2 font-medium">Complexity</th>
              <th className="px-4 py-2 font-medium">Max fn length</th>
              <th className="px-4 py-2 font-medium">Duplication</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {perFile.map((f) => (
              <tr key={f.filename} className="border-t border-zinc-800/60 text-zinc-300">
                <td className="px-4 py-2">{f.filename}</td>
                <td className="px-4 py-2">{f.loc}</td>
                <td className={`px-4 py-2 ${f.complexity > 10 ? 'text-amber-400' : ''}`}>
                  {f.complexity}
                </td>
                <td className="px-4 py-2">{f.maxFunctionLength}</td>
                <td className={`px-4 py-2 ${f.duplicationPct > 10 ? 'text-amber-400' : ''}`}>
                  {f.duplicationPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
