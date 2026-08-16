/**
 * 2 şirket için örnek nakit akış Excel üretir ve importu test eder.
 * Kullanım: node --import tsx scripts/generate-sample-excel.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { v4 as uuid } from 'uuid';
import { db } from '../server/db.js';
import { importExcelFile } from '../server/importService.js';
import { parseCashFlowExcel } from '../server/excelParser.js';
import { getPeriodReport } from '../server/periodReport.js';

const YEAR = 2026;
const MONTH = 7; // Ağustos (0-based)
const WEEK_INDEXES = [32, 33, 34, 35]; // weekIndexToMonth → 7
const OUT_DIR = path.join(process.cwd(), 'data', 'samples');

type CompanySpec = {
  fileSlug: string;
  name: string;
  scale: number;
  opening: number;
};

const COMPANIES: CompanySpec[] = [
  {
    fileSlug: 'sample-alfa-energy-2026-august',
    name: '[TEST] Alfa Enerji A.Ş.',
    scale: 1,
    opening: 48_000_000,
  },
  {
    fileSlug: 'sample-beta-software-2026-august',
    name: '[TEST] Beta Yazılım A.Ş.',
    scale: 0.62,
    opening: 22_500_000,
  },
];

const DETAIL_ROWS: {
  code: string;
  label: string;
  kind: 'in' | 'out';
  weekly: number[];
}[] = [
  { code: 'F-A.01', label: 'F-A.01. Yurt İçi Satışlar', kind: 'in', weekly: [12_500_000, 13_200_000, 11_800_000, 14_100_000] },
  { code: 'F-A.02', label: 'F-A.02. Yurt Dışı Satışlar', kind: 'in', weekly: [4_200_000, 3_900_000, 4_500_000, 4_100_000] },
  { code: 'F-A.03', label: 'F-A.03. Diğer Gelirler', kind: 'in', weekly: [800_000, 750_000, 920_000, 880_000] },
  { code: 'F-B.01', label: 'F-B.01. Personel Maaşları', kind: 'out', weekly: [2_800_000, 2_800_000, 2_800_000, 2_800_000] },
  { code: 'F-C.01', label: 'F-C.01. Güvenlik Hizmetleri', kind: 'out', weekly: [420_000, 420_000, 430_000, 420_000] },
  { code: 'F-D.01', label: 'F-D.01. Danışmanlık', kind: 'out', weekly: [310_000, 290_000, 350_000, 300_000] },
  { code: 'F-E.01', label: 'F-E.01. Kira ve Ofis', kind: 'out', weekly: [550_000, 550_000, 550_000, 560_000] },
  { code: 'F-F.01', label: 'F-F.01. KDV / Muhtasar', kind: 'out', weekly: [1_100_000, 980_000, 1_250_000, 1_050_000] },
  { code: 'F-G.01', label: 'F-G.01. Hammadde / Stok', kind: 'out', weekly: [1_600_000, 1_450_000, 1_700_000, 1_550_000] },
  { code: 'F-H.01', label: 'F-H.01. Yatırım Harcamaları', kind: 'out', weekly: [3_200_000, 2_900_000, 3_500_000, 3_100_000] },
  { code: 'F-I.01', label: 'F-I.01. Kredi / Finansman', kind: 'out', weekly: [1_400_000, 1_400_000, 1_400_000, 1_400_000] },
  { code: 'F-J.01', label: 'F-J.01. Proje Giderleri', kind: 'out', weekly: [780_000, 820_000, 760_000, 800_000] },
];

function scale(n: number, s: number) {
  return Math.round(n * s);
}

function weekStartIso(weekIndex: number): string {
  // Approximate: week 1 ≈ Jan 1 2026
  const d = new Date(Date.UTC(YEAR, 0, 1 + (weekIndex - 1) * 7));
  return d.toISOString().slice(0, 10);
}

async function buildWorkbook(spec: CompanySpec): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('NAKİT AKIŞ-Haftalık');

  sheet.getCell('A1').value = spec.name;
  sheet.getCell('A2').value = `Örnek nakit akış · Ağustos ${YEAR}`;

  // Week headers in row 3, dates in row 4 — cols start at 4
  WEEK_INDEXES.forEach((w, i) => {
    const col = 4 + i;
    sheet.getCell(3, col).value = `HAFTA ${w}`;
    sheet.getCell(4, col).value = new Date(`${weekStartIso(w)}T00:00:00Z`);
    sheet.getCell(4, col).numFmt = 'yyyy-mm-dd';
  });

  type RowDef = { code: string | null; label: string; amounts: number[] };
  const rows: RowDef[] = [];

  rows.push({
    code: null,
    label: 'Nakit Başlangıcı',
    amounts: [spec.opening, 0, 0, 0],
  });
  rows.push({ code: null, label: 'A.Nakit Girişleri', amounts: [0, 0, 0, 0] });

  const inDetails = DETAIL_ROWS.filter((r) => r.kind === 'in');
  const outDetails = DETAIL_ROWS.filter((r) => r.kind === 'out');

  for (const d of inDetails) {
    rows.push({
      code: d.code,
      label: d.label,
      amounts: d.weekly.map((v) => scale(v, spec.scale)),
    });
  }

  const inflowWeekly = WEEK_INDEXES.map((_, i) =>
    inDetails.reduce((s, d) => s + scale(d.weekly[i], spec.scale), 0),
  );
  rows.push({ code: null, label: 'Toplam Nakit Girişler', amounts: inflowWeekly });
  rows.push({
    code: null,
    label: 'Toplam Kullanılabilir Nakit',
    amounts: inflowWeekly.map((v, i) => v + (i === 0 ? spec.opening : 0)),
  });

  const sectionLabels: Record<string, string> = {
    B: 'B.Personel Giderleri Nakit Çıkışları',
    C: 'C.Dışarıdan Sağlanan Fayda Ve Hizmetler',
    D: 'D.Danışmanlık Giderleri Nakit Çıkışları',
    E: 'E.Çeşitli Giderler  Nakit Çıkışları',
    F: 'F.Vergi/Resim/Harçlar  Nakit Çıkışlar',
    G: 'G.Stoklara Ait Nakit Çıkışları',
    H: 'H.Yatırımlara Ait Nakit Çıkışları',
    I: 'I.Finansal Operasyonlara Ait Nakit Çıkışlar',
    J: 'J.Proje Faaliyetlerine Ait Nakit Çıkışları',
  };
  const totalLabels: Record<string, string> = {
    B: 'Toplam Personel Giderleri Nakit Çıkışları',
    C: 'Toplam Dışarıdan Sağlanan Fayda Ve Hizmetler',
    D: 'Toplam Danışmanlık Giderleri  Nakit Çıkışları',
    E: 'Toplam Çeşitli Giderler  Nakit Çıkışları',
    F: 'Toplam Vergi/Resim/Harçlar  Nakit Çıkışları',
    G: 'Toplam Stoklara Ait Nakit Çıkışları',
    H: 'Toplam Yatırımlara Ait Nakit Çıkışları',
    I: 'Toplam Finansmana Ait Nakit Çıkışları',
    J: 'Toplam Proje Faaliyetlerinden Kaynaklanan Nakit Çıkışları',
  };

  const outflowWeekly = [0, 0, 0, 0];
  for (const cat of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
    rows.push({ code: null, label: sectionLabels[cat], amounts: [0, 0, 0, 0] });
    const details = outDetails.filter((d) => d.code.includes(`-${cat}.`));
    const catWeekly = [0, 0, 0, 0];
    for (const d of details) {
      const amounts = d.weekly.map((v) => scale(v, spec.scale));
      rows.push({ code: d.code, label: d.label, amounts });
      amounts.forEach((v, i) => {
        catWeekly[i] += v;
        outflowWeekly[i] += v;
      });
    }
    rows.push({ code: null, label: totalLabels[cat], amounts: catWeekly });
  }

  rows.push({ code: null, label: 'Toplam Nakit Çıkışları', amounts: outflowWeekly });
  const netWeekly = inflowWeekly.map((v, i) => v - outflowWeekly[i]);
  rows.push({ code: null, label: 'Net Nakit Giriş/Çıkış', amounts: netWeekly });

  let bal = spec.opening;
  const balanceWeekly = netWeekly.map((n) => {
    bal += n;
    return bal;
  });
  rows.push({ code: null, label: 'Nakit Bakiye', amounts: balanceWeekly });

  rows.forEach((row, idx) => {
    const r = 8 + idx;
    sheet.getCell(r, 1).value = row.code || '';
    sheet.getCell(r, 2).value = row.label;
    row.amounts.forEach((amt, i) => {
      sheet.getCell(r, 4 + i).value = amt;
      sheet.getCell(r, 4 + i).numFmt = '#,##0';
    });
  });

  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 48;
  for (let i = 0; i < WEEK_INDEXES.length; i++) sheet.getColumn(4 + i).width = 14;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const filePath = path.join(OUT_DIR, `${spec.fileSlug}.xlsx`);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

function ensureCompany(name: string, parentId: string | null): string {
  const existing = db.prepare(`SELECT id FROM companies WHERE name = ?`).get(name) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;
  const id = uuid();
  db.prepare(`INSERT INTO companies (id, name, role, parent_id) VALUES (?, ?, 'subsidiary', ?)`).run(
    id,
    name,
    parentId,
  );
  db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(id);
  return id;
}

function fmt(n: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

async function main() {
  console.log('── Örnek Excel üretimi + import testi ──\n');

  let parent = db
    .prepare(`SELECT id, name FROM companies WHERE role = 'parent' ORDER BY created_at LIMIT 1`)
    .get() as { id: string; name: string } | undefined;
  if (!parent) {
    const id = uuid();
    const name = '[TEST] Holding A.Ş.';
    db.prepare(`INSERT INTO companies (id, name, role, parent_id) VALUES (?, ?, 'parent', NULL)`).run(
      id,
      name,
    );
    db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(id);
    parent = { id, name };
    console.log(`Holding oluşturuldu: ${name}`);
  } else {
    console.log(`Holding: ${parent.name}`);
  }

  for (const spec of COMPANIES) {
    console.log(`\n▸ ${spec.name}`);
    const filePath = await buildWorkbook(spec);
    console.log(`  Excel: ${filePath}`);

    const parsed = await parseCashFlowExcel(filePath);
    console.log(
      `  Parse: ok=${parsed.ok} weeks=${parsed.weeks.length} lines=${parsed.lines.length} details=${
        parsed.lines.filter((l) => l.lineKind === 'detail').length
      }`,
    );
    if (parsed.errors.length) console.log('  Errors:', parsed.errors);
    if (parsed.warnings.length) console.log('  Warnings:', parsed.warnings);
    console.log(
      `  Summary: giriş=${fmt(parsed.summary.totalInflowYear)} çıkış=${fmt(
        parsed.summary.totalOutflowYear,
      )} net=${fmt(parsed.summary.netYear)} bakiye=${fmt(parsed.summary.lastBalance)}`,
    );

    if (!parsed.ok) {
      console.log('  ✗ Parse başarısız — import atlandı');
      continue;
    }

    const companyId = ensureCompany(spec.name, parent.id);
    const result = await importExcelFile(companyId, filePath, path.basename(filePath), {
      year: YEAR,
      month: MONTH,
    });
    console.log(`  Import: ${result.status} — ${result.message}`);

    const report = getPeriodReport(companyId, { year: YEAR, month: MONTH });
    console.log(
      `  Dashboard KPI: gelir=${fmt(report.kpis.totalInflow)} gider=${fmt(
        report.kpis.totalOutflow,
      )} net=${fmt(report.kpis.net)} bakiye=${fmt(report.kpis.balance)}`,
    );
    console.log(`  URL: /?company=${companyId}&year=${YEAR}&month=${MONTH}`);
  }

  console.log('\n── Bitti ──');
  console.log(`Örnek dosyalar: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
