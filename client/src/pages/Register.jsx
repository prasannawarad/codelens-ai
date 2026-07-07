import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../api/client';
import AuthLayout from '../components/AuthLayout';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await register(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Registration failed'));
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} className="rise">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-snow">
          Create your account
        </h1>
        <p className="mb-7 mt-1.5 text-sm text-fog">
          A workspace for every codebase you want to keep honest.
        </p>

        <label className="microlabel mb-1.5 block" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field mb-4"
        />
        <label className="microlabel mb-1.5 block" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field mb-4"
        />
        <label className="microlabel mb-1.5 block" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field mb-1.5"
        />
        <p className="mb-5 text-xs text-fog/80">At least 8 characters.</p>
        {error && <p className="alert-error mb-4">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="mt-5 text-center text-sm text-fog">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-volt-400 hover:text-volt-300">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
