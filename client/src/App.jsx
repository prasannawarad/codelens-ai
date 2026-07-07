import { BrowserRouter, Routes, Route, Navigate, Link, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ProjectView from './pages/ProjectView';
import AuditReport from './pages/AuditReport';
import DebtTimeline from './pages/DebtTimeline';
import Settings from './pages/Settings';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const navClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-md text-sm transition-colors ${
      isActive ? 'text-zinc-100 bg-zinc-800/80' : 'text-zinc-400 hover:text-zinc-200'
    }`;
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-indigo-500" />
            <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
              CodeLens<span className="text-indigo-400">.ai</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-zinc-500">{user?.name}</span>
            <button
              onClick={logout}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/projects/:id" element={<RequireAuth><ProjectView /></RequireAuth>} />
          <Route path="/projects/:id/timeline" element={<RequireAuth><DebtTimeline /></RequireAuth>} />
          <Route path="/audits/:auditId" element={<RequireAuth><AuditReport /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
