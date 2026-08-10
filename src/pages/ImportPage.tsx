import { useMemo, useState } from 'react';
import { api, formatMoney, type Company } from '../api';

export default function ImportPage({
  companies,
  onImported,
}: {
  companies: Company[];
  onImported: () => Promise<void>;
}) {
  const subsidiaries = useMemo(() => companies.filter((c) => c.role === 'subsidiary'), [companies]);
  const [companyId, setCompanyId] = useState(subsidiaries[0]?.id || '');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = companyId || subsidiaries[0]?.id || '';

  const handleFile = async (file: File | null) => {
    if (!file || !selected) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.importExcel(selected, file);
      setResult(r);
      await onImported();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Yükleme hatası');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Excel İçe Aktarma</h2>
          <p>
            Örnek şablondaki <strong>NAKİT AKIŞ-Haftalık</strong> sayfası okunur; aylık özetler hesaplanır.
          </p>
        </div>
      </div>

      {subsidiaries.length === 0 ? (
        <div className="card panel empty">Önce Şirketler ekranından bir iştirak ekleyin.</div>
      ) : (
        <div className="card panel">
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
              .xlsx dosyasını sürükleyip bırakın
            </p>
            <p>veya bilgisayarınızdan seçin</p>
            <label className="btn btn-primary" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
              {busy ? 'İşleniyor…' : 'Dosya Seç'}
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
                Yıl: {result.year} · Satır: {result.lineCount} · Hafta: {result.weekCount}
              </div>
              {result.summary && (
                <div style={{ marginTop: '0.4rem' }}>
                  Gelir: {formatMoney(result.summary.totalInflowYear)} · Gider:{' '}
                  {formatMoney(result.summary.totalOutflowYear)} · Net:{' '}
                  {formatMoney(result.summary.netYear)}
                </div>
              )}
              {result.warnings?.length > 0 && (
                <ul>
                  {result.warnings.map((w: string) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {result.errors?.length > 0 && (
                <ul>
                  {result.errors.map((w: string) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
