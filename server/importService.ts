import { v4 as uuid } from 'uuid';
import { db } from './db.js';
import { MONTH_LABELS } from './categories.js';
import { parseCashFlowExcel, type ParseResult } from './excelParser.js';
import { weekIndexToMonth } from './periodUtils.js';

export type ImportPeriod = {
  year: number;
  /** 0-11 = tek ay; null = dosyadaki tüm aylar (o yıl) */
  month: number | null;
};

function refreshYearTotals(companyId: string, year: number, importId: string) {
  const identities = db
    .prepare(
      `SELECT DISTINCT code, category, label, line_kind
       FROM cash_flow_lines
       WHERE company_id = ? AND year = ? AND period_type = 'month'`,
    )
    .all(companyId, year) as {
    code: string | null;
    category: string;
    label: string;
    line_kind: string;
  }[];

  const upsert = db.prepare(`
    INSERT INTO cash_flow_lines
      (company_id, import_id, code, category, label, line_kind, period_type, period_index, period_label, amount, year)
    VALUES (?, ?, ?, ?, ?, ?, 'year', 0, ?, ?, ?)
    ON CONFLICT(company_id, year, code, label, line_kind, period_type, period_index)
    DO UPDATE SET amount = excluded.amount, import_id = excluded.import_id, period_label = excluded.period_label
  `);

  const sumStmt = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as s FROM cash_flow_lines
    WHERE company_id = ? AND year = ? AND period_type = 'month'
      AND IFNULL(code,'') = IFNULL(?, '') AND category = ? AND label = ? AND line_kind = ?
  `);

  for (const line of identities) {
    const sum = (
      sumStmt.get(companyId, year, line.code, line.category, line.label, line.line_kind) as { s: number }
    ).s;
    upsert.run(
      companyId,
      importId,
      line.code || '',
      line.category,
      line.label,
      line.line_kind,
      String(year),
      sum,
      year,
    );
  }
}

export function persistParseResult(
  companyId: string,
  storedPath: string,
  filename: string,
  parsed: ParseResult,
  period: ImportPeriod,
) {
  const importId = uuid();
  const year = period.year;
  const month = period.month;
  const status = parsed.ok ? 'ok' : 'error';
  const monthLabel = month == null ? 'Tüm yıl' : MONTH_LABELS[month];
  const message = parsed.ok
    ? `OK — ${monthLabel} ${year} · ${parsed.lines.length} satır`
    : parsed.errors.join('; ');

  const insertJob = db.prepare(`
    INSERT INTO import_jobs (id, company_id, filename, stored_path, status, message, year, month)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLine = db.prepare(`
    INSERT INTO cash_flow_lines
      (company_id, import_id, code, category, label, line_kind, period_type, period_index, period_label, amount, year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, year, code, label, line_kind, period_type, period_index)
    DO UPDATE SET amount = excluded.amount, import_id = excluded.import_id, period_label = excluded.period_label
  `);

  const tx = db.transaction(() => {
    insertJob.run(importId, companyId, filename, storedPath, status, message, year, month);
    if (!parsed.ok) return importId;

    if (month == null) {
      db.prepare(`DELETE FROM cash_flow_lines WHERE company_id = ? AND year = ?`).run(companyId, year);
    } else {
      const weekIndexes = Array.from({ length: 53 }, (_, i) => i + 1).filter(
        (w) => weekIndexToMonth(w) === month,
      );
      if (weekIndexes.length) {
        db.prepare(
          `DELETE FROM cash_flow_lines
           WHERE company_id = ? AND year = ? AND period_type = 'week'
             AND period_index IN (${weekIndexes.map(() => '?').join(',')})`,
        ).run(companyId, year, ...weekIndexes);
      }
      db.prepare(
        `DELETE FROM cash_flow_lines
         WHERE company_id = ? AND year = ? AND period_type = 'month' AND period_index = ?`,
      ).run(companyId, year, month);
      db.prepare(
        `DELETE FROM cash_flow_lines
         WHERE company_id = ? AND year = ? AND period_type = 'year'`,
      ).run(companyId, year);
    }

    const monthsToWrite = month == null ? MONTH_LABELS.map((_, i) => i) : [month];

    for (const line of parsed.lines) {
      const code = line.code || '';

      for (const m of monthsToWrite) {
        let amount = line.monthly[m] ?? 0;
        // Tek ay yüklemede: seçilen sütun boşsa dosyanın tüm tutarını o aya yaz
        if (month != null && amount === 0) {
          const monthSum = line.monthly.reduce((a, b) => a + (b || 0), 0);
          const weekSum = line.weekly.reduce((a, b) => a + (b || 0), 0);
          amount = monthSum || weekSum;
        } else if (amount === 0 && line.weekly.length) {
          amount = line.weekly.reduce((sum, val, i) => {
            const wi = parsed.weeks[i]?.index ?? i + 1;
            return weekIndexToMonth(wi) === m ? sum + (val || 0) : sum;
          }, 0);
        }
        insertLine.run(
          companyId,
          importId,
          code,
          line.category,
          line.label,
          line.lineKind,
          'month',
          m,
          MONTH_LABELS[m].toLocaleUpperCase('tr-TR'),
          amount,
          year,
        );
      }

      if (month == null) {
        line.weekly.forEach((amount, i) => {
          const meta = parsed.weeks[i];
          const weekIndex = meta?.index ?? i + 1;
          insertLine.run(
            companyId,
            importId,
            code,
            line.category,
            line.label,
            line.lineKind,
            'week',
            weekIndex,
            meta?.label ?? `HAFTA ${weekIndex}`,
            amount,
            year,
          );
        });
      } else {
        const targetWeeks = Array.from({ length: 53 }, (_, i) => i + 1).filter(
          (w) => weekIndexToMonth(w) === month,
        );
        const nativeHasData = line.weekly.some((amount, i) => {
          const wi = parsed.weeks[i]?.index ?? i + 1;
          return weekIndexToMonth(wi) === month && amount;
        });

        if (nativeHasData) {
          line.weekly.forEach((amount, i) => {
            const meta = parsed.weeks[i];
            const weekIndex = meta?.index ?? i + 1;
            if (weekIndexToMonth(weekIndex) !== month) return;
            insertLine.run(
              companyId,
              importId,
              code,
              line.category,
              line.label,
              line.lineKind,
              'week',
              weekIndex,
              meta?.label ?? `HAFTA ${weekIndex}`,
              amount,
              year,
            );
          });
        } else {
          // Dosyadaki haftaları seçilen ayın hafta dilimine kaydır
          targetWeeks.forEach((weekIndex, i) => {
            const amount = line.weekly[i] ?? 0;
            insertLine.run(
              companyId,
              importId,
              code,
              line.category,
              line.label,
              line.lineKind,
              'week',
              weekIndex,
              `HAFTA ${weekIndex}`,
              amount,
              year,
            );
          });
        }
      }
    }

    refreshYearTotals(companyId, year, importId);
  });

  tx();
  return { importId, status, message, year, month };
}

