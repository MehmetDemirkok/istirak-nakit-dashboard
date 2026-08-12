import PptxGenJS from 'pptxgenjs';
import { db, type Company, type CompanyProfile } from './db.js';
import { getPeriodReport, type PeriodFilter } from './periodReport.js';

function money(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function shortMoney(n: number): string {
  if (n === 0) return '₺0';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    notation: Math.abs(n) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 0,
  }).format(n);
}

function cleanLabel(label: string, max = 32): string {
  const clean = label
    .replace(/^F-[A-J]\.\d+\.?\s*/i, '')
    .replace(/^[A-J]\.\d+\.?\s*/i, '')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

type CellOpts = {
  text: string;
  options?: Record<string, unknown>;
};

export async function buildPresentation(companyId: string, filter: PeriodFilter): Promise<Buffer> {
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId) as Company | undefined;
  if (!company) throw new Error('Şirket bulunamadı');

  const profile = (db.prepare(`SELECT * FROM company_profiles WHERE company_id = ?`).get(companyId) ||
    {}) as Partial<CompanyProfile>;

  const report = getPeriodReport(companyId, filter);
  const { kpis, categories, monthly, highlights } = report;

  const monthlyBurn = filter.month == null ? kpis.totalOutflow / 12 : kpis.totalOutflow;
  const runwayMonths = monthlyBurn > 0 ? kpis.balance / monthlyBurn : null;
  const topInflow = highlights.topInflow;
  const topOutflow = highlights.topOutflow;

  const PptxCtor = (PptxGenJS as any).default || PptxGenJS;
  const pptx: any = new PptxCtor();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'İştirak Nakit Dashboard';
  pptx.title = `${company.name} — ${report.label}`;

  const navy = '0B4DA8';
  const charcoal = '374556';
  const orange = 'E87722';
  const teal = '0D9488';
  const light = 'F4F6F8';
  const white = 'FFFFFF';
  const muted = '667788';

  const slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: light },
  });

  // ── Header ──────────────────────────────────────────────
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.58,
    fill: { color: navy },
  });
  slide.addText(`${company.name.toUpperCase()}  •  ${report.label.toUpperCase()}  •  HAFTALIK VERİ`, {
    x: 0.28,
    y: 0.12,
    w: 10.6,
    h: 0.34,
    fontSize: 13,
    bold: true,
    color: white,
    fontFace: 'Arial',
  });
  slide.addText('NAKİT AKIŞ', {
    x: 11.1,
    y: 0.14,
    w: 1.95,
    h: 0.3,
    fontSize: 11,
    color: white,
    align: 'right',
    fontFace: 'Arial',
  });

  // ── LEFT: Profile card ───────────────────────────────────
  const leftX = 0.22;
  const leftW = 3.55;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: leftX,
    y: 0.75,
    w: leftW,
    h: 3.85,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 3, opacity: 0.07, offset: 1 },
    rectRadius: 0.06,
  });
  slide.addText(company.name, {
    x: leftX + 0.16,
    y: 0.88,
    w: leftW - 0.32,
    h: 0.36,
    fontSize: 13,
    bold: true,
    color: charcoal,
    fontFace: 'Arial',
  });

  const profileRows: [string, string][] = [
    ['Dönem', `Haftalık · ${report.label}`],
    ['Kuruluş Tarihi', profile.founded_at || '—'],
    ['YK Başkanı', profile.board_chair || '—'],
    ['YK Başkan V.', profile.board_vice || '—'],
    ['Yönetim Kurulu', profile.board_members || '—'],
    ['Genel Kurul', profile.general_assembly_date || '—'],
    ['Personel', profile.personnel_count || '—'],
    ['Kredi Durumu', profile.credits || '—'],
    ['Patent', profile.patents || '—'],
  ];
  slide.addTable(
    profileRows.map(([k, v]) => [
      { text: k, options: { fontSize: 9, color: muted, fontFace: 'Arial' } },
      { text: v, options: { fontSize: 9, color: charcoal, bold: true, fontFace: 'Arial' } },
    ]),
    {
      x: leftX + 0.16,
      y: 1.3,
      w: leftW - 0.32,
      colW: [1.35, 1.85],
      border: [{ type: 'none' }, { type: 'none' }, { type: 'none' }, { type: 'none' }],
      fontFace: 'Arial',
    },
  );

  // ── LEFT: 2×2 KPI cards ──────────────────────────────────
  const kpiCards = [
    { label: 'Toplam Gelir', value: money(kpis.totalInflow), color: navy, hint: 'Haftalık' },
    { label: 'Toplam Gider', value: money(kpis.totalOutflow), color: orange, hint: 'Haftalık' },
    { label: 'Net Nakit', value: money(kpis.net), color: navy, hint: report.label },
    { label: 'Nakit Bakiye', value: money(kpis.balance), color: orange, hint: 'Dönem sonu' },
  ];
  const kpiW = (leftW - 0.12) / 2;
  const kpiH = 1.18;
  const kpiY0 = 4.75;
  kpiCards.forEach((k, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = leftX + col * (kpiW + 0.12);
    const y = kpiY0 + row * (kpiH + 0.12);
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y,
      w: kpiW,
      h: kpiH,
      fill: { color: white },
      shadow: { type: 'outer', color: '000000', blur: 3, opacity: 0.07, offset: 1 },
      rectRadius: 0.05,
    });
    slide.addShape(pptx.shapes.RECTANGLE, {
      x,
      y,
      w: 0.09,
      h: kpiH,
      fill: { color: k.color },
    });
    slide.addText(k.label, {
      x: x + 0.18,
      y: y + 0.12,
      w: kpiW - 0.28,
      h: 0.22,
      fontSize: 9,
      color: muted,
      fontFace: 'Arial',
    });
    slide.addText(k.value, {
      x: x + 0.18,
      y: y + 0.4,
      w: kpiW - 0.28,
      h: 0.36,
      fontSize: 12,
      bold: true,
      color: charcoal,
      fontFace: 'Arial',
    });
    slide.addText(k.hint, {
      x: x + 0.18,
      y: y + 0.82,
      w: kpiW - 0.28,
      h: 0.2,
      fontSize: 8,
      color: muted,
      fontFace: 'Arial',
    });
  });

  // ── MIDDLE: Gider Özeti table ────────────────────────────
  const midX = 3.95;
  const midW = 5.0;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: midX,
    y: 0.75,
    w: midW,
    h: 4.0,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 3, opacity: 0.07, offset: 1 },
    rectRadius: 0.06,
  });
  slide.addText('Gider Özeti', {
    x: midX + 0.16,
    y: 0.86,
    w: midW - 0.32,
    h: 0.28,
    fontSize: 12,
    bold: true,
    color: charcoal,
    fontFace: 'Arial',
  });

  const tableRows: CellOpts[][] = [
    [
      { text: 'Kalem', options: { bold: true, color: white, fill: { color: navy }, fontSize: 8 } },
      {
        text: 'Haftalık',
        options: { bold: true, color: white, fill: { color: navy }, fontSize: 8, align: 'right' },
      },
      {
        text: 'Aylık',
        options: { bold: true, color: white, fill: { color: navy }, fontSize: 8, align: 'right' },
      },
      {
        text: 'Yıllık',
        options: { bold: true, color: white, fill: { color: navy }, fontSize: 8, align: 'right' },
      },
    ],
  ];

  categories.forEach((c, i) => {
    const bg = i % 2 === 0 ? 'F8FAFC' : white;
    tableRows.push([
      { text: c.shortLabel, options: { fontSize: 8, color: charcoal, fill: { color: bg } } },
      {
        text: shortMoney(c.weekly),
        options: { fontSize: 8, color: charcoal, align: 'right', fill: { color: bg } },
      },
      {
        text: shortMoney(c.monthly),
        options: { fontSize: 8, color: charcoal, align: 'right', fill: { color: bg } },
      },
      {
        text: shortMoney(c.yearly),
        options: { fontSize: 8, color: charcoal, align: 'right', fill: { color: bg } },
      },
    ]);
  });

  tableRows.push([
    { text: 'Toplam Gider', options: { bold: true, fontSize: 8, color: white, fill: { color: charcoal } } },
    {
      text: shortMoney(kpis.totalOutflow / 52),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: charcoal } },
    },
    {
      text: shortMoney(filter.month == null ? kpis.totalOutflow / 12 : kpis.totalOutflow),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: charcoal } },
    },
    {
      text: shortMoney(categories.reduce((s, c) => s + c.yearly, 0)),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: charcoal } },
    },
  ]);

  tableRows.push([
    { text: 'Toplam Gelir', options: { bold: true, fontSize: 8, color: white, fill: { color: orange } } },
    {
      text: shortMoney(kpis.totalInflow / 52),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: orange } },
    },
    {
      text: shortMoney(filter.month == null ? kpis.totalInflow / 12 : kpis.totalInflow),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: orange } },
    },
    {
      text: shortMoney(kpis.totalInflow),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: orange } },
    },
  ]);

  slide.addTable(tableRows as never, {
    x: midX + 0.14,
    y: 1.2,
    w: midW - 0.28,
    colW: [1.85, 0.95, 0.95, 0.97],
    border: [{ pt: 0.4, color: 'E2E8F0' }],
    fontFace: 'Arial',
  });

  // ── MIDDLE: Monthly inflow/outflow chart ─────────────────
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: midX,
    y: 4.9,
    w: midW,
    h: 2.35,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 3, opacity: 0.07, offset: 1 },
    rectRadius: 0.06,
  });
  slide.addText('Nakit Giriş / Çıkış Bilgisi (Aylık)', {
    x: midX + 0.16,
    y: 5.0,
    w: midW - 0.32,
    h: 0.26,
    fontSize: 11,
    bold: true,
    color: charcoal,
    fontFace: 'Arial',
  });
  slide.addChart(
    pptx.charts.BAR,
    [
      {
        name: 'Giriş',
        labels: monthly.map((m) => m.month.slice(0, 3)),
        values: monthly.map((m) => m.inflow),
      },
      {
        name: 'Çıkış',
        labels: monthly.map((m) => m.month.slice(0, 3)),
        values: monthly.map((m) => m.outflow),
      },
    ],
    {
      x: midX + 0.1,
      y: 5.28,
      w: midW - 0.2,
      h: 1.85,
      barGrouping: 'clustered',
      chartColors: [navy, orange],
      showLegend: true,
      legendPos: 'b',
      valAxisHidden: false,
    },
  );

  // ── RIGHT: Dönem Özeti (mevcut içerik) ───────────────────
  const rightX = 9.15;
  const rightW = 3.95;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: rightX,
    y: 0.75,
    w: rightW,
    h: 3.85,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 3, opacity: 0.07, offset: 1 },
    rectRadius: 0.06,
  });
  slide.addText('Dönem Özeti', {
    x: rightX + 0.16,
    y: 0.88,
    w: rightW - 0.32,
    h: 0.28,
    fontSize: 12,
    bold: true,
    color: charcoal,
    fontFace: 'Arial',
  });

  const insightCards = [
    {
      label: 'Önemli Nakit Girişi',
      title: topInflow ? cleanLabel(topInflow.label) : '—',
      detail: topInflow ? money(topInflow.amount) : 'Veri yok',
      accent: navy,
    },
    {
      label: 'Önemli Nakit Çıkışı',
      title: topOutflow ? topOutflow.label : '—',
      detail: topOutflow
        ? `${(topOutflow.pct ?? 0).toFixed(0)}% · ${money(topOutflow.amount)}`
        : 'Veri yok',
      accent: orange,
    },
    {
      label: 'Runaway',
      title:
        runwayMonths != null && Number.isFinite(runwayMonths)
          ? `${runwayMonths.toFixed(1)} ay`
          : '—',
      detail: 'Nakit girişi olmadan mevcut bakiye ile',
      accent: teal,
    },
  ];

  insightCards.forEach((card, i) => {
    const y = 1.3 + i * 1.05;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: rightX + 0.16,
      y,
      w: rightW - 0.32,
      h: 0.92,
      fill: { color: 'F8FAFC' },
      rectRadius: 0.04,
    });
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: rightX + 0.16,
      y,
      w: 0.08,
      h: 0.92,
      fill: { color: card.accent },
    });
    slide.addText(card.label, {
      x: rightX + 0.36,
      y: y + 0.08,
      w: rightW - 0.6,
      h: 0.2,
      fontSize: 9,
      color: muted,
      fontFace: 'Arial',
    });
    slide.addText(card.title, {
      x: rightX + 0.36,
      y: y + 0.3,
      w: rightW - 0.6,
      h: 0.28,
      fontSize: 13,
      bold: true,
      color: charcoal,
      fontFace: 'Arial',
    });
    slide.addText(card.detail, {
      x: rightX + 0.36,
      y: y + 0.6,
      w: rightW - 0.6,
      h: 0.22,
      fontSize: 9,
      color: muted,
      fontFace: 'Arial',
    });
  });

  // ── RIGHT: Gider dağılımı pie ────────────────────────────
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: rightX,
    y: 4.75,
    w: rightW,
    h: 2.5,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 3, opacity: 0.07, offset: 1 },
    rectRadius: 0.06,
  });
  slide.addText(filter.month == null ? 'Yıllık Gider Dağılımı' : 'Gider Dağılımı', {
    x: rightX + 0.16,
    y: 4.86,
    w: rightW - 0.32,
    h: 0.26,
    fontSize: 11,
    bold: true,
    color: charcoal,
    fontFace: 'Arial',
  });

  const pieColors = [navy, orange, teal, '6366F1', 'E11D48', 'CA8A04', '64748B', '0891B2', '7C3AED'];
  const pieCats = categories
    .map((c) => ({
      name: c.shortLabel,
      value: filter.month == null ? c.yearly : c.period,
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const pieTotal = pieCats.reduce((s, c) => s + c.value, 0) || 1;

  if (pieCats.length) {
    // On-slice % labels break in small PPTX pies — keep chart clean, show % in side legend
    slide.addChart(
      pptx.charts.PIE,
      [
        {
          name: 'Gider',
          labels: pieCats.map((c) => c.name),
          values: pieCats.map((c) => c.value),
        },
      ],
      {
        x: rightX + 0.05,
        y: 5.12,
        w: 1.95,
        h: 2.0,
        showPercent: false,
        showValue: false,
        showLabel: false,
        showLegend: false,
        chartColors: pieColors,
      },
    );

    pieCats.forEach((c, i) => {
      const pct = ((c.value / pieTotal) * 100).toFixed(0);
      const y = 5.18 + i * 0.2;
      if (y > 7.05) return;
      const color = pieColors[i % pieColors.length];
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: rightX + 2.05,
        y: y + 0.04,
        w: 0.12,
        h: 0.12,
        fill: { color },
      });
      slide.addText(`${c.name}  ${pct}%`, {
        x: rightX + 2.24,
        y,
        w: 1.55,
        h: 0.2,
        fontSize: 8,
        color: charcoal,
        fontFace: 'Arial',
        valign: 'middle',
      });
    });
  }

  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return buf;
}
