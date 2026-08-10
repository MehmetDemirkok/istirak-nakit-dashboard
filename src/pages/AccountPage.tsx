import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, type AuthUser } from '../api';

export default function AccountPage({
  user,
  onUserChange,
}: {
  user: AuthUser;
  onUserChange: (u: AuthUser) => void;
}) {
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [email, setEmail] = useState(user.email || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [previewBust, setPreviewBust] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setEmail(user.email || '');
  }, [user]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const { user: next } = await api.updateProfile({ firstName, lastName, email });
      onUserChange(next);
      setMsg('Profil kaydedildi');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Kayıt hatası');
    } finally {
      setBusy(false);
    }
  };

  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const { user: next } = await api.uploadAvatar(file);
      onUserChange(next);
      setPreviewBust(Date.now());
      setMsg('Profil fotoğrafı güncellendi');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Fotoğraf yüklenemedi');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async () => {
    if (!confirm('Profil fotoğrafı silinsin mi?')) return;
    setBusy(true);
    setErr(null);
    try {
      const { user: next } = await api.deleteAvatar();
      onUserChange(next);
      setPreviewBust(Date.now());
      setMsg('Fotoğraf silindi');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  const photo = user.avatarUrl ? `${user.avatarUrl}?v=${previewBust}` : null;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Hesabım</h2>
          <p>Ad, soyad, e-posta ve profil fotoğrafınızı güncelleyin.</p>
        </div>
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="account-layout">
        <section className="card panel account-photo-card">
          <h3 style={{ marginTop: 0 }}>Profil fotoğrafı</h3>
          <div className="account-photo-wrap">
            {photo ? (
              <img className="account-photo" src={photo} alt={user.displayName || user.username} />
            ) : (
              <div className="account-photo placeholder">
                {user.initials || user.username.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="toolbar" style={{ marginTop: '1rem', justifyContent: 'center' }}>
            <label className="btn btn-primary" style={{ display: 'inline-block' }}>
              {busy ? '…' : 'Fotoğraf Seç'}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                disabled={busy}
                onChange={(e) => onPickPhoto(e.target.files?.[0] || null)}
              />
            </label>
            {user.avatarUrl && (
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={removePhoto}>
                Kaldır
              </button>
            )}
          </div>
          <p style={{ margin: '0.75rem 0 0', color: 'var(--muted)', fontSize: '0.82rem', textAlign: 'center' }}>
            JPG / PNG / WEBP · en fazla 3 MB
          </p>
        </section>

        <section className="card panel">
          <h3 style={{ marginTop: 0 }}>Kişisel bilgiler</h3>
          <form onSubmit={save} className="form-grid">
            <div className="field">
              <label>Ad</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Adınız" />
            </div>
            <div className="field">
              <label>Soyad</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Soyadınız" />
            </div>
            <div className="field full">
              <label>E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ad.soyad@firma.com"
              />
            </div>
            <div className="field">
              <label>Kullanıcı adı</label>
              <input value={user.username} disabled />
            </div>
            <div className="field">
              <label>Rol</label>
              <input value={user.role === 'admin' ? 'Yönetici' : user.role} disabled />
            </div>
            <div className="field full">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Kaydediliyor…' : 'Bilgileri Kaydet'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
