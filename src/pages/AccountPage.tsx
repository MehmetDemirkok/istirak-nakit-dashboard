import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, type AuthUser, type StorageInfo, type UpdateCheck } from '../api';

function describeUpdate(r: UpdateCheck): { err: string | null; msg: string | null } {
  if (!r.ok) return { err: r.error || 'Güncelleme kontrolü başarısız', msg: null };
  if (r.updateAvailable) return { err: null, msg: `Yeni sürüm var: v${r.remoteVersion}` };
  return { err: null, msg: `Güncelsiniz (v${r.localVersion})` };
}

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

  const [updateInfo, setUpdateInfo] = useState<UpdateCheck | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [updateErr, setUpdateErr] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setEmail(user.email || '');
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const applyCheck = (r: UpdateCheck) => {
      setUpdateInfo(r);
      const d = describeUpdate(r);
      setUpdateErr(d.err);
      setUpdateMsg(d.msg);
    };

    api
      .checkUpdate()
      .then((r) => {
        if (!cancelled) applyCheck(r);
      })
      .catch((ex) => {
        if (!cancelled) setUpdateErr(ex instanceof Error ? ex.message : 'Kontrol başarısız');
      });
    api
      .getStorage()
      .then((r) => {
        if (!cancelled) setStorage(r);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyCheckFromResult = (r: UpdateCheck) => {
    setUpdateInfo(r);
    const d = describeUpdate(r);
    setUpdateErr(d.err);
    setUpdateMsg(d.msg);
  };

  const copyPath = async (p: string) => {
    try {
      await navigator.clipboard.writeText(p);
      setCopiedPath(p);
      setTimeout(() => setCopiedPath((cur) => (cur === p ? null : cur)), 1800);
    } catch {
      setErr('Yol kopyalanamadı');
    }
  };

  const openFolder = async (folder: NonNullable<StorageInfo['folders'][number]['key']>) => {
    try {
      await api.openStorageFolder(folder);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Klasör açılamadı');
    }
  };

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

  const refreshUpdate = async () => {
    setUpdateBusy(true);
    setUpdateErr(null);
    setUpdateMsg(null);
    try {
      const r = await api.checkUpdate();
      applyCheckFromResult(r);
    } catch (ex) {
      setUpdateErr(ex instanceof Error ? ex.message : 'Kontrol başarısız');
    } finally {
      setUpdateBusy(false);
    }
  };

  const runUpdate = async () => {
    if (
      !confirm(
        'Yeni sürüm indirilip kurulacak. Verileriniz (Excel, şirketler, veritabanı) korunur. Devam edilsin mi?',
      )
    ) {
      return;
    }
    setUpdateBusy(true);
    setUpdateErr(null);
    setUpdateMsg('Güncelleme indiriliyor ve kuruluyor… Bu birkaç dakika sürebilir.');
    try {
      const r = await api.applyUpdate();
      if (!r.ok) {
        setUpdateErr(r.error || 'Güncelleme başarısız');
        setUpdateMsg(null);
        return;
      }
      setUpdateMsg(r.message);
      setUpdateInfo((prev) =>
        prev
          ? {
              ...prev,
              localVersion: r.localVersion,
              remoteVersion: r.remoteVersion,
              updateAvailable: false,
            }
          : prev,
      );
      if (r.restartScheduled) {
        setUpdateMsg(
          `${r.message} Tarayıcı birkaç saniye içinde yanıt vermeyebilir; Start ile yeniden açın.`,
        );
      }
    } catch (ex) {
      setUpdateErr(ex instanceof Error ? ex.message : 'Güncelleme başarısız');
      setUpdateMsg(null);
    } finally {
      setUpdateBusy(false);
    }
  };

  const photo = user.avatarUrl ? `${user.avatarUrl}?v=${previewBust}` : null;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Hesabım</h2>
          <p>Ad, soyad, e-posta, profil fotoğrafı, güncelleme ve veri klasörleri.</p>
        </div>
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <section className="card panel update-panel">
        <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0 }}>Uygulama güncellemesi</h3>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
              GitHub’daki son sürüme bakar. Token gerekmez; verileriniz (`data/`) korunur.
            </p>
          </div>
          <span className="version-pill">v{updateInfo?.localVersion || '…'}</span>
        </div>

        {updateInfo?.updateAvailable && (
          <div className="alert warn" style={{ marginTop: '0.85rem' }}>
            Yeni sürüm hazır: <strong>v{updateInfo.remoteVersion}</strong> (bu bilgisayar: v
            {updateInfo.localVersion})
          </div>
        )}
        {updateMsg && <div className="alert ok">{updateMsg}</div>}
        {updateErr && <div className="alert err">{updateErr}</div>}

        <div className="toolbar" style={{ marginTop: '0.85rem' }}>
          <button className="btn btn-ghost" type="button" disabled={updateBusy} onClick={refreshUpdate}>
            {updateBusy ? 'Kontrol ediliyor…' : 'Güncelleme Kontrol Et'}
          </button>
          {updateInfo?.updateAvailable ? (
            <button className="btn btn-accent" type="button" disabled={updateBusy} onClick={runUpdate}>
              {updateBusy ? 'Güncelleniyor…' : `Güncelle (v${updateInfo.remoteVersion})`}
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled={updateBusy} onClick={refreshUpdate}>
              {updateBusy ? 'Kontrol ediliyor…' : 'Güncelle'}
            </button>
          )}
        </div>
      </section>

      <div className="account-layout" style={{ marginTop: '1rem' }}>
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

      <section className="card panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ margin: 0 }}>Yerel veri</h3>
        <p style={{ margin: '0.35rem 0 0.85rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Tüm veriler yalnızca bu bilgisayarda, proje klasöründeki <strong>data/</strong> altında durur.
          Buluta gönderilmez. Güncelleme bu klasöre dokunmaz.
        </p>
        {storage?.folders.map((folder) => (
          <div key={folder.key} className="storage-row">
            <div className="storage-row-text">
              <div className="storage-label">{folder.label}</div>
              <code className="storage-path">{folder.path}</code>
              <div className="storage-note">{folder.note}</div>
            </div>
            <div className="storage-actions">
              <button className="btn btn-ghost" type="button" onClick={() => copyPath(folder.path)}>
                {copiedPath === folder.path ? 'Kopyalandı' : 'Yolu kopyala'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => openFolder(folder.key)}>
                Klasörü aç
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