export async function importExcelFile(
  companyId: string,
  storedPath: string,
  filename: string,
  period: ImportPeriod,
) {
  const parsed = await parseCashFlowExcel(storedPath);
  parsed.year = period.year;
  const result = persistParseResult(companyId, storedPath, filename, parsed, period);
  return { ...result, parsed };
}

export function listCompanyPeriods(companyId: string) {
  const fromImports = db
    .prepare(
      `SELECT year, month, filename, created_at
       FROM import_jobs
       WHERE company_id = ? AND status = 'ok' AND year IS NOT NULL
       ORDER BY created_at DESC`,
    )
    .all(companyId) as {
    year: number;
    month: number | null;
    filename: string;
    created_at: string;
  }[];

  const fromData = db
    .prepare(
      `SELECT DISTINCT year, period_index as month
       FROM cash_flow_lines
       WHERE company_id = ? AND period_type = 'month' AND ABS(amount) > 0.0001
       ORDER BY year DESC, period_index DESC`,
    )
    .all(companyId) as { year: number; month: number }[];

  const map = new Map<string, { year: number; month: number; filename?: string; created_at?: string }>();

  for (const row of fromData) {
    map.set(`${row.year}-${row.month}`, { year: row.year, month: row.month });
  }

  for (const row of fromImports) {
    if (row.month == null) continue;
    map.set(`${row.year}-${row.month}`, {
      year: row.year,
      month: row.month,
      filename: row.filename,
      created_at: row.created_at,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.year - a.year || b.month - a.month);
}

export function getLatestPeriod(companyId: string): { year: number; month: number } | null {
  const periods = listCompanyPeriods(companyId);
  if (!periods.length) return null;
  return { year: periods[0].year, month: periods[0].month };
}
