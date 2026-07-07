import { useState } from 'react';
import api, { apiError } from '../api/client';
import Modal from './Modal';

const TABS = ['Paste', 'Upload', 'From URL'];

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

  const inputClass =
    'w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500';

  return (
    <Modal title="Add files" onClose={onClose} wide>
      <div className="mb-4 flex gap-1 rounded-md border border-zinc-800 bg-zinc-950 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={`flex-1 rounded px-3 py-1.5 text-sm ${
              tab === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Paste' && (
        <form onSubmit={handlePaste}>
          <input
            placeholder="filename, e.g. src/routes/auth.js"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className={`${inputClass} mb-3 font-mono`}
          />
          <textarea
            placeholder="Paste code here"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className={`${inputClass} mb-3 font-mono text-xs`}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
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
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 text-center ${
            dragOver ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-700'
          }`}
        >
          <p className="mb-3 text-sm text-zinc-400">Drag and drop source files here</p>
          <label className="cursor-pointer rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-600">
            Browse files
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileList(e.target.files)}
            />
          </label>
          {busy && <p className="mt-3 text-sm text-zinc-500">Uploading…</p>}
        </div>
      )}

      {tab === 'From URL' && (
        <form onSubmit={handleUrl}>
          <input
            placeholder="https://raw.githubusercontent.com/owner/repo/main/src/index.js"
            value={rawUrl}
            onChange={(e) => setRawUrl(e.target.value)}
            className={`${inputClass} mb-3 font-mono`}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Fetching…' : 'Fetch and add'}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </Modal>
  );
}
