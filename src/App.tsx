import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, type AuthUser, type Company } from './api';
import AccountPage from './pages/AccountPage';
import CompaniesPage from './pages/CompaniesPage';
import DashboardPage from './pages/DashboardPage';
import ImportPage from './pages/ImportPage';
import LogsPage from './pages/LogsPage';
import LoginPage from './pages/LoginPage';

function UserAvatar({ user }: { user: AuthUser }) {
  const [broken, setBroken] = useState(false);
  const showImg = !!user.avatarUrl && !broken;
  if (showImg) {
    return (
      <img
        className="sidebar-avatar-img"
        src={`${user.avatarUrl}?v=${user.id}`}
        alt={user.displayName || user.username}
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className="sidebar-avatar">{user.initials || user.username.slice(0, 1).toUpperCase()}</div>;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      const list = await api.listCompanies();
      setCompanies(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'API bağlantısı yok');
    }
  };

  useEffect(() => {
    const check = async () => {
      try {
        const { user: u } = await api.me();
        setUser(u);
      } catch {
        setUser(null);
        localStorage.removeItem('istirak_token');
      } finally {
        setAuthChecked(true);
      }
    };
    check();

    const onLogout = () => setUser(null);
    window.addEventListener('istirak:logout', onLogout);
    return () => window.removeEventListener('istirak:logout', onLogout);
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user?.id]);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    localStorage.removeItem('istirak_token');
    setUser(null);
    setCompanies([]);
    navigate('/');
  };

  if (!authChecked) {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          Oturum kontrol ediliyor…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={(payload) => {
          setUser(payload.user as AuthUser);
          navigate('/');
        }}
      />
    );
  }

  const displayName = user.displayName || user.username;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-kicker">Lokal • Gizli</div>
          <h1>İştirak Nakit Akış</h1>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/companies">Şirketler</NavLink>
          <NavLink to="/import">Excel Yükle</NavLink>
          <NavLink to="/logs">İşlem Logları</NavLink>
          <NavLink to="/account">Hesabım</NavLink>
        </nav>
        <div className="sidebar-foot">
          <button className="sidebar-user sidebar-user-btn" type="button" onClick={() => navigate('/account')}>
            <UserAvatar user={user} />
            <div className="sidebar-user-meta">
              <div className="name" title={displayName}>
                {displayName}
              </div>
              <div className="role">
                {user.role === 'admin' ? 'Yönetici' : user.role}
                {user.email ? ` · ${user.email}` : ''}
              </div>
            </div>
          </button>
          <button className="sidebar-logout" type="button" onClick={logout}>
            Çıkış Yap
          </button>
          <div className="sidebar-note">
            Veriler bu bilgisayarda kalır
            {error && (
              <>
                <br />
                <span style={{ color: '#ffb4a8' }}>{error}</span>
              </>
            )}
          </div>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<DashboardPage companies={companies} />} />
          <Route
            path="/companies"
            element={<CompaniesPage companies={companies} onChange={refresh} />}
          />
          <Route path="/import" element={<ImportPage companies={companies} onImported={refresh} />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route
            path="/account"
            element={<AccountPage user={user} onUserChange={setUser} />}
          />
          <Route path="/profile" element={<Navigate to="/companies" replace />} />
        </Routes>
      </main>
    </div>
  );
}
