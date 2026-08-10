import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { db, type Company, type CompanyProfile } from './db.js';
import { getPeriodReport, type PeriodFilter } from './periodReport.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveFonts() {
  const candidates: { regular: string; bold: string }[] = [];

  try {
    const pkg = path.dirname(require.resolve('dejavu-fonts-ttf/package.json'));
    candidates.push({
      regular: path.join(pkg, 'ttf', 'DejaVuSans.ttf'),
      bold: path.join(pkg, 'ttf', 'DejaVuSans-Bold.ttf'),
    });
  } catch {
    /* ignore */
  }

  candidates.push(
    {
      regular: '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
      bold: '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    },
    {
      regular: 'C:\\Windows\\Fonts\\arial.ttf',
      bold: 'C:\\Windows\\Fonts\\arialbd.ttf',
    },
    {
      regular: path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf'),
      bold: path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf'),
    },
  );

  for (const c of candidates) {
    if (fs.existsSync(c.regular) && fs.existsSync(c.bold)) return c;
    if (fs.existsSync(c.regular)) return { regular: c.regular, bold: c.regular };
  }
  return null;
}

function money(n: number): string {
  // Avoid ₺ glyph issues; use TL for PDF safety with all fonts
  return (
    new Intl.NumberFormat('tr-TR', {
      maximumFractionDigits: 0,
    }).format(n || 0) + ' TL'
  );
}

export async function buildPdfReport(companyId: string, filter: PeriodFilter): Promise<Buffer> {
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId) as Company | undefined;
  if (!company) throw new Error('Şirket bulunamadı');
  const profile = (db.prepare(`SELECT * FROM company_profiles WHERE company_id = ?`).get(companyId) ||
    {}) as Partial<CompanyProfile>;
  const report = getPeriodReport(companyId, filter);
  const fonts = resolveFonts();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fontRegular = 'TR';
    const fontBold = 'TR-Bold';
    if (fonts) {
      doc.registerFont(fontRegular, fonts.regular);
      doc.registerFont(fontBold, fonts.bold);
    } else {
      // last resort — will still break Turkish, but avoids crash
      console.warn('PDF: Unicode font bulunamadı, Helvetica kullanılıyor');
    }
    const F = fonts ? fontRegular : 'Helvetica';
    const FB = fonts ? fontBold : 'Helvetica-Bold';

    const navy = '#0B4DA8';
    const charcoal = '#374556';
    const orange = '#E87722';

    doc.rect(0, 0, doc.page.width, 48).fill(navy);
    doc.fillColor('#fff').fontSize(15).font(FB)
      .text(`${company.name}  •  NAKİT AKIŞ SUNUMU`, 40, 14, { width: 560, continued: false });
    doc.fontSize(11).font(F).text(report.label, doc.page.width - 200, 18, { width: 160, align: 'right' });

    let y = 64;
    doc.fillColor(charcoal).fontSize(13).font(FB).text('Şirket Bilgileri', 40, y);
    y += 20;
    doc.font(F).fontSize(9).fillColor('#556677');
    const info = [
      `Kuruluş: ${profile.founded_at || '—'}`,
      `YK Başkanı: ${profile.board_chair || '—'}`,
      `Personel: ${profile.personnel_count || '—'}`,
      `Kredi: ${profile.credits || '—'}`,
      `Patent: ${profile.patents || '—'}`,
      `Proje: ${profile.project_count || '—'}`,
    ];
    doc.text(info.join('   |   '), 40, y, { width: doc.page.width - 80 });

    y += 28;
    const cards = [
      ['Toplam Gelir', money(report.kpis.totalInflow), navy],
      ['Toplam Gider', money(report.kpis.totalOutflow), orange],
      ['Net Nakit', money(report.kpis.net), charcoal],
      ['Nakit Bakiye', money(report.kpis.balance), '#0D9488'],
    ] as const;
    const cardW = 170;
    cards.forEach((c, i) => {
      const x = 40 + i * (cardW + 12);
      doc.save();
      doc.roundedRect(x, y, cardW, 54, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.rect(x, y, 5, 54).fill(c[2]);
      doc.restore();
      doc.fillColor('#667788').fontSize(8).font(F).text(c[0], x + 14, y + 10, { width: cardW - 24 });
      doc.fillColor(charcoal).fontSize(11).font(FB).text(c[1], x + 14, y + 26, { width: cardW - 24 });
    });

    y += 72;
    doc.fillColor(charcoal).fontSize(12).font(FB).text('Gider Özeti (Haftalık / Aylık / Yıllık)', 40, y);
    y += 16;

    const colX = [40, 220, 340, 460, 580];
    doc.rect(40, y, 700, 18).fill(navy);
    ['Kalem', 'Haftalık', 'Aylık', 'Yıllık', 'Pay'].forEach((h, i) => {
      doc.fillColor('#fff').font(FB).fontSize(8).text(h, colX[i] + (i === 0 ? 6 : 0), y + 5, { width: 100 });
    });
    y += 20;

    const totalOut = report.categories.reduce((s, c) => s + c.yearly, 0) || 1;
    report.categories.forEach((c, idx) => {
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = 40;
      }
      const bg = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(40, y, 700, 16).fill(bg);
      doc.fillColor(charcoal).font(F).fontSize(8);
      doc.text(c.shortLabel, colX[0] + 6, y + 4, { width: 170 });
      doc.text(money(c.weekly), colX[1], y + 4, { width: 100 });
      doc.text(money(c.monthly), colX[2], y + 4, { width: 100 });
      doc.text(money(c.yearly), colX[3], y + 4, { width: 100 });
      doc.text(`${((c.yearly / totalOut) * 100).toFixed(1)}%`, colX[4], y + 4, { width: 80 });
      y += 16;
    });

    y += 18;
    doc.font(FB).fontSize(10).fillColor(charcoal)
      .text(`Dönem: ${report.label}  |  Net: ${money(report.kpis.net)}`, 40, y);

    y += 24;
    doc.font(FB).fontSize(11).text('Aylık Giriş / Çıkış', 40, y);
    y += 14;
    doc.font(F).fontSize(8);
    report.monthly.forEach((m) => {
      if (m.inflow === 0 && m.outflow === 0) return;
      doc.fillColor(charcoal).text(
        `${m.month}: Giriş ${money(m.inflow)}  /  Çıkış ${money(m.outflow)}  /  Net ${money(m.net)}`,
        40,
        y,
      );
      y += 12;
      if (y > doc.page.height - 40) {
        doc.addPage();
        y = 40;
      }
    });

    doc.end();
  });
}
