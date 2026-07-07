// Per-file static metrics table from Audit.staticMetrics.
export default function MetricsPanel({ staticMetrics }) {
  if (!staticMetrics?.perFile?.length) return null;
  const { perFile, totals } = staticMetrics;
  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <h3 className="text-sm font-semibold text-snow">Static metrics</h3>
          <p className="mt-0.5 text-xs text-fog">
            Deterministic, no AI — token and line-window approximations.
          </p>
        </div>
        <span className="font-mono text-[11px] text-fog">
          {totals.loc} LOC · avg cx {totals.avgComplexity} · dup {totals.duplicationPct}%
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['File', 'LOC', 'Complexity', 'Max fn length', 'Duplication'].map((h) => (
                <th key={h} className="microlabel px-4 py-2.5 !font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {perFile.map((f) => (
              <tr key={f.filename} className="border-t border-edge/70 text-mist transition-colors hover:bg-ink-850">
                <td className="px-4 py-2.5">{f.filename}</td>
                <td className="px-4 py-2.5">{f.loc}</td>
                <td className={`px-4 py-2.5 ${f.complexity > 10 ? 'text-amber-400' : ''}`}>
                  {f.complexity}
                </td>
                <td className="px-4 py-2.5">{f.maxFunctionLength}</td>
                <td className={`px-4 py-2.5 ${f.duplicationPct > 10 ? 'text-amber-400' : ''}`}>
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
