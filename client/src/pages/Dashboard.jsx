import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { scoreBand, timeAgo } from '../lib/score';

// Inline SVG sparkline of recent overall scores (oldest → newest).
function Sparkline({ audits }) {
  const scores = audits
    .filter((a) => a.status === 'completed' && a.overallScore != null)
    .slice()
    .reverse()
    .map((a) => a.overallScore);
  if (scores.length < 2) return null;
  const w = 110;
  const h = 30;
  const pts = scores.map(
    (s, i) => [(i / (scores.length - 1)) * (w - 6) + 3, h - (s / 100) * (h - 8) - 4]
  );
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <div className="flex flex-col items-end gap-0.5">
      <svg width={w} height={h}>
        <polyline points={line} fill="none" stroke="var(--color-volt-400)" strokeWidth="1.5" opacity="0.85" />
        <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--color-volt-400)" />
      </svg>
      <span className="font-mono text-[10px] text-fog/70">last {scores.length} audits</span>
    </div>
  );
}

function ScoreRing({ score, size = 46 }) {
  const band = scoreBand(score);
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const v = score == null ? 0 : (Math.min(100, Math.max(0, score)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title="Debt score — higher is better">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-edge)" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={band.hex}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${v} ${c - v}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold text-snow">
        {score != null ? Math.round(score) : '—'}
      </span>
    </div>
  );
}

function ProjectCard({ project, index }) {
  const latest = project.audits?.[0];
  return (
    <Link
      to={`/projects/${project.id}`}
      className="rise group panel block p-4 transition-all hover:-translate-y-0.5 hover:border-edge-bright"
      style={{ animationDelay: `${90 + index * 60}ms` }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-snow">{project.name}</h3>
          <p className="mt-0.5 truncate text-sm text-fog">
            {project.description || 'No description'}
          </p>
        </div>
        <ScoreRing score={project.debtScore} />
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-edge pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fog">
          {project.language && (
            <span className="rounded border border-edge px-1.5 py-0.5 text-mist">{project.language}</span>
          )}
          <span>{project._count?.files ?? 0} files</span>
          <span>
            {latest
              ? `audited ${timeAgo(latest.completedAt || latest.createdAt)}`
              : 'never audited'}
          </span>
        </div>
        <Sparkline audits={project.audits || []} />
      </div>
    </Link>
  );
}

const ONBOARDING = [
  ['01', 'Create a project', 'A workspace for one codebase — its files, audits and history.'],
  ['02', 'Add code', 'Paste files, drag-drop uploads, or import a GitHub repository.'],
  ['03', 'Run an audit', 'Deterministic static metrics + AI analysis across bugs, security, performance, style and debt — scored 0–100.'],
  ['04', 'Fix and re-audit', 'Incremental audits re-analyze only changed files and track your debt trend over time.'],
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/api/projects')
      .then(({ data }) => setProjects(data))
      .catch((err) => setError(apiError(err, 'Failed to load projects')));
  }, []);

  const createProject = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/api/projects', { name, description });
      navigate(`/projects/${data.id}`);
    } catch (err) {
      setError(apiError(err, 'Failed to create project'));
      setBusy(false);
    }
  };

  const completed = (projects || []).flatMap((p) =>
    (p.audits || []).filter((a) => a.status === 'completed')
  );
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, a) => s + (a.overallScore ?? 0), 0) / completed.length)
    : null;
  const openIssues = (projects || []).reduce(
    (s, p) => s + (p.audits?.[0]?.status === 'completed' ? p.audits[0].totalIssues : 0),
    0
  );
  const criticals = (projects || []).reduce(
    (s, p) => s + (p.audits?.[0]?.status === 'completed' ? p.audits[0].criticalCount : 0),
    0
  );

  const stats = [
    ['Projects', projects?.length ?? '—', 'workspaces under the lens'],
    ['Avg score', avgScore ?? '—', 'across recent completed audits'],
    ['Open issues', projects ? openIssues : '—', `${criticals} critical in latest audits`],
  ];

  return (
    <div>
      <div className="rise mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight text-snow">
            Projects
          </h1>
          <p className="mt-1 text-sm text-fog">
            Each project is one codebase — its files, audit history and debt trend.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <span className="font-mono text-base leading-none">+</span> New project
        </button>
      </div>

      <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map(([label, value, hint], i) => (
          <div
            key={label}
            className="rise panel px-4 py-3.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <p className="microlabel">{label}</p>
            <p className="mt-1.5 font-mono text-[28px] font-semibold leading-none text-snow">
              {value}
            </p>
            <p className="mt-1.5 text-xs text-fog/80">{hint}</p>
          </div>
        ))}
      </div>

      {error && <p className="alert-error mb-4">{error}</p>}

      {projects && projects.length === 0 && (
        <div className="rise panel overflow-hidden" style={{ animationDelay: '180ms' }}>
          <div className="border-b border-edge px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-snow">How CodeLens works</h2>
            <p className="mt-0.5 text-sm text-fog">Four steps from raw code to a tracked debt score.</p>
          </div>
          <ol className="grid grid-cols-1 divide-y divide-edge md:grid-cols-4 md:divide-x md:divide-y-0">
            {ONBOARDING.map(([num, title, desc]) => (
              <li key={num} className="p-5">
                <span className="font-mono text-xs font-semibold text-volt-400">{num}</span>
                <p className="mt-2 text-sm font-medium text-snow">{title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fog">{desc}</p>
              </li>
            ))}
          </ol>
          <div className="border-t border-edge px-6 py-4">
            <button onClick={() => setCreating(true)} className="btn-primary">
              Create your first project
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(projects || []).map((p, i) => (
          <ProjectCard key={p.id} project={p} index={i} />
        ))}
      </div>

      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
          <form onSubmit={createProject}>
            <label className="microlabel mb-1.5 block">Name</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. payments-service"
              className="field mb-4"
            />
            <label className="microlabel mb-1.5 block">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this codebase does"
              className="field mb-5"
            />
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
