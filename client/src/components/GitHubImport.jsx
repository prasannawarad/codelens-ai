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

  return (
    <Modal title="Import from GitHub" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="microlabel mb-1.5 block">Repository</label>
        <input
          placeholder="https://github.com/owner/repo or owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          className="field mb-4 font-mono"
        />
        <label className="microlabel mb-1.5 block">Branch</label>
        <input value={branch} onChange={(e) => setBranch(e.target.value)} className="field mb-5 font-mono" />
        <button type="submit" disabled={busy || !repoUrl.trim()} className="btn-primary w-full">
          {busy ? 'Importing…' : 'Import repository'}
        </button>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-fog">
        Code files up to 100 KB are imported (max 50, largest first). Vendored folders, build
        output and lockfiles are skipped. Private repos need a PAT in Settings. Re-importing
        after new commits feeds the incremental audit path.
      </p>
      {result && (
        <p className="alert-ok mt-4">
          Imported {result.imported} file{result.imported === 1 ? '' : 's'}
          {result.skipped > 0 ? `, skipped ${result.skipped} (size/cap limits)` : ''} · HEAD{' '}
          <span className="font-mono">{result.headSha?.slice(0, 7)}</span>
        </p>
      )}
      {error && <p className="alert-error mt-4">{error}</p>}
    </Modal>
  );
}
