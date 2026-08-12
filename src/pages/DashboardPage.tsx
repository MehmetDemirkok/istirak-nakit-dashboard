import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, formatMoney, type Company } from '../api';

const IN = '#0B4DA8';
const OUT = '#E87722';
const NET = '#0D9488';
const MUTED = '#94A3B8';
const GRID = '#E8EEF5';
const CAT_COLORS = ['#0B4DA8', '#E87722', '#0D9488', '#475569', '#B45309', '#0369A1', '#7C2D12', '#334155', '#0F766E'];

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

const MONTHS_ASCII = [
  'Ocak',
  'Subat',
  'Mart',
  'Nisan',
  'Mayis',
  'Haziran',
  'Temmuz',
  'Agustos',
  'Eylul',
  'Ekim',
  'Kasim',
  'Aralik',
];

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

  const yearFromUrl = params.get('year');
  const monthFromUrl = params.get('month');
  const [periodYear, setPeriodYear] = useState<number>(
    yearFromUrl ? Number(yearFromUrl) : new Date().getFullYear(),
  );
  const [periodMonth, setPeriodMonth] = useState<number | 'all'>(
    monthFromUrl && monthFromUrl !== 'all' ? Number(monthFromUrl) : new Date().getMonth(),
  );
  const [exporting, setExporting] = useState<string | null>(null);
  const [periodReady, setPeriodReady] = useState(!!yearFromUrl);
  const [tableSort, setTableSort] = useState('period-desc');

  useEffect(() => {
    if (params.get('company')) setCompanyId(params.get('company')!);
    else if (!companyId && defaultId) setCompanyId(defaultId);
  }, [params, defaultId]);

  useEffect(() => {
    if (yearFromUrl) setPeriodYear(Number(yearFromUrl));
    if (monthFromUrl) {
      setPeriodMonth(monthFromUrl === 'all' ? 'all' : Number(monthFromUrl));
      setPeriodReady(true);
    }
  }, [yearFromUrl, monthFromUrl]);

  useEffect(() => {
    if (!companyId || yearFromUrl) {
      if (yearFromUrl) setPeriodReady(true);
      return;
    }
    let cancelled = false;
    api
      .listPeriods(companyId)
      .then(({ latest }) => {
        if (cancelled) return;
        if (latest) {
          setPeriodYear(latest.year);
          setPeriodMonth(latest.month);
          setParams({
            company: companyId,
            year: String(latest.year),
            month: String(latest.month),
          });
        }
        setPeriodReady(true);
      })
      .catch(() => {
        if (!cancelled) setPeriodReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !periodReady) {
      setData(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setErr(null);
    api
      .dashboard(companyId, { year: periodYear, month: periodMonth })
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, periodYear, periodMonth, periodReady]);

  const selected = companies.find((c) => c.id === companyId);
  const periodTitle =
    periodMonth === 'all' ? `${periodYear} Yıllık` : `${MONTHS[periodMonth]} ${periodYear}`;
  const weeklyHint = `Haftalık · ${periodTitle}`;

  const shortLabel = (label: string, max = 28) => {
    const clean = label
      .replace(/^F-[A-J]\.\d+\.?\s*/i, '')
      .replace(/^[A-J]\.\d+\.?\s*/i, '')
      .trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
  };

  const syncParams = (next: { company?: string; year?: number; month?: number | 'all' }) => {
    setParams({
      company: next.company ?? companyId,
      year: String(next.year ?? periodYear),
      month: String(next.month ?? periodMonth),
    });
  };

  const periodFileLabel =
    periodMonth === 'all'
      ? `${periodYear}-Yillik`
      : `${periodYear}-${MONTHS_ASCII[periodMonth]}`;

  const download = async (format: 'pptx' | 'pdf' | 'xlsx') => {
    if (!selected || selected.role === 'parent') return;
    setExporting(format);
    setErr(null);
    try {
      const safe = selected.name.replace(/[^\w\-]+/gi, '_');
      await api.downloadExport(
        selected.id,
        format,
        { year: periodYear, month: periodMonth },
        `${safe}-${periodFileLabel}.${format === 'xlsx' ? 'xlsx' : format}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'İndirme hatası');
    } finally {
      setExporting(null);
    }
  };

  const changeCompany = (id: string) => {
    setCompanyId(id);
    setPeriodReady(false);
    api
      .listPeriods(id)
      .then(({ latest }) => {
        if (latest) {
          setPeriodYear(latest.year);
          setPeriodMonth(latest.month);
          setParams({
            company: id,
            year: String(latest.year),
            month: String(latest.month),
          });
        } else {
          setParams({
            company: id,
            year: String(periodYear),
            month: String(periodMonth),
          });
        }
        setPeriodReady(true);
      })
      .catch(() => {
        setParams({ company: id, year: String(periodYear), month: String(periodMonth) });
        setPeriodReady(true);
      });
  };

  const yearOptions = useMemo(() => {
    const fromPeriods = (data?.periods || []).map((p: { year: number }) => p.year);
    const base = data?.dataYear || data?.year || periodYear;
    return Array.from(
      new Set([...fromPeriods, base - 1, base, base + 1, periodYear, 2025, 2026]),
    ).sort((a, b) => a - b);
  }, [data, periodYear]);

  const loadedMonths = useMemo(() => {
    return new Set<number>(
      (data?.periods || [])
        .filter((p: { year: number }) => p.year === periodYear)
        .map((p: { month: number }) => p.month),
    );
  }, [data, periodYear]);

  const flowSeries = useMemo(() => {
    if (!data) return [];
    return (data.monthly || []).map((m: any) => ({
      label: String(m.month).slice(0, 3),
      full: m.month,
      inflow: m.inflow || 0,
      outflow: m.outflow || 0,
      net: m.net || 0,
      selected: !!m.selected,
      monthIndex: m.monthIndex,
    }));
  }, [data]);

  const pieData = useMemo(() => {
    const cats = data?.categories || [];
    const rows = cats
      .filter((c: any) => (c.period ?? c.yearly ?? 0) > 0)
      .map((c: any) => ({
        key: c.key,
        name: c.shortLabel,
        value: c.period ?? c.yearly,
      }))
      .sort((a: any, b: any) => b.value - a.value);
    const total = rows.reduce((s: number, r: any) => s + r.value, 0) || 1;
    return rows.map((r: any) => ({ ...r, pct: (r.value / total) * 100 }));
  }, [data]);

  const categoryBars = useMemo(() => {
    const cats = data?.categories || [];
    return [...cats]
      .map((c: any, i: number) => ({
        key: c.key,
        name: c.shortLabel,
        period: c.period ?? c.monthly ?? 0,
        yearly: c.yearly ?? 0,
        monthly: c.monthly ?? 0,
        colorIndex: i,
      }))
      .sort((a, b) => b.period - a.period);
  }, [data]);

  const sortedCategoryRows = useMemo(() => {
    const rows = [...categoryBars];
    const cmp = (a: number, b: number) => a - b;
    switch (tableSort) {
      case 'period-asc':
        rows.sort((a, b) => cmp(a.period, b.period));
        break;
      case 'monthly-desc':
        rows.sort((a, b) => cmp(b.monthly, a.monthly));
        break;
      case 'monthly-asc':
        rows.sort((a, b) => cmp(a.monthly, b.monthly));
        break;
      case 'yearly-desc':
        rows.sort((a, b) => cmp(b.yearly, a.yearly));
        break;
      case 'yearly-asc':
        rows.sort((a, b) => cmp(a.yearly, b.yearly));
        break;
      case 'name-asc':
        rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        break;
      case 'name-desc':
        rows.sort((a, b) => b.name.localeCompare(a.name, 'tr'));
        break;
      case 'period-desc':
      default:
        rows.sort((a, b) => cmp(b.period, a.period));
        break;
    }
    return rows;
  }, [categoryBars, tableSort]);

  const insights = useMemo(() => {
    if (!data?.kpis && !data?.totals) return null;
    const k = data.type === 'consolidated' ? data.totals : data.kpis;
    const inflow = k.totalInflow || 0;
    const outflow = k.totalOutflow || 0;
    const net = k.net ?? inflow - outflow;
    const coverage = outflow > 0 ? inflow / outflow : inflow > 0 ? 99 : 0;
    const netRate = inflow > 0 ? (net / inflow) * 100 : 0;
    const balance = k.balance ?? 0;
    const monthsFilled = loadedMonths.size;

    const hl = data.highlights;
    const topInflow = hl?.topInflow
      ? { name: shortLabel(hl.topInflow.label), value: hl.topInflow.amount }
      : null;
    const topOutflow = hl?.topOutflow
      ? {
          name: hl.topOutflow.label,
          value: hl.topOutflow.amount,
          pct: hl.topOutflow.pct ?? 0,
        }
      : pieData[0]
        ? { name: pieData[0].name, value: pieData[0].value, pct: pieData[0].pct }
        : null;

    const monthlyBurn =
      periodMonth === 'all'
        ? outflow / Math.max(monthsFilled || 12, 1)
        : outflow;
    const runwayMonths = monthlyBurn > 0 ? balance / monthlyBurn : null;

    return {
      inflow,
      outflow,
      net,
      coverage,
      netRate,
      balance,
      monthsFilled,
      topInflow,
      topOutflow,
      runwayMonths,
      monthlyBurn,
    };
  }, [data, pieData, loadedMonths, periodMonth]);

  if (companies.length === 0) {
    return (
      <div className="dash">
        <header className="dash-head">
          <div>
            <p className="dash-kicker">Nakit akış takibi</p>
            <h2>Dashboard</h2>
            <p className="dash-sub">Başlamak için şirket ekleyin ve Excel yükleyin.</p>
          </div>
        </header>
        <div className="card panel empty">
          <Link to="/companies" className="btn btn-primary">
            Şirketler’e git
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="dash-head-main">
          <p className="dash-kicker">Nakit akış takibi</p>
          <h2>
            {data?.type === 'consolidated' ? 'Konsolide görünüm' : selected?.name || 'Dashboard'}
          </h2>
          <p className="dash-sub">
            <span className="dash-period-chip">{data?.periodLabel || periodTitle}</span>
            {data?.type === 'consolidated'
              ? ' · tüm iştirakler'
              : ' · haftalık veri · giriş / çıkış / bakiye'}
            {busy ? ' · yükleniyor…' : ''}
          </p>
        </div>

        <div className="dash-controls">
          <span className="badge live">LOKAL VERİ</span>
          <DownSelect
            ariaLabel="Şirket"
            value={companyId}
            options={[
              ...(parent ? [{ value: parent.id, label: `Konsolide — ${parent.name}` }] : []),
              ...subsidiaries.map((s) => ({ value: s.id, label: s.name })),
            ]}
            onChange={changeCompany}
          />
          <DownSelect
            ariaLabel="Yıl"
            value={String(periodYear)}
            options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
            onChange={(v) => {
              const y = Number(v);
              setPeriodYear(y);
              syncParams({ year: y });
            }}
          />
          <DownSelect
            ariaLabel="Ay"
            value={periodMonth === 'all' ? 'all' : String(periodMonth)}
            options={[
              { value: 'all', label: 'Tüm yıl' },
              ...MONTHS.map((m, i) => ({
                value: String(i),
                label: `${m}${loadedMonths.has(i) ? ' ●' : ''}`,
              })),
            ]}
            onChange={(v) => {
              const m = v === 'all' ? 'all' : Number(v);
              setPeriodMonth(m);
              syncParams({ month: m });
            }}
          />
          {selected?.role === 'subsidiary' && data?.hasData && (
            <div className="dash-export">
              <button className="btn btn-accent" type="button" disabled={!!exporting} onClick={() => download('pptx')}>
                {exporting === 'pptx' ? '…' : 'PPTX'}
              </button>
              <button className="btn btn-primary" type="button" disabled={!!exporting} onClick={() => download('pdf')}>
                {exporting === 'pdf' ? '…' : 'PDF'}
              </button>
              <button className="btn btn-ghost" type="button" disabled={!!exporting} onClick={() => download('xlsx')}>
                {exporting === 'xlsx' ? '…' : 'Excel'}
              </button>
            </div>
          )}
        </div>
      </header>

      {err && <div className="alert err">{err}</div>}

      <div className="dash-months" role="tablist" aria-label="Ay seçimi">
        <button
          type="button"
          className={`dash-month ${periodMonth === 'all' ? 'active' : ''}`}
          onClick={() => {
            setPeriodMonth('all');
            syncParams({ month: 'all' });
          }}
        >
          Yıl
        </button>
        {MONTHS.map((m, i) => (
          <button
            key={m}
            type="button"
            className={`dash-month ${periodMonth === i ? 'active' : ''} ${loadedMonths.has(i) ? 'has-data' : ''}`}
            onClick={() => {
              setPeriodMonth(i);
              syncParams({ month: i });
            }}
            title={loadedMonths.has(i) ? 'Veri var' : 'Veri yok / boş'}
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>

      {data?.type === 'subsidiary' && !data.hasData && (
        <div className="card panel empty">
          Bu iştirak için henüz Excel yok.{' '}
          <Link to="/import" className="btn btn-primary" style={{ marginLeft: 8 }}>
            Excel Yükle
          </Link>
        </div>
      )}

      {data?.type === 'subsidiary' && data.hasData && !data.hasPeriodData && (
        <div className="card panel empty">
          <p>
            <strong>{periodYear}</strong> için veri bulunamadı.
          </p>
          {data.latest && (
            <button
              className="btn btn-primary"
              type="button"
              style={{ marginTop: '0.75rem' }}
              onClick={() => {
                setPeriodYear(data.latest.year);
                setPeriodMonth(data.latest.month);
                syncParams({ year: data.latest.year, month: data.latest.month });
              }}
            >
              Son yükleme: {MONTHS[data.latest.month]} {data.latest.year}
            </button>
          )}
        </div>
      )}

      {data?.type === 'subsidiary' && data.hasData && data.hasPeriodData && insights && (
        <>
          <div className="dash-kpi-grid">
            <KpiCard
              label="Gelir"
              value={formatMoney(insights.inflow)}
              hint={weeklyHint}
              tone="in"
            />
            <KpiCard
              label="Gider"
              value={formatMoney(insights.outflow)}
              hint={weeklyHint}
              tone="out"
            />
            <KpiCard
              label="Net nakit"
              value={formatMoney(insights.net)}
              hint={`${insights.netRate >= 0 ? '+' : ''}${insights.netRate.toFixed(1)}% marj`}
              tone={insights.net >= 0 ? 'net' : 'out'}
            />
            <KpiCard
              label="Bakiye"
              value={formatMoney(insights.balance)}
              hint={`Karşılama ${insights.coverage.toFixed(2)}x`}
              tone="bal"
            />
          </div>

          <div className="dash-insight-row">
            <div className="dash-insight">
              <span className="dash-insight-label">Önemli nakit girişi</span>
              <strong>{insights.topInflow ? insights.topInflow.name : '—'}</strong>
              <span>
                {insights.topInflow
                  ? formatMoney(insights.topInflow.value)
                  : 'Veri yok'}
              </span>
            </div>
            <div className="dash-insight">
              <span className="dash-insight-label">Önemli nakit çıkışı</span>
              <strong>{insights.topOutflow ? insights.topOutflow.name : '—'}</strong>
              <span>
                {insights.topOutflow
                  ? `${insights.topOutflow.pct.toFixed(0)}% · ${formatMoney(insights.topOutflow.value)}`
                  : 'Veri yok'}
              </span>
            </div>
            <div className="dash-insight">
              <span className="dash-insight-label">Runaway</span>
              <strong>
                {insights.runwayMonths != null && Number.isFinite(insights.runwayMonths)
                  ? `${insights.runwayMonths.toFixed(1)} ay`
                  : '—'}
              </strong>
              <span>Nakit girişi olmadan mevcut bakiye ile</span>
            </div>
          </div>

          <div className="dash-main-grid">
            <section className="card dash-panel dash-panel-wide">
              <div className="dash-panel-head">
                <div>
                  <h3>Aylık nakit akışı · {periodYear}</h3>
                  <p>Giriş, çıkış ve net hareket · seçili ay vurgulu</p>
                </div>
              </div>
              <div className="dash-chart tall">
                <ResponsiveContainer>
                  <ComposedChart
                    data={flowSeries}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    onClick={(state: any) => {
                      const idx = state?.activePayload?.[0]?.payload?.monthIndex;
                      if (typeof idx === 'number') {
                        setPeriodMonth(idx);
                        syncParams({ month: idx });
                      }
                    }}
                  >
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
                    <Tooltip content={<MoneyTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="inflow" name="Giriş" radius={[4, 4, 0, 0]} maxBarSize={28} cursor="pointer">
                      {flowSeries.map((row: any, i: number) => (
                        <Cell key={i} fill={periodMonth === 'all' || row.selected ? IN : '#B7CFE8'} />
                      ))}
                    </Bar>
                    <Bar dataKey="outflow" name="Çıkış" radius={[4, 4, 0, 0]} maxBarSize={28} cursor="pointer">
                      {flowSeries.map((row: any, i: number) => (
                        <Cell key={i} fill={periodMonth === 'all' || row.selected ? OUT : '#F3D0B3'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="net" name="Net" stroke={NET} strokeWidth={2.25} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h3>Gider dağılımı</h3>
                  <p>{periodTitle}</p>
                </div>
              </div>
              <div className="dash-chart">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {pieData.map((_: any, i: number) => (
                        <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<MoneyTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="dash-pie-legend">
                {pieData.slice(0, 6).map((row: any, i: number) => (
                  <li key={row.key || row.name}>
                    <span className="swatch" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    <span className="name">{row.name}</span>
                    <span className="pct">{row.pct.toFixed(0)}%</span>
                    <span className="amt">{formatMoney(row.value)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card dash-panel" style={{ marginTop: '1rem' }}>
            <div className="dash-panel-head">
              <div>
                <h3>Kalem tablosu</h3>
                <p>Dönem / aylık / yıllık özet</p>
              </div>
              <DownSelect
                ariaLabel="Sıralama"
                value={tableSort}
                options={[
                  { value: 'period-desc', label: 'Dönem · yüksek → düşük' },
                  { value: 'period-asc', label: 'Dönem · düşük → yüksek' },
                  { value: 'monthly-desc', label: 'Aylık · yüksek → düşük' },
                  { value: 'monthly-asc', label: 'Aylık · düşük → yüksek' },
                  { value: 'yearly-desc', label: 'Yıllık · yüksek → düşük' },
                  { value: 'yearly-asc', label: 'Yıllık · düşük → yüksek' },
                  { value: 'name-asc', label: 'Kalem · A → Z' },
                  { value: 'name-desc', label: 'Kalem · Z → A' },
                ]}
                onChange={setTableSort}
              />
            </div>
            <div className="dash-table-wrap">
              <table className="data dash-table">
                <thead>
                  <tr>
                    <th>Kalem</th>
                    <th>Dönem</th>
                    <th>Aylık</th>
                    <th>Yıllık</th>
                    <th>Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCategoryRows.map((c) => {
                    const share =
                      insights.outflow > 0 ? ((c.period / insights.outflow) * 100).toFixed(1) : '0.0';
                    const color = CAT_COLORS[c.colorIndex % CAT_COLORS.length];
                    return (
                      <tr key={c.key}>
                        <td>
                          <span className="dash-table-cat">
                            <i style={{ background: color }} />
                            {c.name}
                          </span>
                        </td>
                        <td>{formatMoney(c.period)}</td>
                        <td>{formatMoney(c.monthly)}</td>
                        <td>{formatMoney(c.yearly)}</td>
                        <td>{share}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {data?.type === 'consolidated' && insights && (
        <>
          <div className="dash-kpi-grid">
            <KpiCard label="Konsolide gelir" value={formatMoney(insights.inflow)} hint={periodTitle} tone="in" />
            <KpiCard label="Konsolide gider" value={formatMoney(insights.outflow)} hint={periodTitle} tone="out" />
            <KpiCard
              label="Konsolide net"
              value={formatMoney(insights.net)}
              hint={`${insights.netRate >= 0 ? '+' : ''}${insights.netRate.toFixed(1)}%`}
              tone={insights.net >= 0 ? 'net' : 'out'}
            />
            <KpiCard label="Toplam bakiye" value={formatMoney(insights.balance)} hint="Tüm iştirakler" tone="bal" />
          </div>

          <div className="dash-main-grid">
            <section className="card dash-panel dash-panel-wide">
              <div className="dash-panel-head">
                <div>
                  <h3>Konsolide aylık akış</h3>
                  <p>{periodYear} · iştirak toplamı</p>
                </div>
              </div>
              <div className="dash-chart tall">
                <ResponsiveContainer>
                  <ComposedChart data={data.monthly || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(v) => String(v).slice(0, 3)}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} width={52} />
                    <Tooltip content={<MoneyTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="inflow" name="Giriş" radius={[4, 4, 0, 0]} maxBarSize={26}>
                      {(data.monthly || []).map((row: any, i: number) => (
                        <Cell key={i} fill={periodMonth === 'all' || row.selected ? IN : '#B7CFE8'} />
                      ))}
                    </Bar>
                    <Bar dataKey="outflow" name="Çıkış" radius={[4, 4, 0, 0]} maxBarSize={26}>
                      {(data.monthly || []).map((row: any, i: number) => (
                        <Cell key={i} fill={periodMonth === 'all' || row.selected ? OUT : '#F3D0B3'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="net" name="Net" stroke={NET} strokeWidth={2.25} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h3>Konsolide gider</h3>
                  <p>{periodTitle}</p>
                </div>
              </div>
              <div className="dash-chart">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {pieData.map((_: any, i: number) => (
                        <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<MoneyTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="dash-pie-legend">
                {pieData.slice(0, 6).map((row: any, i: number) => (
                  <li key={row.key || row.name}>
                    <span className="swatch" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    <span className="name">{row.name}</span>
                    <span className="pct">{row.pct.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card dash-panel" style={{ marginTop: '1rem' }}>
            <div className="dash-panel-head">
              <div>
                <h3>İştirak karşılaştırma</h3>
                <p>{periodTitle} · net sıralı</p>
              </div>
            </div>
            {(data.comparison || []).length === 0 ? (
              <div className="empty">İştirak verisi yok.</div>
            ) : (
              <>
                <div className="dash-chart mid" style={{ marginBottom: '1rem' }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={[...(data.comparison || [])].sort(
                        (a: any, b: any) => (b.net || 0) - (a.net || 0),
                      )}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid stroke={GRID} horizontal={false} />
                      <XAxis type="number" tickFormatter={compact} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fill: '#374556', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<MoneyTooltip />} />
                      <Bar dataKey="totalInflow" name="Gelir" fill={IN} radius={[0, 4, 4, 0]} barSize={10} />
                      <Bar dataKey="totalOutflow" name="Gider" fill={OUT} radius={[0, 4, 4, 0]} barSize={10} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="dash-table-wrap">
                  <table className="data dash-table">
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
                          <td className={row.net >= 0 ? 'pos' : 'neg'}>{formatMoney(row.net)}</td>
                          <td>{formatMoney(row.balance)}</td>
                          <td>
                            <button className="btn btn-ghost" type="button" onClick={() => changeCompany(row.id)}>
                              Detay
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'in' | 'out' | 'net' | 'bal';
}) {
  return (
    <article className={`dash-kpi tone-${tone}`}>
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      <div className="dash-kpi-hint">{hint}</div>
    </article>
  );
}

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tooltip">
      <div className="dash-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="dash-tooltip-row">
          <span style={{ color: p.color || p.fill }}>{p.name}</span>
          <strong>{formatMoney(Number(p.value) || 0)}</strong>
        </div>
      ))}
    </div>
  );
}

const selectStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.45rem 0.7rem',
  background: '#fff',
};

function DownSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`down-select ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="down-select-trigger"
        style={selectStyle}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.label ?? '—'}</span>
        <span className="down-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul className="down-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`down-select-option ${o.value === value ? 'active' : ''}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function compact(v: number) {
  return new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}
