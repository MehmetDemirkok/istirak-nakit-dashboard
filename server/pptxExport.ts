import PptxGenJS from 'pptxgenjs';
import { db, type Company, type CompanyProfile } from './db.js';
import { getCategoryTotals, getKpis, getMonthlySeries, getWeeklyBalanceSeries } from './analytics.js';

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

type CellOpts = {
  text: string;
  options?: Record<string, unknown>;
};

export async function buildPresentation(companyId: string): Promise<Buffer> {
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId) as Company | undefined;
  if (!company) throw new Error('Şirket bulunamadı');

  const profile = (db.prepare(`SELECT * FROM company_profiles WHERE company_id = ?`).get(companyId) ||
    {}) as Partial<CompanyProfile>;

  const kpis = getKpis(companyId);
  const categories = getCategoryTotals(companyId);
  const monthly = getMonthlySeries(companyId);
  const weekly = getWeeklyBalanceSeries(companyId).slice(0, 16);

  const PptxCtor = (PptxGenJS as any).default || PptxGenJS;
  const pptx: any = new PptxCtor();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'İştirak Nakit Dashboard';
  pptx.title = `${company.name} — Nakit Akış Sunumu`;

  const navy = '0B4DA8';
  const charcoal = '374556';
  const orange = 'E87722';
  const light = 'F4F6F8';
  const white = 'FFFFFF';

  const slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: light },
  });

  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.7,
    fill: { color: navy },
  });
  slide.addText(`${company.name.toUpperCase()}  •  NAKİT AKIŞ DASHBOARD`, {
    x: 0.3,
    y: 0.15,
    w: 10,
    h: 0.4,
    fontSize: 16,
    bold: true,
    color: white,
    fontFace: 'Arial',
  });
  slide.addText(`${kpis.year}`, {
    x: 11.5,
    y: 0.18,
    w: 1.5,
    h: 0.35,
    fontSize: 14,
    color: white,
    align: 'right',
    fontFace: 'Arial',
  });

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.25,
    y: 0.9,
    w: 3.4,
    h: 3.2,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 4, opacity: 0.08, offset: 1 },
    rectRadius: 0.08,
  });
  slide.addText(company.name, {
    x: 0.4,
    y: 1.0,
    w: 3.1,
    h: 0.35,
    fontSize: 14,
    bold: true,
    color: charcoal,
    fontFace: 'Arial',
  });

  const profileRows: [string, string][] = [
    ['Kuruluş Tarihi', profile.founded_at || '—'],
    ['YK Başkanı', profile.board_chair || '—'],
    ['YK Başkan V.', profile.board_vice || '—'],
    ['Yönetim Kurulu', profile.board_members || '—'],
    ['Genel Kurul', profile.general_assembly_date || '—'],
    ['Personel', profile.personnel_count || '—'],
    ['Kredi Durumu', profile.credits || '—'],
    ['Patent', profile.patents || '—'],
    ['Proje Sayısı', profile.project_count || '—'],
  ];

  slide.addTable(
    profileRows.map(([k, v]) => [
      { text: k, options: { fontSize: 9, color: '667788', fontFace: 'Arial' } },
      { text: v, options: { fontSize: 9, color: charcoal, bold: true, fontFace: 'Arial' } },
    ]),
    {
      x: 0.4,
      y: 1.4,
      w: 3.1,
      colW: [1.4, 1.7],
      border: [{ type: 'none' }, { type: 'none' }, { type: 'none' }, { type: 'none' }],
      fontFace: 'Arial',
    },
  );

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.25,
    y: 4.25,
    w: 3.4,
    h: 3.0,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 4, opacity: 0.08, offset: 1 },
    rectRadius: 0.08,
  });
  slide.addText('Gider Özeti', {
    x: 0.4,
    y: 4.35,
    w: 3.1,
    h: 0.3,
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
      { text: c.shortLabel, options: { fontSize: 7, color: charcoal, fill: { color: bg } } },
      {
        text: shortMoney(c.weekly),
        options: { fontSize: 7, color: charcoal, align: 'right', fill: { color: bg } },
      },
      {
        text: shortMoney(c.monthly),
        options: { fontSize: 7, color: charcoal, align: 'right', fill: { color: bg } },
      },
      {
        text: shortMoney(c.yearly),
        options: { fontSize: 7, color: charcoal, align: 'right', fill: { color: bg } },
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
      text: shortMoney(kpis.totalOutflow / 12),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: charcoal } },
    },
    {
      text: shortMoney(kpis.totalOutflow),
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
      text: shortMoney(kpis.totalInflow / 12),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: orange } },
    },
    {
      text: shortMoney(kpis.totalInflow),
      options: { bold: true, fontSize: 8, color: white, align: 'right', fill: { color: orange } },
    },
  ]);

  slide.addTable(tableRows as never, {
    x: 0.35,
    y: 4.7,
    w: 3.2,
    colW: [1.15, 0.68, 0.68, 0.69],
    border: [{ pt: 0.5, color: 'E2E8F0' }],
    fontFace: 'Arial',
  });

  const kpiCards = [
    { label: 'Toplam Gelir', value: money(kpis.totalInflow), color: navy },
    { label: 'Toplam Gider', value: money(kpis.totalOutflow), color: orange },
    { label: 'Net Nakit', value: money(kpis.net), color: charcoal },
    { label: 'Nakit Bakiye', value: money(kpis.balance), color: '0D9488' },
  ];
  kpiCards.forEach((k, i) => {
    const x = 3.9 + i * 2.3;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 0.9,
      w: 2.15,
      h: 1.0,
      fill: { color: white },
      shadow: { type: 'outer', color: '000000', blur: 4, opacity: 0.08, offset: 1 },
      rectRadius: 0.08,
    });
    slide.addShape(pptx.shapes.RECTANGLE, {
      x,
      y: 0.9,
      w: 0.1,
      h: 1.0,
      fill: { color: k.color },
    });
    slide.addText(k.label, {
      x: x + 0.2,
      y: 1.0,
      w: 1.8,
      h: 0.25,
      fontSize: 9,
      color: '667788',
      fontFace: 'Arial',
    });
    slide.addText(k.value, {
      x: x + 0.2,
      y: 1.3,
      w: 1.8,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: charcoal,
      fontFace: 'Arial',
    });
  });

  const pieData = categories
    .filter((c) => c.yearly > 0)
    .map((c) => ({ name: c.shortLabel, labels: [c.shortLabel], values: [c.yearly] }));

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 3.9,
    y: 2.1,
    w: 4.5,
    h: 3.1,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 4, opacity: 0.08, offset: 1 },
    rectRadius: 0.08,
  });
  slide.addText('Haftalık / Aylık / Yıllık Gider Dağılımı', {
    x: 4.05,
    y: 2.2,
    w: 4.2,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: charcoal,
    fontFace: 'Arial',
  });

  if (pieData.length) {
    slide.addChart(pptx.charts.PIE, pieData, {
      x: 4.1,
      y: 2.55,
      w: 4.1,
      h: 2.5,
      showPercent: true,
      showLegend: true,
      legendPos: 'b',
      chartColors: [navy, orange, '0D9488', '6366F1', 'E11D48', 'CA8A04', '64748B', '0891B2', '7C3AED'],
    });
  } else {
    slide.addText('Gider verisi yok', {
      x: 4.5,
      y: 3.4,
      w: 3,
      h: 0.4,
      fontSize: 12,
      color: '99AABB',
      align: 'center',
    });
  }

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 8.6,
    y: 2.1,
    w: 4.5,
    h: 3.1,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 4, opacity: 0.08, offset: 1 },
    rectRadius: 0.08,
  });
  slide.addText('Haftalık Nakit Durumu', {
    x: 8.75,
    y: 2.2,
    w: 4.2,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: charcoal,
    fontFace: 'Arial',
  });

  if (weekly.length) {
    slide.addChart(
      pptx.charts.LINE,
      [
        {
          name: 'Nakit Bakiye',
          labels: weekly.map((w) => w.week),
          values: weekly.map((w) => w.balance),
        },
      ],
      {
        x: 8.75,
        y: 2.55,
        w: 4.2,
        h: 2.5,
        showLegend: false,
        chartColors: [navy],
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 6,
      },
    );
  }

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 3.9,
    y: 5.35,
    w: 9.2,
    h: 1.9,
    fill: { color: white },
    shadow: { type: 'outer', color: '000000', blur: 4, opacity: 0.08, offset: 1 },
    rectRadius: 0.08,
  });
  slide.addText('Nakit Giriş / Çıkış Bilgisi (Aylık)', {
    x: 4.05,
    y: 5.4,
    w: 8,
    h: 0.28,
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
      x: 4.05,
      y: 5.7,
      w: 8.9,
      h: 1.45,
      barGrouping: 'clustered',
      chartColors: [navy, orange],
      showLegend: true,
      legendPos: 'r',
      valAxisHidden: false,
    },
  );

  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return buf;
}
