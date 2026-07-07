import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { scoreBand, timeAgo } from '../lib/score';

// Tiny inline SVG sparkline of the last audits' overall scores (oldest → newest).
function Sparkline({ audits }) {
  const scores = audits
    .filter((a) => a.status === 'completed' && a.overallScore != null)
    .slice()
    .reverse()
    .map((a) => a.overallScore);
  if (scores.length < 2) return <div className="h-8" />;
  const w = 120;
  const h = 32;
  const points = scores
    .map((s, i) => `${(i / (scores.length - 1)) * w},${h - (s / 100) * (h - 4) - 2}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="opacity-80">
      <polyline points={points} fill="none" stroke="#818cf8" strokeWidth="1.5" />
    </svg>
  );
}

function ProjectCard({ project }) {
  const latest = project.audits?.[0];
  const band = scoreBand(project.debtScore);
  return (
    <Link
      to={`/projects/${project.id}`}
      className="group rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-zinc-100 group-hover:text-white">
            {project.name}
          </h3>
          {project.description && (
            <p className="mt-0.5 truncate text-sm text-zinc-500">{project.description}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-sm font-semibold ${band.bg} ${band.text}`}
          title="Debt score (higher is better)"
        >
          {project.debtScore != null ? Math.round(project.debtScore) : '—'}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="space-y-1 text-xs text-zinc-500">
          {project.language && <p className="font-mono">{project.language}</p>}
          <p>
            {project._count?.files ?? 0} files · last audit{' '}
            {latest ? timeAgo(latest.completedAt || latest.createdAt) : 'never'}
          </p>
        </div>
        <Sparkline audits={project.audits || []} />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/api/projects');
      setProjects(data);
    } catch (err) {
      setError(apiError(err, 'Failed to load projects'));
    }
  };

  useEffect(() => {
    load();
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Projects</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          New project
        </button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          ['Projects', projects?.length ?? '—'],
          ['Avg score (recent audits)', avgScore ?? '—'],
          ['Issues in latest audits', projects ? openIssues : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {projects && projects.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-800 p-12 text-center">
          <p className="mb-1 text-zinc-300">No projects yet</p>
          <p className="text-sm text-zinc-500">
            Create one, add code or import a GitHub repo, and run your first audit.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(projects || []).map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>

      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
          <form onSubmit={createProject}>
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Name</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-3 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500"
            />
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mb-4 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
