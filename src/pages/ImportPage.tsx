import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney, type Company, type ImportJob } from '../api';

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

function formatDateTime(raw: string) {
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function periodLabel(year: number | null, month: number | null) {
  if (year != null && month != null) return `${MONTHS[month]} ${year}`;
  if (year != null) return `${year} (tüm yıl)`;
  return '—';
}

export default function ImportPage({
  companies,
  onImported,
}: {
  companies: Company[];
  onImported: () => Promise<void>;
}) {
  const subsidiaries = useMemo(() => companies.filter((c) => c.role === 'subsidiary'), [companies]);
  const now = new Date();
  const [companyId, setCompanyId] = useState(subsidiaries[0]?.id || '');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const [imports, setImports] = useState<ImportJob[]>([]);
  const [importsBusy, setImportsBusy] = useState(false);
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [dlBusy, setDlBusy] = useState<string | null>(null);

  const selected = companyId || subsidiaries[0]?.id || '';
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1, 2024, 2025, 2026, 2027].filter((v, i, a) => a.indexOf(v) === i).sort();
  }, []);

  const loadImports = useCallback(async () => {
    setImportsBusy(true);
    try {
      const r = await api.listAllImports({
        companyId: filterCompany === 'all' ? undefined : filterCompany,
        status: filterStatus === 'all' ? undefined : filterStatus,
      });
      setImports(r.items);
    } catch {
      setImports([]);
    } finally {
      setImportsBusy(false);
    }
  }, [filterCompany, filterStatus]);

  useEffect(() => {
    loadImports();
  }, [loadImports, result]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return imports;
    return imports.filter(
      (r) =>
        r.filename.toLowerCase().includes(q) ||
        (r.companyName || '').toLowerCase().includes(q) ||
        (r.message || '').toLowerCase().includes(q) ||
        periodLabel(r.year, r.month).toLowerCase().includes(q),
    );
  }, [imports, search]);

  const handleFile = async (file: File | null) => {
    if (!file || !selected) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.importExcel(selected, file, { year, month });
      setResult(r);
      await onImported();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Yükleme hatası');
    } finally {
      setBusy(false);
    }
  };

  const downloadFile = async (row: ImportJob) => {
    setDlBusy(row.id);
    setErr(null);
    try {
      await api.downloadImportFile(row.id, row.filename);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Dosya indirilemedi');
    } finally {
      setDlBusy(null);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Haftalık Excel yükleme</h2>
          <p>
            Nakit akış Excel’leri genelde mail ile haftalık gelir. Dosyayı buraya yükleyin;
            sistem <strong>NAKİT AKIŞ-Haftalık</strong> sayfasını okur.
          </p>
        </div>
        <div className="toolbar">
          <button className="btn btn-ghost" type="button" onClick={() => loadImports()} disabled={importsBusy}>
            Listeyi Yenile
          </button>
        </div>
      </div>

      {subsidiaries.length === 0 ? (
        <div className="card panel empty">Önce Şirketler ekranından bir iştirak ekleyin.</div>
      ) : (
        <>
          <div className="card panel import-flow-card" style={{ marginBottom: '1rem' }}>
            <ol className="import-steps">
              <li>
                <span className="import-step-num">1</span>
                <div>
                  <strong>Mail’den Excel’i alın</strong>
                  <p>Haftalık nakit akış dosyası (.xlsx)</p>
                </div>
              </li>
              <li>
                <span className="import-step-num">2</span>
                <div>
                  <strong>İştirak ve ayı seçin</strong>
                  <p>Dosyanın ait olduğu ay (haftalar o aya yazılır)</p>
                </div>
              </li>
              <li>
                <span className="import-step-num">3</span>
                <div>
                  <strong>Yükleyin</strong>
                  <p>Aynı ay tekrar yüklenirse o ayın haftalık verisi güncellenir</p>
                </div>
              </li>
            </ol>
          </div>

          <div className="card panel" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Yeni haftalık Excel yükle</h3>
            <div className="form-grid" style={{ marginBottom: '1rem' }}>
              <div className="field">
                <label>İştirak</label>
                <select value={selected} onChange={(e) => setCompanyId(e.target.value)}>
                  {subsidiaries.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Yıl</label>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Bu haftalık dosya hangi aya ait?</label>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="alert warn" style={{ marginBottom: '1rem' }}>
              <strong>Haftalık veri · {MONTHS[month]} {year}</strong>
              <div style={{ marginTop: '0.35rem' }}>
                Dosyadaki haftalık kolonlar (HAFTA …) seçilen aya kaydedilir; diğer aylar korunur.
                Sayfa adı tercihen <strong>NAKİT AKIŞ-Haftalık</strong> olmalıdır.
              </div>
            </div>

            <div
              className={`dropzone ${drag ? 'drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                handleFile(e.dataTransfer.files?.[0] || null);
              }}
            >
              <p style={{ fontSize: '1.05rem', color: 'var(--charcoal)', fontWeight: 600 }}>
                Haftalık .xlsx dosyasını sürükleyip bırakın
              </p>
              <p>
                Mail’den gelen nakit akış Excel’i · {MONTHS[month]} {year} olarak işlenecek
              </p>
              <label className="btn btn-primary" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
                {busy ? 'İşleniyor…' : 'Excel Seç'}
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  disabled={busy}
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            {err && <div className="alert err">{err}</div>}
            {result && (
              <div className={`alert ${result.status === 'ok' ? 'ok' : 'err'}`}>
                <div>
                  <strong>{result.message}</strong>
                </div>
                <div style={{ marginTop: '0.4rem' }}>
                  Dönem: {MONTHS[result.month]} {result.year} · Satır: {result.lineCount} · Haftalık kolon:{' '}
                  {result.weekCount}
                </div>
                {result.summary && (
                  <div style={{ marginTop: '0.4rem' }}>
                    Dosya özeti — Gelir: {formatMoney(result.summary.totalInflowYear)} · Gider:{' '}
                    {formatMoney(result.summary.totalOutflowYear)}
                    {result.summary.lastBalance != null && (
                      <> · Bakiye: {formatMoney(result.summary.lastBalance)}</>
                    )}
                  </div>
                )}
                {Array.isArray(result.warnings) && result.warnings.length > 0 && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.9rem' }}>
                    Uyarılar: {result.warnings.join(' · ')}
                  </div>
                )}
                {result.status === 'ok' && result.dashboardPath && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <Link className="btn btn-primary" to={result.dashboardPath}>
                      Dashboard’da {MONTHS[result.month]} {result.year} görüntüle
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <section className="card panel">
            <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Yüklenen haftalık Excel’ler</h3>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                  {importsBusy
                    ? 'Yükleniyor…'
                    : `${filtered.length} kayıt${search || filterCompany !== 'all' || filterStatus !== 'all' ? ' (filtreli)' : ''} · mail’den gelen dosyaların arşivi`}
                </p>
              </div>
            </div>

            <div className="toolbar" style={{ marginBottom: '0.85rem', flexWrap: 'wrap' }}>
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                aria-label="Şirket filtresi"
              >
                <option value="all">Tüm şirketler</option>
                {subsidiaries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Durum filtresi"
              >
                <option value="all">Tüm durumlar</option>
                <option value="ok">Başarılı</option>
                <option value="error">Hatalı</option>
              </select>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Dosya veya şirket ara…"
                style={{ minWidth: 200, flex: 1 }}
              />
            </div>

            {filtered.length === 0 ? (
              <div className="empty">
                {importsBusy ? 'Liste yükleniyor…' : 'Henüz sistemde kayıtlı Excel yüklemesi yok.'}
              </div>
            ) : (
              <div className="import-table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tarih / Saat</th>
                      <th>Şirket</th>
                      <th>Dönem</th>
                      <th>Dosya</th>
                      <th>Durum</th>
                      <th>Mesaj</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id}>
                        <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td>{row.companyName || '—'}</td>
                        <td>{periodLabel(row.year, row.month)}</td>
                        <td>
                          <span title={row.filename}>{row.filename}</span>
                        </td>
                        <td>
                          <span className={`pill ${row.status === 'ok' ? 'ok' : 'no'}`}>
                            {row.status === 'ok' ? 'Başarılı' : 'Hata'}
                          </span>
                        </td>
                        <td style={{ maxWidth: 220, color: 'var(--muted)', fontSize: '0.85rem' }}>
                          {row.message || '—'}
                        </td>
                        <td>
                          <div className="toolbar" style={{ gap: '0.35rem', flexWrap: 'nowrap' }}>
                            {row.status === 'ok' && row.year != null && row.month != null && (
                              <Link
                                to={`/?company=${row.companyId}&year=${row.year}&month=${row.month}`}
                                className="btn btn-ghost"
                                style={{ padding: '0.25rem 0.55rem', fontSize: '0.8rem' }}
                              >
                                Dashboard
                              </Link>
                            )}
                            {row.hasFile && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.25rem 0.55rem', fontSize: '0.8rem' }}
                                disabled={dlBusy === row.id}
                                onClick={() => downloadFile(row)}
                              >
                                {dlBusy === row.id ? '…' : 'Excel’i Aç'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
