import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { spawn } from 'node:child_process';
import { db, UPLOADS_DIR, getStorageInfo, STORAGE_FOLDERS, type StorageFolderKey, type Company, type CompanyProfile } from './db.js';
import { getLatestPeriod, importExcelFile, listCompanyPeriods } from './importService.js';
import {
  companyHasData,
  getCompanyYear,
} from './analytics.js';
import { buildPresentation } from './pptxExport.js';
import { buildPdfReport } from './pdfExport.js';
import { buildExcelReport } from './excelExport.js';
import {
  getConsolidatedPeriodDashboard,
  getPeriodReport,
  parsePeriodQuery,
  periodLabel,
} from './periodReport.js';
import { requireAuth } from './authRoutes.js';
import { activityStats, clearActivities, listActivities } from './activityLog.js';
import { applyUpdate, checkForUpdate, getLocalVersion } from './updater.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-()ığüşöçİĞÜŞÖÇ\s]/gi, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(null, ok);
  },
  limits: { fileSize: 40 * 1024 * 1024 },
});

export const api = Router();

api.get('/health', (_req, res) => {
  res.json({ ok: true, local: true, bind: '127.0.0.1', version: getLocalVersion() });
});

api.use(requireAuth);

api.get('/system/version', (_req, res) => {
  res.json({ version: getLocalVersion() });
});

api.get('/system/storage', (_req, res) => {
  res.json(getStorageInfo());
});

api.post('/system/storage/open', (req, res) => {
  const key = (req.body as { folder?: string })?.folder as StorageFolderKey | undefined;
  if (!key || !(key in STORAGE_FOLDERS)) {
    return res.status(400).json({ error: 'folder must be one of: data, database, uploads, avatars, samples, secrets, templates' });
  }
  const target = STORAGE_FOLDERS[key];
  try {
    if (process.platform === 'win32') {
      spawn('explorer', [target], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
    }
    res.json({ ok: true, path: target });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Klasör açılamadı' });
  }
});

api.get('/system/update/check', async (_req, res) => {
  const result = await checkForUpdate();
  res.json(result);
});

api.post('/system/update/apply', async (_req, res) => {
  const result = await applyUpdate();
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
});

// Companies
api.get('/companies', (_req, res) => {
  const companies = db
    .prepare(`SELECT * FROM companies ORDER BY role ASC, name ASC`)
    .all() as Company[];
  const withMeta = companies.map((c) => ({
    ...c,
    hasData: companyHasData(c.id),
    year: companyHasData(c.id) ? getCompanyYear(c.id) : null,
  }));
  res.json(withMeta);
});

api.post('/companies', (req, res) => {
  const { name, role, parentId } = req.body as {
    name?: string;
    role?: string;
    parentId?: string | null;
  };
  if (!name?.trim()) return res.status(400).json({ error: 'Şirket adı gerekli' });
  if (role !== 'parent' && role !== 'subsidiary') {
    return res.status(400).json({ error: 'role parent veya subsidiary olmalı' });
  }
  if (role === 'subsidiary' && !parentId) {
    return res.status(400).json({ error: 'İştirak için ana şirket (parentId) gerekli' });
  }
  if (role === 'parent') {
    const existing = db.prepare(`SELECT id FROM companies WHERE role = 'parent'`).get();
    if (existing) return res.status(400).json({ error: 'Zaten bir ana şirket var' });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO companies (id, name, role, parent_id) VALUES (?, ?, ?, ?)`,
  ).run(id, name.trim(), role, role === 'subsidiary' ? parentId : null);
  db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(id);

  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id);
  res.status(201).json(company);
});

api.put('/companies/:id', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'Şirket adı gerekli' });
  const info = db
    .prepare(`UPDATE companies SET name = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name.trim(), req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Bulunamadı' });
  res.json(db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id));
});

api.delete('/companies/:id', (req, res) => {
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id) as Company | undefined;
  if (!company) return res.status(404).json({ error: 'Bulunamadı' });
  if (company.role === 'parent') {
    const kids = db
      .prepare(`SELECT COUNT(*) as c FROM companies WHERE parent_id = ?`)
      .get(company.id) as { c: number };
    if (kids.c > 0) {
      return res.status(400).json({ error: 'Önce iştirakleri silin' });
    }
  }
  db.prepare(`DELETE FROM companies WHERE id = ?`).run(company.id);
  res.json({ ok: true });
});

