import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, type AuthUser, type Company, type UpdateCheck } from './api';
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
  const [updateInfo, setUpdateInfo] = useState<UpdateCheck | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await api.checkUpdate();
        if (!cancelled) {
          setUpdateInfo(r);
          if (r.updateAvailable) setBannerDismissed(false);
        }
      } catch {
        /* çevrimdışı */
      }
    };
    run();
    const id = window.setInterval(run, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
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
  const showUpdateBanner = !!updateInfo?.updateAvailable && !bannerDismissed;

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
          <NavLink to="/import">Haftalık Excel</NavLink>
          <NavLink to="/logs">İşlem Logları</NavLink>
          <NavLink to="/account">
            Hesabım
            {updateInfo?.updateAvailable ? <span className="nav-dot" aria-label="Güncelleme var" /> : null}
          </NavLink>
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
            {updateInfo?.localVersion ? (
              <>
                <br />
                v{updateInfo.localVersion}
              </>
            ) : null}
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
        {showUpdateBanner && (
          <div className="update-banner" role="status">
            <div>
              <strong>Uygulamanın yeni sürümü var</strong>
              <span>
                {' '}
                · v{updateInfo!.remoteVersion} (mevcut v{updateInfo!.localVersion})
              </span>
            </div>
            <div className="update-banner-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate('/account')}>
                Güncelle
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setBannerDismissed(true)}>
                Sonra
              </button>
            </div>
          </div>
        )}
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
