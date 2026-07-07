import { useState } from 'react';
import api, { apiError } from '../api/client';
import Modal from './Modal';

// Repo import modal: repoUrl + branch → POST /github/import → imported/skipped.
export default function GitHubImport({ projectId, defaultRepoUrl, defaultBranch, onClose, onImported }) {
  const [repoUrl, setRepoUrl] = useState(defaultRepoUrl || '');
  const [branch, setBranch] = useState(defaultBranch || 'main');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const { data } = await api.post(`/api/projects/${projectId}/github/import`, {
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || 'main',
      });
      setResult(data);
      onImported?.(data);
    } catch (err) {
      setError(apiError(err, 'Import failed'));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500 font-mono';

  return (
    <Modal title="Import from GitHub" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
          Repository
        </label>
        <input
          placeholder="https://github.com/owner/repo or owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          className={`${inputClass} mb-3`}
        />
        <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Branch</label>
        <input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className={`${inputClass} mb-4`}
        />
        <button
          type="submit"
          disabled={busy || !repoUrl.trim()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Import repository'}
        </button>
      </form>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Code files up to 100 KB are imported (max 50, largest first). Vendored folders,
        build output and lockfiles are skipped. Private repos need a PAT in Settings.
      </p>
      {result && (
        <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Imported {result.imported} file{result.imported === 1 ? '' : 's'}
          {result.skipped > 0 ? `, skipped ${result.skipped} (size/cap limits)` : ''} · HEAD{' '}
          <span className="font-mono">{result.headSha?.slice(0, 7)}</span>
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  );
}
