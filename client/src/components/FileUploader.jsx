import { useState } from 'react';
import api, { apiError } from '../api/client';
import Modal from './Modal';

const TABS = [
  ['Paste', 'Paste code with a filename'],
  ['Upload', 'Drag-drop or browse files'],
  ['From URL', 'Fetch a raw file URL'],
];

// Add files to a project: paste with filename, drag-drop/browse upload, or a
// raw GitHub URL. Repo-wide import lives in GitHubImport.
export default function FileUploader({ projectId, onClose, onAdded }) {
  const [tab, setTab] = useState('Paste');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [rawUrl, setRawUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const submitFiles = async (files) => {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/files`, files);
      onAdded();
    } catch (err) {
      setError(apiError(err, 'Failed to add files'));
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    if (!filename.trim() || !content) return setError('Filename and content are required');
    submitFiles([{ filename: filename.trim(), content }]);
  };

  const handleFileList = async (fileList) => {
    const files = await Promise.all(
      Array.from(fileList).map(
        (f) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ filename: f.name, content: reader.result });
            reader.onerror = reject;
            reader.readAsText(f);
          })
      )
    );
    if (files.length > 0) submitFiles(files);
  };

  const handleUrl = async (e) => {
    e.preventDefault();
    setError(null);
    const url = rawUrl.trim();
    if (!url) return;
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const text = await res.text();
      const name = url.split('/').filter(Boolean).slice(-1)[0] || 'fetched-file.txt';
      await submitFiles([{ filename: name, content: text }]);
    } catch (err) {
      setError(err.message || 'Could not fetch that URL');
      setBusy(false);
    }
  };

  return (
    <Modal title="Add files" onClose={onClose} wide>
      <div className="mb-5 flex gap-1 rounded-lg border border-edge bg-ink-950 p-1">
        {TABS.map(([t, hint]) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            title={hint}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t ? 'bg-ink-800 font-medium text-snow' : 'text-fog hover:text-mist'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Paste' && (
        <form onSubmit={handlePaste}>
          <label className="microlabel mb-1.5 block">Filename</label>
          <input
            placeholder="src/routes/auth.js"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="field mb-4 font-mono"
          />
          <label className="microlabel mb-1.5 block">Code</label>
          <textarea
            placeholder="Paste code here"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="field mb-4 font-mono !text-xs leading-relaxed"
          />
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Adding…' : 'Add file'}
          </button>
        </form>
      )}

      {tab === 'Upload' && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFileList(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
            dragOver ? 'border-volt-400 bg-volt-500/5' : 'border-edge-bright'
          }`}
        >
          <p className="mb-4 text-sm text-fog">Drag and drop source files here, or</p>
          <label className="btn-ghost cursor-pointer">
            Browse files
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileList(e.target.files)}
            />
          </label>
          {busy && <p className="mt-4 text-sm text-fog">Uploading…</p>}
        </div>
      )}

      {tab === 'From URL' && (
        <form onSubmit={handleUrl}>
          <label className="microlabel mb-1.5 block">Raw file URL</label>
          <input
            placeholder="https://raw.githubusercontent.com/owner/repo/main/src/index.js"
            value={rawUrl}
            onChange={(e) => setRawUrl(e.target.value)}
            className="field mb-4 font-mono"
          />
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Fetching…' : 'Fetch and add'}
          </button>
        </form>
      )}

      {error && <p className="alert-error mt-4">{error}</p>}
    </Modal>
  );
}
