import { useCallback, useEffect, useState } from 'react';
import { api, type ActivityLog } from '../api';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'auth', label: 'Oturum' },
  { value: 'company', label: 'Şirket' },
  { value: 'profile', label: 'Profil' },
  { value: 'import', label: 'Excel' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'export', label: 'Rapor' },
  { value: 'demo', label: 'Demo' },
  { value: 'logs', label: 'Log' },
  { value: 'api', label: 'Diğer' },
];

function formatDateTime(raw: string) {
  // SQLite localtime: "YYYY-MM-DD HH:MM:SS"
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.filter((c) => c.value !== 'all').map((c) => [c.value, c.label]),
);

export default function LogsPage() {
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{
    total: number;
    byCategory: { category: string; c: number }[];
    lastAt: string | null;
  } | null>(null);
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.listLogs({
        limit: 200,
        category: category === 'all' ? undefined : category,
        q: q || undefined,
      });
      setItems(r.items);
      setTotal(r.total);
      setStats(r.stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Loglar yüklenemedi');
    } finally {
      setBusy(false);
    }
  }, [category, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => load(), 8000);
    return () => clearInterval(t);
  }, [auto, load]);

  const clearAll = async () => {
    if (!confirm('Tüm işlem logları silinsin mi?')) return;
    try {
      await api.clearLogs();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Temizlenemedi');
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h2>İşlem Logları</h2>
          <p>Kullanıcıların tarih/saat bazlı tüm işlem kayıtları (lokal SQLite).</p>
        </div>
        <div className="toolbar">
          <label className="log-auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Canlı yenile
          </label>
          <button className="btn btn-ghost" type="button" onClick={() => load()} disabled={busy}>
            Yenile
          </button>
          <button className="btn btn-danger" type="button" onClick={clearAll}>
            Logları Temizle
          </button>
        </div>
      </div>

      {err && <div className="alert err">{err}</div>}

      <div className="grid-kpi" style={{ marginBottom: '1rem' }}>
        <div className="card kpi" style={{ ['--accent' as string]: '#0B4DA8' }}>
          <div className="label">Toplam kayıt</div>
          <div className="value">{stats?.total ?? total}</div>
        </div>
        <div className="card kpi" style={{ ['--accent' as string]: '#E87722' }}>
          <div className="label">Listelenen</div>
          <div className="value">{items.length}</div>
        </div>
        <div className="card kpi" style={{ ['--accent' as string]: '#0D9488' }}>
          <div className="label">Son işlem</div>
          <div className="value" style={{ fontSize: '1.05rem' }}>
            {stats?.lastAt ? formatDateTime(stats.lastAt) : '—'}
          </div>
        </div>
      </div>

      <section className="card panel" style={{ marginBottom: '1rem' }}>
        <form
          className="toolbar"
          style={{ flexWrap: 'wrap', gap: '0.65rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qDraft.trim());
          }}
        >
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori">
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Ara: kullanıcı, işlem, detay…"
            style={{ minWidth: 220, flex: 1 }}
          />
          <button className="btn btn-primary" type="submit">
            Filtrele
          </button>
        </form>
      </section>

      <section className="card panel">
        {items.length === 0 ? (
          <div className="empty">
            {busy ? 'Yükleniyor…' : 'Henüz log yok. Uygulamada işlem yaptıkça burada görünecek.'}
          </div>
        ) : (
          <div className="log-table-wrap">
            <table className="data log-table">
              <thead>
                <tr>
                  <th>Tarih / Saat</th>
                  <th>Kullanıcı</th>
                  <th>İşlem</th>
                  <th>Detay</th>
                  <th>Kategori</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className={`log-row level-${row.level}`}>
                    <td className="log-time">{formatDateTime(row.createdAt)}</td>
                    <td>{row.username || '—'}</td>
                    <td>
                      <strong>{row.action}</strong>
                      {row.method && (
                        <div className="log-path">
                          {row.method} {row.path}
                        </div>
                      )}
                    </td>
                    <td>{row.detail || '—'}</td>
                    <td>
                      <span className={`pill log-cat cat-${row.category}`}>
                        {CAT_LABEL[row.category] || row.category}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          (row.statusCode || 0) >= 400 ? 'no' : row.level === 'warn' ? 'sub' : 'ok'
                        }`}
                      >
                        {row.statusCode ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > items.length && (
          <p style={{ color: 'var(--muted)', marginTop: '0.75rem', fontSize: '0.85rem' }}>
            Toplam {total} kayıttan son {items.length} gösteriliyor.
          </p>
        )}
      </section>
    </>
  );
}
