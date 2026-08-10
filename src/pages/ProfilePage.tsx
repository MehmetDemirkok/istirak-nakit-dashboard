import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type Company, type CompanyProfile } from '../api';

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

export default function ProfilePage({ companies }: { companies: Company[] }) {
  const subsidiaries = useMemo(() => companies.filter((c) => c.role === 'subsidiary'), [companies]);
  const [companyId, setCompanyId] = useState(subsidiaries[0]?.id || '');
  const [form, setForm] = useState<Partial<CompanyProfile>>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = companyId || subsidiaries[0]?.id || '';

  useEffect(() => {
    if (!selected) return;
    api
      .getProfile(selected)
      .then((p) => setForm({ ...EMPTY, ...p }))
      .catch((e) => setErr(e.message));
  }, [selected]);

  const set = (key: keyof CompanyProfile, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setMsg(null);
    setErr(null);
    try {
      await api.saveProfile(selected, form);
      setMsg('Profil kaydedildi');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Kayıt hatası');
    }
  };

  if (subsidiaries.length === 0) {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>Şirket Profili</h2>
            <p>Sunumdaki şirket kartı alanları (Excel’de yoktur).</p>
          </div>
        </div>
        <div className="card panel empty">Önce bir iştirak ekleyin.</div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Şirket Profili</h2>
          <p>Kuruluş, YK, ortaklık ve proje bilgileri PPTX sunumuna aktarılır.</p>
        </div>
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <form className="card panel" onSubmit={save}>
        <div className="field" style={{ marginBottom: '1rem', maxWidth: 420 }}>
          <label>İştirak</label>
          <select value={selected} onChange={(e) => setCompanyId(e.target.value)}>
            {subsidiaries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Kuruluş Tarihi</label>
            <input value={form.founded_at || ''} onChange={(e) => set('founded_at', e.target.value)} />
          </div>
          <div className="field">
            <label>Genel Kurul Tarihi</label>
            <input
              value={form.general_assembly_date || ''}
              onChange={(e) => set('general_assembly_date', e.target.value)}
            />
          </div>
          <div className="field">
            <label>YK Başkanı</label>
            <input value={form.board_chair || ''} onChange={(e) => set('board_chair', e.target.value)} />
          </div>
          <div className="field">
            <label>YK Başkan Vekili</label>
            <input value={form.board_vice || ''} onChange={(e) => set('board_vice', e.target.value)} />
          </div>
          <div className="field full">
            <label>Yönetim Kurulu Üyeleri</label>
            <input value={form.board_members || ''} onChange={(e) => set('board_members', e.target.value)} />
          </div>
          <div className="field full">
            <label>Ortaklık Yapısı</label>
            <textarea value={form.partnership || ''} onChange={(e) => set('partnership', e.target.value)} />
          </div>
          <div className="field">
            <label>Personel Sayısı</label>
            <input
              value={form.personnel_count || ''}
              onChange={(e) => set('personnel_count', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Kredi Durumu</label>
            <input value={form.credits || ''} onChange={(e) => set('credits', e.target.value)} />
          </div>
          <div className="field">
            <label>Patent Sayısı</label>
            <input value={form.patents || ''} onChange={(e) => set('patents', e.target.value)} />
          </div>
          <div className="field">
            <label>Toplam Proje Sayısı</label>
            <input value={form.project_count || ''} onChange={(e) => set('project_count', e.target.value)} />
          </div>
          <div className="field">
            <label>Proje Bedeli (₺)</label>
            <input
              value={form.project_amount_try || ''}
              onChange={(e) => set('project_amount_try', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Proje Bedeli ($)</label>
            <input
              value={form.project_amount_usd || ''}
              onChange={(e) => set('project_amount_usd', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Proje Bedeli (€)</label>
            <input
              value={form.project_amount_eur || ''}
              onChange={(e) => set('project_amount_eur', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Ortaklara Borçlar</label>
            <input
              value={form.debts_to_partners || ''}
              onChange={(e) => set('debts_to_partners', e.target.value)}
            />
          </div>
          <div className="field full">
            <label>Notlar</label>
            <textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" type="submit">
            Kaydet
          </button>
        </div>
      </form>
    </>
  );
}
