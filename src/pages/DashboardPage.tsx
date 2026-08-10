import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, formatMoney, type Company } from '../api';

const COLORS = ['#0B4DA8', '#E87722', '#0D9488', '#6366F1', '#E11D48', '#CA8A04', '#64748B', '#0891B2', '#7C3AED'];

export default function DashboardPage({ companies }: { companies: Company[] }) {
  const [params, setParams] = useSearchParams();
  const parent = companies.find((c) => c.role === 'parent');
  const subsidiaries = companies.filter((c) => c.role === 'subsidiary');
  const withData = companies.filter((c) => c.hasData);

  const defaultId = params.get('company') || withData[0]?.id || parent?.id || subsidiaries[0]?.id || '';
  const [companyId, setCompanyId] = useState(defaultId);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get('company')) setCompanyId(params.get('company')!);
    else if (!companyId && defaultId) setCompanyId(defaultId);
  }, [params, defaultId]);

  useEffect(() => {
    if (!companyId) {
      setData(null);
      return;
    }
    setBusy(true);
    setErr(null);
    api
      .dashboard(companyId)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [companyId]);

  const selected = companies.find((c) => c.id === companyId);

  const download = async () => {
    if (!selected || selected.role === 'parent') return;
    try {
      await api.downloadPresentation(selected.id, `${selected.name}-nakit-akis.pptx`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'İndirme hatası');
    }
  };

  const pieData = useMemo(() => {
    const cats = data?.categories || [];
    return cats
      .filter((c: any) => (c.yearly ?? 0) > 0)
      .map((c: any) => ({ name: c.shortLabel, value: c.yearly }));
  }, [data]);

  if (companies.length === 0) {
    return (
      <>
        <div className="topbar">
          <div>
            <h2>Dashboard</h2>
            <p>Başlamak için şirket ekleyin ve Excel yükleyin.</p>
          </div>
        </div>
        <div className="card panel empty">Şirketler menüsünden ana şirket ve iştirak oluşturun.</div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>
            {data?.type === 'consolidated'
              ? 'Konsolide Dashboard'
              : selected?.name || 'Dashboard'}
          </h2>
          <p>
            {data?.type === 'consolidated'
              ? 'Tüm iştiraklerin nakit akış özeti'
              : 'İştirak nakit giriş/çıkış performansı'}
          </p>
        </div>
        <div className="toolbar">
          <span className="badge live">LOKAL VERİ</span>
          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setParams({ company: e.target.value });
            }}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.45rem 0.7rem',
              background: '#fff',
            }}
          >
            {parent && <option value={parent.id}>Konsolide — {parent.name}</option>}
            {subsidiaries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {selected?.role === 'subsidiary' && (
            <button className="btn btn-accent" type="button" onClick={download}>
              PPTX İndir
            </button>
          )}
        </div>
      </div>

      {err && <div className="alert err">{err}</div>}
      {busy && <div className="alert warn">Yükleniyor…</div>}

      {data?.type === 'subsidiary' && !data.hasData && (
        <div className="card panel empty">Bu iştirak için henüz Excel yüklenmedi. Excel Yükle ekranına gidin.</div>
      )}

      {data?.type === 'subsidiary' && data.hasData && (
        <>
          <div className="grid-kpi">
            <Kpi label="Toplam Gelir" value={formatMoney(data.kpis.totalInflow)} accent="#0B4DA8" />
            <Kpi label="Toplam Gider" value={formatMoney(data.kpis.totalOutflow)} accent="#E87722" />
            <Kpi label="Net Nakit" value={formatMoney(data.kpis.net)} accent="#374556" />
            <Kpi label="Nakit Bakiye" value={formatMoney(data.kpis.balance)} accent="#0D9488" />
          </div>

          <div className="grid-charts">
            <section className="card panel">
              <h3>Aylık Nakit Giriş / Çıkış ({data.kpis.year})</h3>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tickFormatter={(v) => String(v).slice(0, 3)} fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => compact(v)} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend />
                    <Bar dataKey="inflow" name="Giriş" fill="#0B4DA8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="outflow" name="Çıkış" fill="#E87722" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card panel">
              <h3>Gider Dağılımı</h3>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {pieData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid-2">
            <section className="card panel">
              <h3>Haftalık Nakit Bakiye</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={data.weekly.slice(0, 26)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" hide={data.weekly.length > 16} fontSize={10} />
                    <YAxis fontSize={11} tickFormatter={(v) => compact(v)} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Line type="monotone" dataKey="balance" name="Bakiye" stroke="#0B4DA8" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card panel">
              <h3>Kategori Özeti (Yıllık)</h3>
              <table className="data">
                <thead>
                  <tr>
                    <th>Kalem</th>
                    <th>Haftalık*</th>
                    <th>Aylık*</th>
                    <th>Yıllık</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c: any) => (
                    <tr key={c.key}>
                      <td>{c.shortLabel}</td>
                      <td>{formatMoney(c.weekly)}</td>
                      <td>{formatMoney(c.monthly)}</td>
                      <td>{formatMoney(c.yearly)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                * Son dolu dönem; yıllık toplam detay satırlarından.
              </p>
            </section>
          </div>
        </>
      )}

      {data?.type === 'consolidated' && (
        <>
          <div className="grid-kpi">
            <Kpi label="Konsolide Gelir" value={formatMoney(data.totals.totalInflow)} accent="#0B4DA8" />
            <Kpi label="Konsolide Gider" value={formatMoney(data.totals.totalOutflow)} accent="#E87722" />
            <Kpi label="Konsolide Net" value={formatMoney(data.totals.net)} accent="#374556" />
            <Kpi label="Toplam Bakiye" value={formatMoney(data.totals.balance)} accent="#0D9488" />
          </div>

          <div className="grid-charts">
            <section className="card panel">
              <h3>Konsolide Aylık Giriş / Çıkış</h3>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tickFormatter={(v) => String(v).slice(0, 3)} fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => compact(v)} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend />
                    <Bar dataKey="inflow" name="Giriş" fill="#0B4DA8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="outflow" name="Çıkış" fill="#E87722" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card panel">
              <h3>Konsolide Gider Dağılımı</h3>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={data.categories.filter((c: any) => c.yearly > 0).map((c: any) => ({
                        name: c.shortLabel,
                        value: c.yearly,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={95}
                    >
                      {data.categories.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section className="card panel">
            <h3>İştirak Karşılaştırma</h3>
            {data.comparison.length === 0 ? (
              <div className="empty">İştirak verisi yok.</div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>İştirak</th>
                    <th>Gelir</th>
                    <th>Gider</th>
                    <th>Net</th>
                    <th>Bakiye</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparison.map((row: any) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{formatMoney(row.totalInflow)}</td>
                      <td>{formatMoney(row.totalOutflow)}</td>
                      <td>{formatMoney(row.net)}</td>
                      <td>{formatMoney(row.balance)}</td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => {
                            setCompanyId(row.id);
                            setParams({ company: row.id });
                          }}
                        >
                          Detay
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card kpi" style={{ ['--accent' as string]: accent }}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function compact(v: number) {
  return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}
