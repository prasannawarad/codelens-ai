import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { apiError } from '../api/client';
import CodeViewer from '../components/CodeViewer';
import FileUploader from '../components/FileUploader';
import GitHubImport from '../components/GitHubImport';
import AuditProgress from '../components/AuditProgress';
import IssueCard from '../components/IssueCard';
import { SEVERITY_ORDER, SEVERITY_STYLES, scoreBand } from '../lib/score';

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  const [openTabs, setOpenTabs] = useState([]); // fileIds
  const [activeId, setActiveId] = useState(null);
  const [contents, setContents] = useState({}); // fileId → {content, language}

  const [issues, setIssues] = useState([]);
  const [severityFilter, setSeverityFilter] = useState(new Set());
  const [fileScope, setFileScope] = useState(true); // filter issues by active file

  const [showUploader, setShowUploader] = useState(false);
  const [showGithub, setShowGithub] = useState(false);

  const [incremental, setIncremental] = useState(false);
  const [runningAuditId, setRunningAuditId] = useState(null);
  const [auditError, setAuditError] = useState(null);

  const hasCompletedAudit = useMemo(
    () => (project?.audits || []).some((a) => a.status === 'completed'),
    [project]
  );

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/projects/${id}`);
      setProject(data);
      setIncremental((data.audits || []).some((a) => a.status === 'completed'));
      const latestCompleted = (data.audits || []).find((a) => a.status === 'completed');
      if (latestCompleted) {
        const { data: audit } = await api.get(`/api/audits/${latestCompleted.id}`);
        setIssues(audit.issues || []);
      } else {
        setIssues([]);
      }
    } catch (err) {
      setError(apiError(err, 'Failed to load project'));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openFile = async (file) => {
    setActiveId(file.id);
    setOpenTabs((tabs) => (tabs.includes(file.id) ? tabs : [...tabs, file.id]));
    if (!contents[file.id]) {
      try {
        const { data } = await api.get(`/api/projects/${id}/files/${file.id}`);
        setContents((c) => ({ ...c, [file.id]: data }));
      } catch (err) {
        setError(apiError(err, 'Failed to load file'));
      }
    }
  };

  const closeTab = (fileId) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== fileId);
      if (activeId === fileId) setActiveId(next[next.length - 1] || null);
      return next;
    });
  };

  const deleteFile = async (file) => {
    if (!window.confirm(`Delete ${file.filename}?`)) return;
    try {
      await api.delete(`/api/projects/${id}/files/${file.id}`);
      closeTab(file.id);
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to delete file'));
    }
  };

  const runAudit = async () => {
    setAuditError(null);
    try {
      const { data } = await api.post(`/api/projects/${id}/audits`, { incremental });
      setRunningAuditId(data.auditId);
    } catch (err) {
      setAuditError(apiError(err, 'Failed to start audit'));
    }
  };

  const toggleResolve = async (issue) => {
    try {
      const { data } = await api.patch(`/api/issues/${issue.id}/resolve`);
      setIssues((list) => list.map((i) => (i.id === issue.id ? { ...i, resolved: data.resolved } : i)));
    } catch (err) {
      setError(apiError(err, 'Failed to update issue'));
    }
  };

  const activeFile = project?.files?.find((f) => f.id === activeId);
  const visibleIssues = issues.filter((i) => {
    if (severityFilter.size > 0 && !severityFilter.has(i.severity)) return false;
    if (fileScope && activeFile && i.file?.filename !== activeFile.filename) return false;
    return true;
  });

  const toggleSeverity = (sev) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      next.has(sev) ? next.delete(sev) : next.add(sev);
      return next;
    });
  };

  if (error && !project) {
    return <p className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</p>;
  }
  if (!project) return <p className="text-sm text-zinc-500">Loading…</p>;

  const band = scoreBand(project.debtScore);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100">
            {project.name}
          </h1>
          <p className="text-sm text-zinc-500">
            {project.files.length} files
            {project.language ? ` · ${project.language}` : ''}
            {project.repoUrl ? (
              <>
                {' · '}
                <span className="font-mono text-xs">{project.repoUrl.replace('https://github.com/', '')}</span>
              </>
            ) : null}
          </p>
        </div>
        {project.debtScore != null && (
          <span className={`rounded-md px-2 py-1 font-mono text-sm font-semibold ${band.bg} ${band.text}`}>
            debt {Math.round(project.debtScore)}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            to={`/projects/${id}/timeline`}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600"
          >
            Timeline
          </Link>
          <button
            onClick={() => setShowGithub(true)}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600"
          >
            Import GitHub
          </button>
          <button
            onClick={runAudit}
            disabled={Boolean(runningAuditId) || project.files.length === 0}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Run audit
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={incremental}
            onChange={(e) => setIncremental(e.target.checked)}
            disabled={!hasCompletedAudit}
            className="accent-indigo-500"
          />
          Incremental
          <span className="text-xs text-zinc-600">Only changed files are re-analyzed.</span>
        </label>
        {auditError && <span className="text-sm text-red-400">{auditError}</span>}
      </div>

      {runningAuditId && (
        <div className="mb-4">
          <AuditProgress
            auditId={runningAuditId}
            onCompleted={() => navigate(`/audits/${runningAuditId}`)}
            onFailed={(a) => {
              setAuditError(a.errorMessage || 'Audit failed');
              setRunningAuditId(null);
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-[14rem_minmax(0,1fr)_20rem] gap-3" style={{ minHeight: '60vh' }}>
        {/* Files tree */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Files</span>
            <button
              onClick={() => setShowUploader(true)}
              className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:border-zinc-600"
            >
              + Add
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-1.5">
            {project.files.length === 0 && (
              <p className="p-3 text-xs text-zinc-600">
                No files yet. Add code or import a repo.
              </p>
            )}
            {project.files.map((f) => (
              <div
                key={f.id}
                className={`group flex items-center justify-between gap-1 rounded px-2 py-1.5 ${
                  activeId === f.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
                }`}
              >
                <button
                  onClick={() => openFile(f)}
                  className="min-w-0 flex-1 truncate text-left font-mono text-xs"
                  title={f.filename}
                >
                  {f.filename}
                </button>
                <button
                  onClick={() => deleteFile(f)}
                  className="hidden rounded px-1 text-zinc-600 hover:text-red-400 group-hover:block"
                  title="Delete file"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Code viewer */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-0.5 overflow-x-auto border-b border-zinc-800 bg-zinc-900/50 px-1.5 pt-1.5">
            {openTabs.map((fileId) => {
              const f = project.files.find((x) => x.id === fileId);
              if (!f) return null;
              return (
                <div
                  key={fileId}
                  className={`flex shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 font-mono text-xs ${
                    activeId === fileId
                      ? 'border-zinc-700 bg-zinc-950 text-zinc-200'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <button onClick={() => setActiveId(fileId)}>{f.filename.split('/').pop()}</button>
                  <button onClick={() => closeTab(fileId)} className="text-zinc-600 hover:text-zinc-300">
                    ×
                  </button>
                </div>
              );
            })}
            {openTabs.length === 0 && (
              <span className="px-3 py-1.5 text-xs text-zinc-600">Select a file to view</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {activeId && contents[activeId] ? (
              <CodeViewer content={contents[activeId].content} language={contents[activeId].language} />
            ) : (
              <div className="flex h-full items-center justify-center p-12 text-sm text-zinc-600">
                {activeId ? 'Loading…' : 'The code you audit shows here.'}
              </div>
            )}
          </div>
        </div>

        {/* Issues panel */}
        <div className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="border-b border-zinc-800 px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-zinc-500">
                Issues {issues.length > 0 && `(${visibleIssues.length}/${issues.length})`}
              </span>
              {activeFile && (
                <button
                  onClick={() => setFileScope((s) => !s)}
                  className={`rounded border px-2 py-0.5 text-[11px] ${
                    fileScope
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                      : 'border-zinc-700 text-zinc-500'
                  }`}
                >
                  {fileScope ? 'Active file' : 'All files'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {SEVERITY_ORDER.map((sev) => (
                <button
                  key={sev}
                  onClick={() => toggleSeverity(sev)}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase ${
                    severityFilter.size === 0 || severityFilter.has(sev)
                      ? SEVERITY_STYLES[sev]
                      : 'border-zinc-800 text-zinc-700'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {issues.length === 0 && (
              <p className="p-3 text-xs text-zinc-600">
                No audit results yet. Run an audit to populate this panel.
              </p>
            )}
            {issues.length > 0 && visibleIssues.length === 0 && (
              <p className="p-3 text-xs text-zinc-600">No issues match the current filters.</p>
            )}
            {visibleIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} onResolve={toggleResolve} />
            ))}
          </div>
        </div>
      </div>

      {showUploader && (
        <FileUploader
          projectId={id}
          onClose={() => setShowUploader(false)}
          onAdded={() => {
            setShowUploader(false);
            setContents({});
            load();
          }}
        />
      )}
      {showGithub && (
        <GitHubImport
          projectId={id}
          defaultRepoUrl={project.repoUrl || ''}
          defaultBranch={project.repoBranch || 'main'}
          onClose={() => setShowGithub(false)}
          onImported={() => {
            setContents({});
            load();
          }}
        />
      )}
    </div>
  );
}
