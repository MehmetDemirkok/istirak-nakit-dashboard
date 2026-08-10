import ExcelJS from 'exceljs';
import { CATEGORY_META, MONTH_LABELS, categoryFromCodeOrLabel, detectLineKind } from './categories.js';

export interface ParsedWeekMeta {
  index: number;
  label: string;
  dateStart?: string;
  dateEnd?: string;
}

export interface ParsedLine {
  code: string | null;
  category: string;
  label: string;
  lineKind: string;
  weekly: number[];
  monthly: number[];
}

export interface ParseResult {
  ok: boolean;
  sheetName: string;
  year: number;
  weeks: ParsedWeekMeta[];
  lines: ParsedLine[];
  warnings: string[];
  errors: string[];
  summary: {
    totalInflowYear: number;
    totalOutflowYear: number;
    netYear: number;
    lastBalance: number;
  };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const anyVal = value as {
      text?: string;
      result?: unknown;
      richText?: { text: string }[];
      formula?: string;
      sharedFormula?: string;
    };
    if (Array.isArray(anyVal.richText)) return anyVal.richText.map((r) => r.text).join('').trim();
    if (anyVal.text != null) return String(anyVal.text).trim();
    if (anyVal.result != null) return cellText(anyVal.result as ExcelJS.CellValue);
  }
  return '';
}

function cellNumber(value: ExcelJS.CellValue): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return 0;
  if (typeof value === 'object') {
    const anyVal = value as { result?: unknown };
    if (anyVal.result != null) return cellNumber(anyVal.result as ExcelJS.CellValue);
  }
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function cellDateIso(value: ExcelJS.CellValue): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && value > 20000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return utc.toISOString().slice(0, 10);
  }
  if (typeof value === 'object' && value != null) {
    const anyVal = value as { result?: unknown };
    if (anyVal.result != null) return cellDateIso(anyVal.result as ExcelJS.CellValue);
  }
  const t = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return undefined;
}

function findWeeklySheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const exact = wb.worksheets.find((s) => /nakit\s*ak[ıi][şs].*haftal[ıi]k/i.test(s.name));
  if (exact) return exact;
  return wb.worksheets.find((s) => /haftal/i.test(s.name));
}

function findGrafikSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((s) => /^graf/i.test(s.name));
}

function detectWeekColumns(sheet: ExcelJS.Worksheet): { weeks: ParsedWeekMeta[]; cols: number[] } {
  const weeks: ParsedWeekMeta[] = [];
  const cols: number[] = [];
  const maxCol = Math.max(sheet.actualColumnCount || 0, sheet.columnCount || 0, 80);

  for (let col = 1; col <= maxCol; col++) {
    const r3 = cellText(sheet.getRow(3).getCell(col).value);
    const dateStart =
      cellDateIso(sheet.getRow(4).getCell(col).value) ||
      cellDateIso(sheet.getRow(6).getCell(col).value);
    const dateEnd = cellDateIso(sheet.getRow(7).getCell(col).value);

    const haftaMatch = r3.match(/HAFTA\s*(\d+)/i);
    if (haftaMatch) {
      const weekNum = Number(haftaMatch[1]);
      weeks.push({
        index: weekNum,
        label: `HAFTA ${weekNum}`,
        dateStart,
        dateEnd,
      });
      cols.push(col);
      continue;
    }

    // Fallback: date in row 4 without HAFTA label
    if (dateStart && weeks.length > 0) {
      const weekNum = weeks.length + 1;
      weeks.push({ index: weekNum, label: `HAFTA ${weekNum}`, dateStart, dateEnd });
      cols.push(col);
    } else if (dateStart && weeks.length === 0 && col >= 4) {
      weeks.push({ index: 1, label: 'HAFTA 1', dateStart, dateEnd });
      cols.push(col);
    }
  }

  return { weeks: weeks.slice(0, 52), cols: cols.slice(0, 52) };
}

