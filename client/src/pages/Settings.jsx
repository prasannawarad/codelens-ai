import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client';
import { useToast } from '../components/Toaster';

function Section({ title, description, children }) {
  return (
    <div className="grid grid-cols-1 gap-4 py-7 md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-sm font-semibold text-snow">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-fog">{description}</p>
      </div>
      <div className="panel p-5">{children}</div>
    </div>
  );
}

export default function Settings() {
  const toast = useToast();
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [githubToken, setGithubToken] = useState('');
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
    setBusy(true);
    try {
      const payload = { name };
      if (githubToken !== '') payload.githubToken = githubToken;
      const { data } = await api.patch('/api/auth/me', payload);
      setMe((m) => ({ ...m, ...data }));
      setGithubToken('');
      toast('Settings saved');
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
      toast('GitHub token removed');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rise mx-auto max-w-3xl">
      <h1 className="font-display text-[26px] font-semibold tracking-tight text-snow">Settings</h1>
      <p className="mt-1 text-sm text-fog">Profile and integrations for your workspace.</p>

      {error && <p className="alert-error mt-5">{error}</p>}

      <form onSubmit={save} className="mt-2 divide-y divide-edge">
        <Section title="Profile" description="How you appear in the workspace.">
          <label className="microlabel mb-1.5 block">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field mb-4" />
          <label className="microlabel mb-1.5 block">Email</label>
          <input value={me?.email || ''} disabled className="field opacity-50" />
        </Section>

        <Section
          title="GitHub access"
          description="A personal access token unlocks private-repo imports and raises API rate limits. Fine-grained, read-only Contents access is enough."
        >
          <label className="microlabel mb-1.5 block">
            Personal access token
            {me?.hasGithubToken && (
              <span className="ml-2 rounded border border-volt-500/30 bg-volt-500/10 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-volt-300">
                token stored
              </span>
            )}
          </label>
          <input
            type="password"
            placeholder={me?.hasGithubToken ? '•••••••• (enter a new token to replace)' : 'ghp_… or github_pat_…'}
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            className="field mb-2 font-mono"
            autoComplete="off"
          />
          <p className="text-xs leading-relaxed text-fog">
            Stored server-side and never sent back to the browser.
          </p>
          {me?.hasGithubToken && (
            <button type="button" onClick={clearToken} disabled={busy} className="btn-ghost mt-3 !py-1.5 text-xs">
              Remove token
            </button>
          )}
        </Section>

        <div className="py-6">
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
