import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiError } from '../api/client';
import AuthLayout from '../components/AuthLayout';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Login failed'));
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} className="rise">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-snow">
          Welcome back
        </h1>
        <p className="mb-7 mt-1.5 text-sm text-fog">Sign in to your audit workspace.</p>

        <label className="microlabel mb-1.5 block" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field mb-5"
        />
        {error && <p className="alert-error mb-4">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-5 text-center text-sm text-fog">
          No account?{' '}
          <Link to="/register" className="font-medium text-volt-400 hover:text-volt-300">
            Create one
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
