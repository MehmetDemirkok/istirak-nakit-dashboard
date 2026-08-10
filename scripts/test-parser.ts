import { parseCashFlowExcel } from '../server/excelParser.js';
import path from 'node:path';

const file = process.argv[2] || path.join(process.cwd(), 'data', 'samples', 'ornek-nakit-akis.xlsx');

const result = await parseCashFlowExcel(file);
console.log(JSON.stringify({
  ok: result.ok,
  sheet: result.sheetName,
  year: result.year,
  weeks: result.weeks.length,
  lines: result.lines.length,
  detailLines: result.lines.filter(l => l.lineKind === 'detail').length,
  warnings: result.warnings,
  errors: result.errors,
  summary: result.summary,
  sampleLines: result.lines.filter(l => l.lineKind === 'detail').slice(0, 5).map(l => ({
    code: l.code, label: l.label, category: l.category,
    monthSum: l.monthly.reduce((a,b)=>a+b,0),
    weekSum: l.weekly.reduce((a,b)=>a+b,0),
  })),
}, null, 2));