function extractCodeLabel(row: ExcelJS.Row): { code: string | null; label: string } {
  const a = cellText(row.getCell(1).value);
  const b = cellText(row.getCell(2).value);
  const c = cellText(row.getCell(3).value);

  const codePat = /^(F-[A-J]\.?\d{0,2}|[A-J]\.\d{2})/i;
  let code: string | null = null;
  let label = '';

  if (codePat.test(a)) {
    code = a.match(codePat)?.[1] ?? a;
    label = b || c || a;
  } else if (codePat.test(b)) {
    code = b.match(codePat)?.[1] ?? b;
    label = c || a || b;
  } else if (a || b || c) {
    label = b || c || a;
    const fromLabel = label.match(/([A-J]\.\d{2})/i);
    if (fromLabel) code = fromLabel[1];
  }

  return { code, label: label || code || '' };
}

function aggregateWeeksToMonths(weekly: number[], weekMetas: ParsedWeekMeta[]): number[] {
  const months = Array(12).fill(0);
  weekly.forEach((amount, i) => {
    const meta = weekMetas[i];
    let monthIdx = i < 12 ? Math.min(11, Math.floor(i / (weekly.length / 12 || 1))) : 0;
    if (meta?.dateStart) {
      const d = new Date(meta.dateStart);
      if (!Number.isNaN(d.getTime())) monthIdx = d.getUTCMonth();
    } else {
      // approximate: 52 weeks -> ~4.33 weeks/month
      monthIdx = Math.min(11, Math.floor(i / 4.345));
    }
    months[monthIdx] += amount;
  });
  return months;
}

function parseGrafikMonthly(sheet: ExcelJS.Worksheet): ParsedLine[] {
  const lines: ParsedLine[] = [];
  const maxRow = Math.min(sheet.rowCount || 400, 400);

  for (let r = 4; r <= maxRow; r++) {
    const row = sheet.getRow(r);
    const label = cellText(row.getCell(1).value);
    if (!label) continue;
    if (/gider kalemi/i.test(label)) continue;

    const monthly: number[] = [];
    for (let m = 0; m < 12; m++) {
      monthly.push(cellNumber(row.getCell(2 + m).value));
    }
    const yearTotal = cellNumber(row.getCell(14).value) || monthly.reduce((a, b) => a + b, 0);
    if (yearTotal === 0 && monthly.every((x) => x === 0)) {
      // keep structure but allow zeros for known codes
      if (!/^[A-J]\./i.test(label)) continue;
    }

    const category = categoryFromCodeOrLabel(null, label);
    const lineKind = detectLineKind(null, label);
    lines.push({
      code: label.match(/^[A-J]\.\d{2}/i)?.[0] ?? null,
      category,
      label,
      lineKind: lineKind === 'section' ? 'detail' : lineKind,
      weekly: [],
      monthly,
    });
  }
  return lines;
}

