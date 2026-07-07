import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { apiError } from '../api/client';
import CodeViewer from '../components/CodeViewer';
import FileUploader from '../components/FileUploader';
import GitHubImport from '../components/GitHubImport';
import AuditProgress from '../components/AuditProgress';
import IssueCard from '../components/IssueCard';
import Skeleton from '../components/Skeleton';
import { useToast } from '../components/Toaster';
import { SEVERITY_ORDER, SEVERITY_STYLES, scoreBand } from '../lib/score';

const ISSUE_PAGE_SIZE = 30;

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  const [openTabs, setOpenTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [contents, setContents] = useState({});
  const [fileQuery, setFileQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [issues, setIssues] = useState([]);
  const [severityFilter, setSeverityFilter] = useState(new Set());
  const [fileScope, setFileScope] = useState(true);
  const [issueLimit, setIssueLimit] = useState(ISSUE_PAGE_SIZE);

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
      toast(`Deleted ${file.filename}`);
      load();
    } catch (err) {
      toast(apiError(err, 'Failed to delete file'), 'error');
    }
  };

  // One-click re-import of the linked repo — re-syncing after new commits
  // feeds the incremental audit path.
  const syncRepo = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post(`/api/projects/${id}/github/import`, {
        repoUrl: project.repoUrl,
        branch: project.repoBranch || 'main',
      });
      toast(
        `Synced ${data.imported} file${data.imported === 1 ? '' : 's'} @ ${data.headSha.slice(0, 7)}${
          data.skipped ? ` (${data.skipped} skipped)` : ''
        }`
      );
      setContents({});
      load();
    } catch (err) {
      toast(apiError(err, 'Sync failed'), 'error');
    } finally {
      setSyncing(false);
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
      setIssues((list) =>
        list.map((i) => (i.id === issue.id ? { ...i, resolved: data.resolved } : i))
      );
      toast(data.resolved ? 'Issue marked resolved' : 'Issue reopened');
    } catch (err) {
      toast(apiError(err, 'Failed to update issue'), 'error');
    }
  };

  const activeFile = project?.files?.find((f) => f.id === activeId);
  const visibleFiles = (project?.files || []).filter((f) =>
    f.filename.toLowerCase().includes(fileQuery.trim().toLowerCase())
  );
  const matchingIssues = issues.filter((i) => {
    if (severityFilter.size > 0 && !severityFilter.has(i.severity)) return false;
    if (fileScope && activeFile && i.file?.filename !== activeFile.filename) return false;
    return true;
  });
  const visibleIssues = matchingIssues.slice(0, issueLimit);

  const toggleSeverity = (sev) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      next.has(sev) ? next.delete(sev) : next.add(sev);
      return next;
    });
  };

  if (error && !project) return <p className="alert-error">{error}</p>;
  if (!project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_21rem]">
          <Skeleton className="h-[50vh]" />
          <Skeleton className="h-[50vh]" />
          <Skeleton className="h-[50vh]" />
        </div>
      </div>
    );
  }

  const band = scoreBand(project.debtScore);

  return (
    <div>
      {/* Header */}
      <div className="rise mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display truncate text-[22px] font-semibold tracking-tight text-snow">
              {project.name}
            </h1>
            {project.debtScore != null && (
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-[13px] font-semibold ${band.bg} ${band.text}`}
                title="Debt score from the latest audit — higher is better"
              >
                {Math.round(project.debtScore)}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-fog">
            <span>{project.files.length} files</span>
            {project.language && <span className="font-mono text-xs">{project.language}</span>}
            {project.repoUrl && (
              <span className="font-mono text-xs">
                {project.repoUrl.replace('https://github.com/', '')} @ {project.repoBranch}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link to={`/projects/${id}/timeline`} className="btn-ghost">
            Timeline
          </Link>
          {project.repoUrl && (
            <button
              onClick={syncRepo}
              disabled={syncing}
              className="btn-ghost"
              title={`Re-import ${project.repoUrl} @ ${project.repoBranch || 'main'}`}
            >
              {syncing ? 'Syncing…' : 'Sync repo'}
            </button>
          )}
          <button onClick={() => setShowGithub(true)} className="btn-ghost">
            Import GitHub
          </button>
          <button
            onClick={runAudit}
            disabled={Boolean(runningAuditId) || project.files.length === 0}
            className="btn-primary"
            title={project.files.length === 0 ? 'Add files first' : 'Queue an audit'}
          >
            Run audit
          </button>
        </div>
      </div>

      {/* Audit controls */}
      <div className="rise mb-5 flex flex-wrap items-center gap-4" style={{ animationDelay: '60ms' }}>
        <label
          className={`flex items-center gap-2 text-sm ${
            hasCompletedAudit ? 'cursor-pointer text-mist' : 'cursor-not-allowed text-fog/60'
          }`}
        >
          <input
            type="checkbox"
            checked={incremental}
            onChange={(e) => setIncremental(e.target.checked)}
            disabled={!hasCompletedAudit}
            className="h-3.5 w-3.5 accent-[var(--color-volt-400)]"
          />
          Incremental
          <span className="text-xs text-fog">
            {hasCompletedAudit
              ? 'Only changed files are re-analyzed.'
              : 'Available after the first completed audit.'}
          </span>
        </label>
        {auditError && <span className="text-sm text-red-400">{auditError}</span>}
      </div>

      {runningAuditId && (
        <div className="mb-5">
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

      {/* Workspace: files | code | issues */}
      <div
        className="rise grid grid-cols-1 gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_21rem]"
        style={{ minHeight: '62vh', animationDelay: '120ms' }}
      >
        {/* Files */}
        <div className="panel flex flex-col">
          <div className="panel-header !py-2">
            <span className="microlabel">Files</span>
            <button onClick={() => setShowUploader(true)} className="btn-ghost !px-2.5 !py-1 font-mono !text-[11px]">
              + Add
            </button>
          </div>
          {project.files.length > 6 && (
            <div className="border-b border-edge px-2 py-1.5">
              <input
                value={fileQuery}
                onChange={(e) => setFileQuery(e.target.value)}
                placeholder="Filter files…"
                className="w-full rounded-md border border-edge bg-ink-950 px-2 py-1 font-mono text-xs text-snow placeholder:text-fog/50 focus:border-volt-500 focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-[68vh] flex-1 overflow-y-auto p-1.5">
            {project.files.length === 0 && (
              <p className="p-3 text-xs leading-relaxed text-fog">
                No files yet. Use <span className="text-mist">+ Add</span> to paste or upload
                code, or <span className="text-mist">Import GitHub</span> for a whole repo.
              </p>
            )}
            {project.files.length > 0 && visibleFiles.length === 0 && (
              <p className="p-3 text-xs text-fog">No files match “{fileQuery}”.</p>
            )}
            {visibleFiles.map((f) => (
              <div
                key={f.id}
                className={`group flex items-center justify-between gap-1 rounded-md px-2 py-1.5 transition-colors ${
                  activeId === f.id ? 'bg-ink-800 text-snow' : 'text-fog hover:bg-ink-850 hover:text-mist'
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
                  className="hidden rounded px-1 text-fog/60 hover:text-red-400 group-hover:block"
                  title="Delete file"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Code viewer */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-edge bg-ink-950">
          <div className="flex items-center gap-0.5 overflow-x-auto border-b border-edge bg-ink-900/70 px-1.5 pt-1.5">
            {openTabs.map((fileId) => {
              const f = project.files.find((x) => x.id === fileId);
              if (!f) return null;
              return (
                <div
                  key={fileId}
                  className={`flex shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 font-mono text-xs transition-colors ${
                    activeId === fileId
                      ? 'border-edge bg-ink-950 text-snow'
                      : 'border-transparent text-fog hover:text-mist'
                  }`}
                >
                  <button onClick={() => setActiveId(fileId)}>{f.filename.split('/').pop()}</button>
                  <button onClick={() => closeTab(fileId)} className="text-fog/50 hover:text-mist">
                    ×
                  </button>
                </div>
              );
            })}
            {openTabs.length === 0 && (
              <span className="px-3 py-1.5 font-mono text-[11px] text-fog/60">no file open</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {activeId && contents[activeId] ? (
              <CodeViewer content={contents[activeId].content} language={contents[activeId].language} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center">
                <p className="text-sm text-fog">
                  {activeId ? 'Loading…' : 'Select a file on the left to inspect it.'}
                </p>
                {!activeId && project.files.length === 0 && (
                  <button onClick={() => setShowUploader(true)} className="btn-primary mt-2">
                    Add your first file
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Issues */}
        <div className="panel flex flex-col">
          <div className="border-b border-edge px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="microlabel">
                Issues{issues.length > 0 && ` · ${visibleIssues.length}/${issues.length}`}
              </span>
              {activeFile && (
                <button
                  onClick={() => setFileScope((s) => !s)}
                  className={`rounded-md border px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
                    fileScope
                      ? 'border-volt-500/40 bg-volt-500/10 text-volt-300'
                      : 'border-edge text-fog hover:text-mist'
                  }`}
                  title="Toggle between issues for the open file and all files"
                >
                  {fileScope ? 'active file' : 'all files'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {SEVERITY_ORDER.map((sev) => (
                <button
                  key={sev}
                  onClick={() => toggleSeverity(sev)}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] uppercase transition-colors ${
                    severityFilter.size === 0 || severityFilter.has(sev)
                      ? SEVERITY_STYLES[sev]
                      : 'border-edge text-fog/40'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {issues.length === 0 && (
              <p className="p-3 text-xs leading-relaxed text-fog">
                No audit results yet. Add files and press{' '}
                <span className="text-mist">Run audit</span> — findings appear here, filed by
                severity and file.
              </p>
            )}
            {issues.length > 0 && matchingIssues.length === 0 && (
              <p className="p-3 text-xs text-fog">No issues match the current filters.</p>
            )}
            {visibleIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} onResolve={toggleResolve} />
            ))}
            {matchingIssues.length > issueLimit && (
              <button
                onClick={() => setIssueLimit((n) => n + ISSUE_PAGE_SIZE)}
                className="btn-ghost w-full !py-1.5 font-mono !text-[11px]"
              >
                Show {Math.min(ISSUE_PAGE_SIZE, matchingIssues.length - issueLimit)} more
              </button>
            )}
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
