import ExcelJS from 'exceljs';
import { db, type Company, type CompanyProfile } from './db.js';
import { getPeriodReport, type PeriodFilter } from './periodReport.js';

export async function buildExcelReport(companyId: string, filter: PeriodFilter): Promise<Buffer> {
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId) as Company | undefined;
  if (!company) throw new Error('Şirket bulunamadı');
  const profile = (db.prepare(`SELECT * FROM company_profiles WHERE company_id = ?`).get(companyId) ||
    {}) as Partial<CompanyProfile>;
  const report = getPeriodReport(companyId, filter);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'İştirak Nakit Dashboard';
  wb.created = new Date();

  const summary = wb.addWorksheet('Özet');
  summary.columns = [
    { header: 'Alan', key: 'k', width: 28 },
    { header: 'Değer', key: 'v', width: 36 },
  ];
  summary.addRows([
    { k: 'Şirket', v: company.name },
    { k: 'Dönem', v: report.label },
    { k: 'Kuruluş', v: profile.founded_at || '' },
    { k: 'YK Başkanı', v: profile.board_chair || '' },
    { k: 'Personel', v: profile.personnel_count || '' },
    { k: 'Toplam Gelir', v: report.kpis.totalInflow },
    { k: 'Toplam Gider', v: report.kpis.totalOutflow },
    { k: 'Net Nakit', v: report.kpis.net },
    { k: 'Nakit Bakiye', v: report.kpis.balance },
  ]);
  summary.getRow(1).font = { bold: true };
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4DA8' } };
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  const gider = wb.addWorksheet('Gider Dağılımı');
  gider.columns = [
    { header: 'Kalem', key: 'label', width: 36 },
    { header: 'Haftalık', key: 'weekly', width: 16 },
    { header: 'Aylık', key: 'monthly', width: 16 },
    { header: 'Yıllık', key: 'yearly', width: 16 },
  ];
  report.categories.forEach((c) =>
    gider.addRow({ label: c.shortLabel, weekly: c.weekly, monthly: c.monthly, yearly: c.yearly }),
  );
  gider.addRow({
    label: 'TOPLAM GİDER',
    weekly: report.kpis.totalOutflow / 52,
    monthly: report.kpis.totalOutflow / (filter.month == null ? 12 : 1),
    yearly: report.categories.reduce((s, c) => s + c.yearly, 0),
  });
  gider.addRow({
    label: 'TOPLAM GELİR',
    weekly: report.kpis.totalInflow / 52,
    monthly: report.kpis.totalInflow,
    yearly: report.kpis.totalInflow,
  });
  gider.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  gider.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4DA8' } };

  const aylik = wb.addWorksheet('Aylık');
  aylik.columns = [
    { header: 'Ay', key: 'month', width: 14 },
    { header: 'Giriş', key: 'inflow', width: 16 },
    { header: 'Çıkış', key: 'outflow', width: 16 },
    { header: 'Net', key: 'net', width: 16 },
  ];
  report.monthly.forEach((m) => aylik.addRow(m));
  aylik.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  aylik.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE87722' } };

  const haftalik = wb.addWorksheet('Haftalık Bakiye');
  haftalik.columns = [
    { header: 'Hafta', key: 'week', width: 16 },
    { header: 'Bakiye', key: 'balance', width: 18 },
  ];
  report.weekly.forEach((w) => haftalik.addRow({ week: w.week, balance: w.balance }));
  haftalik.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  haftalik.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374556' } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