export async function parseCashFlowExcel(filePath: string): Promise<ParseResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const sheet = findWeeklySheet(wb);
  if (!sheet) {
    return {
      ok: false,
      sheetName: '',
      year: new Date().getFullYear(),
      weeks: [],
      lines: [],
      warnings,
      errors: ['NAKİT AKIŞ-Haftalık sayfası bulunamadı. Örnek Excel şablonunu kullanın.'],
      summary: { totalInflowYear: 0, totalOutflowYear: 0, netYear: 0, lastBalance: 0 },
    };
  }

  const detected = detectWeekColumns(sheet);
  const weeks = detected.weeks;
  const weekCols = detected.cols;
  if (weeks.length === 0) {
    errors.push('Haftalık kolonlar okunamadı.');
  }

  const lines: ParsedLine[] = [];
  const maxRow = Math.min(sheet.rowCount || 250, 250);

  for (let r = 8; r <= maxRow; r++) {
    const row = sheet.getRow(r);
    const { code, label } = extractCodeLabel(row);
    if (!label && !code) continue;

    const lineKind = detectLineKind(code, label);

    const weekly = weekCols.map((col) => cellNumber(row.getCell(col).value));
    const hasAny = weekly.some((v) => v !== 0) || Boolean(code) || /toplam|nakit|net/i.test(label);
    if (!hasAny && lineKind === 'section') continue;
    if (!label) continue;

    const category =
      lineKind.startsWith('total_') && lineKind.length === 7
        ? lineKind.slice(-1)
        : categoryFromCodeOrLabel(code, label);

    const monthly = aggregateWeeksToMonths(weekly, weeks);

    lines.push({
      code,
      category: CATEGORY_META[category] ? category : 'E',
      label,
      lineKind,
      weekly,
      monthly,
    });
  }

  // Enrich / validate with GRAFİK monthly if weekly sparse
  const grafik = findGrafikSheet(wb);
  if (grafik) {
    const gLines = parseGrafikMonthly(grafik);
    if (gLines.length) {
      const detailCount = lines.filter((l) => l.lineKind === 'detail').length;
      const weeklySum = lines
        .filter((l) => l.lineKind === 'detail')
        .reduce((s, l) => s + l.weekly.reduce((a, b) => a + b, 0), 0);
      if (detailCount < 10 || Math.abs(weeklySum) < 1) {
        warnings.push('Haftalık veri zayıf; GRAFİK sayfasındaki aylık veriler kullanıldı.');
        // replace detail lines monthly from grafik by label match
        for (const gl of gLines) {
          const existing = lines.find(
            (l) =>
              l.label.replace(/\s+/g, '').toLowerCase() === gl.label.replace(/\s+/g, '').toLowerCase() ||
              (l.code && gl.code && l.code.replace(/^F-/i, '') === gl.code),
          );
          if (existing) {
            existing.monthly = gl.monthly;
          } else {
            lines.push(gl);
          }
        }
      } else {
        // overlay monthly from grafik when labels match for better month alignment
        for (const gl of gLines) {
          const existing = lines.find(
            (l) =>
              l.lineKind === 'detail' &&
              (l.label.replace(/\s+/g, '').toLowerCase().includes(gl.label.replace(/\s+/g, '').toLowerCase().slice(0, 20)) ||
                (l.code && gl.code && l.code.replace(/^F-/i, '').toUpperCase() === gl.code.toUpperCase())),
          );
          if (existing && gl.monthly.some((x) => x !== 0)) {
            existing.monthly = gl.monthly;
          }
        }
      }
    }
  }

  // Year detection
  let year = new Date().getFullYear();
  const firstDate = weeks.find((w) => w.dateStart)?.dateStart;
  if (firstDate) year = Number(firstDate.slice(0, 4));

  const sumByKind = (kind: string) =>
    lines
      .filter((l) => l.lineKind === kind)
      .reduce((s, l) => s + l.monthly.reduce((a, b) => a + b, 0), 0);

  let totalInflowYear = sumByKind('total_inflow');
  let totalOutflowYear = sumByKind('total_outflow');
  let netYear = sumByKind('net');
  let lastBalance = 0;

  const balanceLine = lines.find((l) => l.lineKind === 'balance');
  if (balanceLine) {
    const vals = balanceLine.weekly.length ? balanceLine.weekly : balanceLine.monthly;
    for (let i = vals.length - 1; i >= 0; i--) {
      if (vals[i] !== 0 || i === 0) {
        lastBalance = vals[i];
        break;
      }
    }
  }

  if (!totalInflowYear) {
    totalInflowYear = lines
      .filter((l) => l.category === 'A' && l.lineKind === 'detail')
      .reduce((s, l) => s + l.monthly.reduce((a, b) => a + b, 0), 0);
  }
  if (!totalOutflowYear) {
    totalOutflowYear = lines
      .filter((l) => l.category !== 'A' && l.lineKind === 'detail')
      .reduce((s, l) => s + l.monthly.reduce((a, b) => a + b, 0), 0);
  }
  if (!netYear) netYear = totalInflowYear - totalOutflowYear;

  if (lines.filter((l) => l.lineKind === 'detail').length === 0) {
    errors.push('Detay satır bulunamadı. Excel şablonunu kontrol edin.');
  }

  return {
    ok: errors.length === 0,
    sheetName: sheet.name,
    year,
    weeks: weeks.length ? weeks : MONTH_LABELS.map((label, i) => ({ index: i + 1, label })),
    lines,
    warnings,
    errors,
    summary: { totalInflowYear, totalOutflowYear, netYear, lastBalance },
  };
}
