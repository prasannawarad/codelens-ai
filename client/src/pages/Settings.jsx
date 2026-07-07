import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client';

export default function Settings() {
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/api/auth/me')
      .then(({ data }) => {
        setMe(data);
        setName(data.name);
      })
      .catch((err) => setError(apiError(err)));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const payload = { name };
      if (githubToken !== '') payload.githubToken = githubToken;
      const { data } = await api.patch('/api/auth/me', payload);
      setMe((m) => ({ ...m, ...data }));
      setGithubToken('');
      setMessage('Settings saved');
    } catch (err) {
      setError(apiError(err, 'Failed to save settings'));
    } finally {
      setBusy(false);
    }
  };

  const clearToken = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.patch('/api/auth/me', { githubToken: '' });
      setMe((m) => ({ ...m, ...data }));
      setMessage('GitHub token removed');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500';

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-semibold tracking-tight text-zinc-100">Settings</h1>
      <form onSubmit={save} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mb-4`} />

        <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Email</label>
        <input value={me?.email || ''} disabled className={`${inputClass} mb-4 opacity-60`} />

        <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
          GitHub personal access token
        </label>
        <input
          type="password"
          placeholder={me?.hasGithubToken ? '•••••••• (token stored)' : 'ghp_… (optional)'}
          value={githubToken}
          onChange={(e) => setGithubToken(e.target.value)}
          className={`${inputClass} mb-2 font-mono`}
        />
        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          Used for importing private repositories and to raise GitHub API rate limits. A
          fine-grained token with read-only Contents access is enough. Stored server-side and
          never sent back to the browser.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {me?.hasGithubToken && (
            <button
              type="button"
              onClick={clearToken}
              disabled={busy}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              Remove token
            </button>
          )}
        </div>
        {message && <p className="mt-3 text-sm text-emerald-400">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </form>
    </div>
  );
}
