import { BrowserRouter, Routes, Route, Navigate, Link, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Brand from './components/Brand';
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
    `relative px-3 py-[19px] text-sm transition-colors ${
      isActive
        ? 'text-snow after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-volt-400'
        : 'text-fog hover:text-mist'
    }`;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-edge bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-[57px] max-w-7xl items-center gap-7 px-5">
          <Link to="/" className="shrink-0">
            <Brand />
          </Link>
          <nav className="flex items-center self-stretch">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-edge px-3 py-1 font-mono text-xs text-fog sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-volt-400" />
              {user?.name}
            </span>
            <button onClick={logout} className="btn-ghost !py-1.5 text-xs">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
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
