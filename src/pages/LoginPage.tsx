import { FormEvent, useState } from 'react';

export default function LoginPage({
  onLogin,
}: {
  onLogin: (payload: { token: string; user: { username: string; role: string } }) => void;
}) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Giriş başarısız');
      localStorage.setItem('istirak_token', data.token);
      onLogin(data);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Giriş hatası');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-kicker">Lokal • Gizli</div>
          <h1>İştirak Nakit Akış</h1>
          <p>Yönetim paneline giriş yapın</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <div className="field">
            <label>Kullanıcı adı</label>
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Şifre</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          {err && <div className="alert err">{err}</div>}
          <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
            {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>

        <div className="login-hint">
          Varsayılan admin: <strong>admin</strong> / <strong>Admin123!</strong>
        </div>
      </div>
    </div>
  );
}
