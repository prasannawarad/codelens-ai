import Brand, { LensMark } from './Brand';

// Split-panel auth chrome: brand story on the left, form on the right.
export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-edge p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 45% at 30% 110%, rgb(189 239 63 / 0.09), transparent 70%)',
          }}
        />
        <Brand />
        <div className="relative">
          <div className="mb-8 opacity-90">
            <LensMark size={72} />
          </div>
          <h1 className="font-display max-w-md text-4xl font-semibold leading-[1.08] tracking-tight text-snow">
            Put your codebase under the lens.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fog">
            Deterministic static metrics crossed with LLM analysis. One weighted score,
            an itemized issue list, and a debt trend you can actually watch go down.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-edge pt-6">
            {[
              ['5', 'audit categories'],
              ['0–100', 'weighted score'],
              ['Δ only', 'incremental re-audits'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="font-mono text-lg font-semibold text-volt-400">{value}</dt>
                <dd className="mt-0.5 text-xs text-fog">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative font-mono text-[11px] text-fog/70">
          static metrics × gemini analysis × bullmq pipeline
        </p>
      </aside>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 lg:hidden">
            <Brand />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
