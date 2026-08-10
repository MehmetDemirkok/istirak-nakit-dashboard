import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Company, type CompanyProfile, type CompanyRole } from '../api';

const EMPTY: Partial<CompanyProfile> = {
  founded_at: '',
  board_chair: '',
  board_vice: '',
  board_members: '',
  general_assembly_date: '',
  partnership: '',
  personnel_count: '',
  credits: '',
  patents: '',
  project_count: '',
  project_amount_try: '',
  project_amount_usd: '',
  project_amount_eur: '',
  debts_to_partners: '',
  notes: '',
};

export default function CompaniesPage({
  companies,
  onChange,
}: {
  companies: Company[];
  onChange: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const parent = companies.find((c) => c.role === 'parent');
  const ordered = useMemo(() => {
    const p = companies.filter((c) => c.role === 'parent');
    const s = companies.filter((c) => c.role === 'subsidiary');
    return [...p, ...s];
  }, [companies]);

  const [activeId, setActiveId] = useState<string | null>(params.get('id') || ordered[0]?.id || null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<CompanyRole>('subsidiary');
  const [editName, setEditName] = useState('');
  const [form, setForm] = useState<Partial<CompanyProfile>>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const canAddParent = !parent;
  const active = ordered.find((c) => c.id === activeId) || ordered[0] || null;
  const isParent = active?.role === 'parent';
  const subsidiaryCount = useMemo(
    () => companies.filter((c) => c.role === 'subsidiary').length,
    [companies],
  );

  useEffect(() => {
    if (params.get('id')) setActiveId(params.get('id'));
    else if (!activeId && ordered[0]) setActiveId(ordered[0].id);
  }, [params, ordered]);

  useEffect(() => {
    if (!active) {
      setForm(EMPTY);
      setEditName('');
      return;
    }
    setEditName(active.name);
    setErr(null);
    setMsg(null);
    api
      .getProfile(active.id)
      .then((p) => setForm({ ...EMPTY, ...p }))
      .catch((e) => setErr(e.message));
  }, [active?.id]);

  const selectCompany = (id: string) => {
    setActiveId(id);
    setParams({ id });
  };

  const createCompany = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const created = await api.createCompany({
        name,
        role: canAddParent ? role : 'subsidiary',
        parentId: parent?.id,
      });
      setName('');
      setMsg('Şirket eklendi');
      await onChange();
      selectCompany(created.id);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async (e: FormEvent) => {
    e.preventDefault();
    if (!active) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      if (editName.trim() && editName.trim() !== active.name) {
        await api.updateCompany(active.id, editName.trim());
      }
      const payload =
        active.role === 'parent'
          ? {
              ...form,
              project_count: String(subsidiaryCount),
              partnership: '',
              credits: '',
              patents: '',
              project_amount_try: '',
              project_amount_usd: '',
              project_amount_eur: '',
              debts_to_partners: '',
            }
          : form;
      await api.saveProfile(active.id, payload);
      setMsg('Şirket bilgileri kaydedildi');
      await onChange();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Kayıt hatası');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Company) => {
    if (!confirm(`${c.name} silinsin mi?`)) return;
    try {
      await api.deleteCompany(c.id);
      setMsg('Şirket silindi');
      await onChange();
      if (activeId === c.id) {
        setActiveId(null);
        setParams({});
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Silinemedi');
    }
  };

  const setField = (key: keyof CompanyProfile, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Şirketler</h2>
          <p>Tüm şirketleri, profilleri ve detayları buradan yönetin.</p>
        </div>
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="companies-layout">
        <aside className="card panel companies-list-pane">
          <h3>Kayıtlı Şirketler</h3>
          {ordered.length === 0 ? (
            <div className="empty">Henüz şirket yok.</div>
          ) : (
            <ul className="company-pick-list">
              {ordered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`company-pick ${active?.id === c.id ? 'active' : ''}`}
                    onClick={() => selectCompany(c.id)}
                  >
                    <span className="company-pick-name">{c.name}</span>
                    <span className="company-pick-meta">
                      <span className={`pill ${c.role === 'parent' ? 'parent' : 'sub'}`}>
                        {c.role === 'parent' ? 'Ana' : 'İştirak'}
                      </span>
                      <span className={`pill ${c.hasData ? 'ok' : 'no'}`}>
                        {c.hasData ? `Veri${c.year ? ` ${c.year}` : ''}` : 'Veri yok'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="companies-add">
            <h3>Yeni Şirket</h3>
            <form onSubmit={createCompany} className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="field">
                <label>Şirket adı</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Örn. ABC Enerji A.Ş."
                />
              </div>
              {canAddParent && (
                <div className="field">
                  <label>Rol</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as CompanyRole)}>
                    <option value="parent">Ana şirket</option>
                    <option value="subsidiary">İştirak</option>
                  </select>
                </div>
              )}
              {!canAddParent && parent && (
                <div className="alert warn" style={{ margin: 0 }}>
                  Ana: {parent.name}. Yeni kayıtlar iştirak olur.
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
                Ekle
              </button>
            </form>
          </div>
        </aside>

        <section className="card panel companies-detail-pane">
          {!active ? (
            <div className="empty">Soldan bir şirket seçin veya yeni şirket ekleyin.</div>
          ) : (
            <form onSubmit={saveDetails}>
              <div className="companies-detail-head">
                <div>
                  <h3 style={{ margin: 0 }}>{active.name}</h3>
                  <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                    {isParent
                      ? 'Ana holding · yalnızca şirket bilgileri (nakit verisi iştiraklerde)'
                      : 'İştirak · profil ve detay bilgileri'}
                  </p>
                </div>
                <div className="toolbar">
                  {active.role === 'subsidiary' && (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => navigate(`/?company=${active.id}`)}
                    >
                      Dashboard
                    </button>
                  )}
                  {active.role === 'parent' && (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => navigate(`/?company=${active.id}`)}
                    >
                      Konsolide
                    </button>
                  )}
                  <button className="btn btn-danger" type="button" onClick={() => remove(active)}>
                    Sil
                  </button>
                </div>
              </div>

              <div className="form-grid" style={{ marginTop: '1rem' }}>
                <div className="field full">
                  <label>Şirket adı</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Kuruluş Tarihi</label>
                  <input value={form.founded_at || ''} onChange={(e) => setField('founded_at', e.target.value)} />
                </div>
                <div className="field">
                  <label>Genel Kurul Tarihi</label>
                  <input
                    value={form.general_assembly_date || ''}
                    onChange={(e) => setField('general_assembly_date', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>YK Başkanı</label>
                  <input value={form.board_chair || ''} onChange={(e) => setField('board_chair', e.target.value)} />
                </div>
                <div className="field">
                  <label>YK Başkan Vekili</label>
                  <input value={form.board_vice || ''} onChange={(e) => setField('board_vice', e.target.value)} />
                </div>
                <div className="field full">
                  <label>Yönetim Kurulu Üyeleri</label>
                  <input
                    value={form.board_members || ''}
                    onChange={(e) => setField('board_members', e.target.value)}
                  />
                </div>

                {isParent ? (
                  <>
                    <div className="field">
                      <label>Personel Sayısı</label>
                      <input
                        value={form.personnel_count || ''}
                        onChange={(e) => setField('personnel_count', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Toplam Proje Sayısı</label>
                      <input
                        value={String(subsidiaryCount)}
                        readOnly
                        title="Sistemdeki iştirak sayısı"
                      />
                      <span style={{ display: 'block', marginTop: 6, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Otomatik: sistemdeki iştirak sayısı ({subsidiaryCount})
                      </span>
                    </div>
                    <div className="field full">
                      <label>Notlar</label>
                      <textarea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field full">
                      <label>Ortaklık Yapısı</label>
                      <textarea
                        value={form.partnership || ''}
                        onChange={(e) => setField('partnership', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Personel Sayısı</label>
                      <input
                        value={form.personnel_count || ''}
                        onChange={(e) => setField('personnel_count', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Kredi Durumu</label>
                      <input value={form.credits || ''} onChange={(e) => setField('credits', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Patent Sayısı</label>
                      <input value={form.patents || ''} onChange={(e) => setField('patents', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Toplam Proje Sayısı</label>
                      <input
                        value={form.project_count || ''}
                        onChange={(e) => setField('project_count', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Proje Bedeli (₺)</label>
                      <input
                        value={form.project_amount_try || ''}
                        onChange={(e) => setField('project_amount_try', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Proje Bedeli ($)</label>
                      <input
                        value={form.project_amount_usd || ''}
                        onChange={(e) => setField('project_amount_usd', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Proje Bedeli (€)</label>
                      <input
                        value={form.project_amount_eur || ''}
                        onChange={(e) => setField('project_amount_eur', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Ortaklara Borçlar</label>
                      <input
                        value={form.debts_to_partners || ''}
                        onChange={(e) => setField('debts_to_partners', e.target.value)}
                      />
                    </div>
                    <div className="field full">
                      <label>Notlar</label>
                      <textarea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              <div className="toolbar" style={{ marginTop: '1.1rem' }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Bilgileri Kaydet'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
