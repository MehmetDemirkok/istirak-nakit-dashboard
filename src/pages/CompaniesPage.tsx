import { FormEvent, useMemo, useState } from 'react';
import { api, type Company, type CompanyRole } from '../api';

export default function CompaniesPage({
  companies,
  onChange,
}: {
  companies: Company[];
  onChange: () => Promise<void>;
}) {
  const parent = companies.find((c) => c.role === 'parent');
  const [name, setName] = useState('');
  const [role, setRole] = useState<CompanyRole>('subsidiary');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canAddParent = !parent;
  const roleOptions = useMemo(() => {
    if (canAddParent) return ['parent', 'subsidiary'] as CompanyRole[];
    return ['subsidiary'] as CompanyRole[];
  }, [canAddParent]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api.createCompany({
        name,
        role: canAddParent ? role : 'subsidiary',
        parentId: parent?.id,
      });
      setName('');
      setMsg('Şirket eklendi');
      await onChange();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Company) => {
    if (!confirm(`${c.name} silinsin mi?`)) return;
    try {
      await api.deleteCompany(c.id);
      await onChange();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Silinemedi');
    }
  };

  const seed = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.seedDemo();
      setMsg(`Demo yüklendi: ${r.subsidiary?.name} — ${r.import}`);
      await onChange();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Demo yüklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Şirketler</h2>
          <p>Ana şirket ve iştirakleri tanımlayın. Excel iştiraklere yüklenir.</p>
        </div>
        <div className="toolbar">
          <button className="btn btn-ghost" type="button" onClick={seed} disabled={busy}>
            Demo Veri Yükle
          </button>
        </div>
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="grid-2">
        <section className="card panel">
          <h3>Kayıtlı Şirketler</h3>
          {companies.length === 0 ? (
            <div className="empty">Henüz şirket yok. Ana şirket ekleyerek başlayın.</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Rol</th>
                  <th>Veri</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      <span className={`pill ${c.role === 'parent' ? 'parent' : 'sub'}`}>
                        {c.role === 'parent' ? 'Ana' : 'İştirak'}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${c.hasData ? 'ok' : 'no'}`}>
                        {c.hasData ? `Yüklü${c.year ? ` ${c.year}` : ''}` : 'Yok'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-danger" type="button" onClick={() => remove(c)}>
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card panel">
          <h3>Yeni Şirket</h3>
          <form onSubmit={submit} className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="field">
              <label>Şirket adı</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Örn. ABC Enerji A.Ş." />
            </div>
            {canAddParent && (
              <div className="field">
                <label>Rol</label>
                <select value={role} onChange={(e) => setRole(e.target.value as CompanyRole)}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r === 'parent' ? 'Ana şirket' : 'İştirak'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!canAddParent && (
              <div className="alert warn">Ana şirket: {parent?.name}. Yeni kayıtlar iştirak olarak eklenir.</div>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
              Kaydet
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
