import { v4 as uuid } from 'uuid';
import { db } from './db.js';
import { parseCashFlowExcel, type ParseResult } from './excelParser.js';

export function persistParseResult(companyId: string, storedPath: string, filename: string, parsed: ParseResult) {
  const importId = uuid();
  const status = parsed.ok ? 'ok' : 'error';
  const message = parsed.ok
    ? `OK — ${parsed.lines.length} satır, ${parsed.weeks.length} dönem`
    : parsed.errors.join('; ');

  const insertJob = db.prepare(`
    INSERT INTO import_jobs (id, company_id, filename, stored_path, status, message, year)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteLines = db.prepare(`DELETE FROM cash_flow_lines WHERE company_id = ?`);

  const insertLine = db.prepare(`
    INSERT INTO cash_flow_lines
      (company_id, import_id, code, category, label, line_kind, period_type, period_index, period_label, amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, code, label, line_kind, period_type, period_index)
    DO UPDATE SET amount = excluded.amount, import_id = excluded.import_id, period_label = excluded.period_label
  `);

  const tx = db.transaction(() => {
    insertJob.run(importId, companyId, filename, storedPath, status, message, parsed.year);
    if (!parsed.ok) return importId;

    deleteLines.run(companyId);

    for (const line of parsed.lines) {
      const code = line.code || '';
      line.weekly.forEach((amount, i) => {
        const meta = parsed.weeks[i];
        insertLine.run(
          companyId,
          importId,
          code,
          line.category,
          line.label,
          line.lineKind,
          'week',
          meta?.index ?? i + 1,
          meta?.label ?? `HAFTA ${i + 1}`,
          amount,
        );
      });

      line.monthly.forEach((amount, i) => {
        insertLine.run(
          companyId,
          importId,
          code,
          line.category,
          line.label,
          line.lineKind,
          'month',
          i,
          ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'][
            i
          ],
          amount,
        );
      });

      const yearAmount = line.monthly.reduce((a, b) => a + b, 0);
      insertLine.run(
        companyId,
        importId,
        code,
        line.category,
        line.label,
        line.lineKind,
        'year',
        0,
        String(parsed.year),
        yearAmount,
      );
    }
  });

  tx();
  return { importId, status, message };
}

export async function importExcelFile(companyId: string, storedPath: string, filename: string) {
  const parsed = await parseCashFlowExcel(storedPath);
  const result = persistParseResult(companyId, storedPath, filename, parsed);
  return { ...result, parsed };
}
