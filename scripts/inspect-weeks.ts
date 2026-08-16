import ExcelJS from 'exceljs';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('data/samples/sample-alfa-energy-2026-august.xlsx');
const s = wb.worksheets.find((x) => /haftal/i.test(x.name))!;
console.log('name', s.name, 'rowCount', s.rowCount, 'colCount', s.columnCount);
console.log('actual', s.actualRowCount, s.actualColumnCount);
for (let col = 1; col <= 100; col++) {
  const r2 = s.getRow(2).getCell(col).value;
  const r3 = s.getRow(3).getCell(col).value;
  const r4 = s.getRow(4).getCell(col).value;
  if (r2 != null || r3 != null || r4 != null) console.log(col, { r2, r3, r4 });
}