api.get('/companies/:id/profile', (req, res) => {
  const profile = db
    .prepare(`SELECT * FROM company_profiles WHERE company_id = ?`)
    .get(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profil yok' });
  res.json(profile);
});

api.put('/companies/:id/profile', (req, res) => {
  const fields = [
    'founded_at',
    'board_chair',
    'board_vice',
    'board_members',
    'general_assembly_date',
    'partnership',
    'personnel_count',
    'credits',
    'patents',
    'project_count',
    'project_amount_try',
    'project_amount_usd',
    'project_amount_eur',
    'debts_to_partners',
    'notes',
  ] as const;

  const body = req.body as Partial<CompanyProfile>;
  const sets = fields.map((f) => `${f} = ?`).join(', ');
  const values = fields.map((f) => (body[f] != null ? String(body[f]) : null));
  const info = db
    .prepare(
      `UPDATE company_profiles SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`,
    )
    .run(...values, req.params.id);
  if (!info.changes) {
    db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(req.params.id);
    db.prepare(
      `UPDATE company_profiles SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`,
    ).run(...values, req.params.id);
  }
  res.json(db.prepare(`SELECT * FROM company_profiles WHERE company_id = ?`).get(req.params.id));
});

// Import
api.post('/companies/:id/import', upload.single('file'), async (req, res) => {
  try {
    const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id) as
      | Company
      | undefined;
    if (!company) return res.status(404).json({ error: 'Şirket bulunamadı' });
    if (company.role === 'parent') {
      return res.status(400).json({ error: 'Excel iştirak şirketlerine yüklenir' });
    }
    if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' });

    const year = Number(req.body?.year);
    const monthRaw = req.body?.month;
    const month =
      monthRaw === '' || monthRaw == null || monthRaw === 'all'
        ? null
        : Number(monthRaw);

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Geçerli bir yıl seçin (örn. 2026)' });
    }
    if (month != null && (!Number.isFinite(month) || month < 0 || month > 11)) {
      return res.status(400).json({ error: 'Geçerli bir ay seçin (0–11)' });
    }
    if (month == null) {
      return res.status(400).json({ error: 'Hangi ayın verisini yüklediğinizi seçin' });
    }

    const result = await importExcelFile(company.id, req.file.path, req.file.originalname, {
      year,
      month,
    });
    res.json({
      importId: result.importId,
      status: result.status,
      message: result.message,
      warnings: result.parsed.warnings,
      errors: result.parsed.errors,
      summary: result.parsed.summary,
      year: result.year,
      month: result.month,
      lineCount: result.parsed.lines.length,
      weekCount: result.parsed.weeks.length,
      dashboardPath: `/?company=${company.id}&year=${result.year}&month=${result.month}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'İçe aktarma hatası' });
  }
});

api.get('/companies/:id/imports', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, filename, status, message, year, month, created_at FROM import_jobs
       WHERE company_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(req.params.id);
  res.json(rows);
});

/** Sistemdeki tüm Excel yüklemeleri */
api.get('/imports', (req, res) => {
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : null;
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const where: string[] = [];
  const params: string[] = [];
  if (companyId) {
    where.push(`j.company_id = ?`);
    params.push(companyId);
  }
  if (status && status !== 'all') {
    where.push(`j.status = ?`);
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT j.id, j.company_id, c.name as company_name, j.filename, j.stored_path, j.status,
              j.message, j.year, j.month, j.created_at
       FROM import_jobs j
       LEFT JOIN companies c ON c.id = j.company_id
       ${whereSql}
       ORDER BY j.created_at DESC
       LIMIT 300`,
    )
    .all(...params) as {
    id: string;
    company_id: string;
    company_name: string | null;
    filename: string;
    stored_path: string;
    status: string;
    message: string | null;
    year: number | null;
    month: number | null;
    created_at: string;
  }[];

  res.json({
    total: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      companyName: r.company_name,
      filename: r.filename,
      status: r.status,
      message: r.message,
      year: r.year,
      month: r.month,
      createdAt: r.created_at,
      hasFile: !!(r.stored_path && fs.existsSync(r.stored_path)),
    })),
  });
});

api.get('/imports/:id/file', (req, res) => {
  const row = db
    .prepare(`SELECT id, filename, stored_path FROM import_jobs WHERE id = ?`)
    .get(req.params.id) as { id: string; filename: string; stored_path: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Yükleme bulunamadı' });
  if (!row.stored_path || !fs.existsSync(row.stored_path)) {
    return res.status(404).json({ error: 'Dosya diskte bulunamadı' });
  }
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(row.filename)}"`,
  );
  res.sendFile(path.resolve(row.stored_path));
});

api.get('/companies/:id/periods', (req, res) => {
  const company = db.prepare(`SELECT id FROM companies WHERE id = ?`).get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Bulunamadı' });
  const periods = listCompanyPeriods(req.params.id);
  const latest = getLatestPeriod(req.params.id);
  res.json({ periods, latest });
});

// Dashboard (year + month filter updates KPIs/charts)
api.get('/companies/:id/dashboard', (req, res) => {
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id) as
    | Company
    | undefined;
  if (!company) return res.status(404).json({ error: 'Bulunamadı' });

  const filter = parsePeriodQuery(
    { year: req.query.year as string | undefined, month: req.query.month as string | undefined },
    company.id,
  );

  if (company.role === 'parent') {
    return res.json({
      type: 'consolidated',
      company,
      ...getConsolidatedPeriodDashboard(company.id, filter),
      hasData: true,
    });
  }

  const report = getPeriodReport(company.id, filter);
  const periods = listCompanyPeriods(company.id);
  const latest = getLatestPeriod(company.id);
  res.json({
    type: 'subsidiary',
    company,
    periodLabel: report.label,
    filter: report.filter,
    kpis: report.kpis,
    categories: report.categories,
    monthly: report.monthly,
    weekly: report.weekly,
    dataYear: getCompanyYear(company.id),
    periods,
    latest,
    hasData: companyHasData(company.id),
    hasPeriodData: companyHasData(company.id, filter.year),
  });
});

// Exports: PPTX / PDF / Excel with year+month filter
function asciiFileBase(companyName: string, label: string) {
  const base = `${companyName}-${label}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || 'istirak-rapor';
}

api.get('/companies/:id/export/:format', async (req, res) => {
  try {
    const format = String(req.params.format || '').toLowerCase();
    if (!['pptx', 'pdf', 'xlsx', 'excel'].includes(format)) {
      return res.status(400).json({ error: 'format pptx | pdf | xlsx olmalı' });
    }
    const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id) as
      | Company
      | undefined;
    if (!company) return res.status(404).json({ error: 'Bulunamadı' });
    if (company.role === 'parent') {
      return res.status(400).json({ error: 'Rapor iştirak bazında üretilir' });
    }
    if (!companyHasData(company.id)) {
      return res.status(400).json({ error: 'Önce Excel yükleyin' });
    }

    const filter = parsePeriodQuery(
      { year: req.query.year as string | undefined, month: req.query.month as string | undefined },
      company.id,
    );
    const label = periodLabel(filter);
    const fileBase = asciiFileBase(company.name, label);

    if (format === 'pptx') {
      const buf = await buildPresentation(company.id, filter);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pptx"`);
      return res.send(buf);
    }

    if (format === 'pdf') {
      const buf = await buildPdfReport(company.id, filter);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
      return res.send(buf);
    }

    const buf = await buildExcelReport(company.id, filter);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Export hatası' });
  }
});

// backward-compatible alias
api.get('/companies/:id/presentation', async (req, res) => {
  (req.params as { id: string; format?: string }).format = 'pptx';
  // reuse export handler by forwarding query
  (req as any).url = `/companies/${req.params.id}/export/pptx`;
  const filter = parsePeriodQuery(
    { year: req.query.year as string | undefined, month: req.query.month as string | undefined },
    req.params.id,
  );
  try {
    const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id) as
      | Company
      | undefined;
    if (!company) return res.status(404).json({ error: 'Bulunamadı' });
    if (company.role === 'parent') return res.status(400).json({ error: 'Rapor iştirak bazında üretilir' });
    if (!companyHasData(company.id)) return res.status(400).json({ error: 'Önce Excel yükleyin' });
    const buf = await buildPresentation(company.id, filter);
    const fileBase = asciiFileBase(company.name, periodLabel(filter));
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pptx"`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sunum hatası' });
  }
});

// Activity logs
api.get('/logs', (req, res) => {
  const result = listActivities({
    limit: Number(req.query.limit) || 100,
    offset: Number(req.query.offset) || 0,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    username: typeof req.query.username === 'string' ? req.query.username : undefined,
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
  });
  res.json({ ...result, stats: activityStats() });
});

api.delete('/logs', (_req, res) => {
  clearActivities();
  res.json({ ok: true });
});

