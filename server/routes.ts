import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { db, UPLOADS_DIR, type Company, type CompanyProfile } from './db.js';
import { importExcelFile } from './importService.js';
import {
  companyHasData,
  getCategoryTotals,
  getCompanyYear,
  getConsolidatedDashboard,
  getKpis,
  getMonthlySeries,
  getWeeklyBalanceSeries,
} from './analytics.js';
import { buildPresentation } from './pptxExport.js';
import { requireAuth } from './authRoutes.js';

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
  res.json({ ok: true, local: true, bind: '127.0.0.1' });
});

api.use(requireAuth);

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

    const result = await importExcelFile(company.id, req.file.path, req.file.originalname);
    res.json({
      importId: result.importId,
      status: result.status,
      message: result.message,
      warnings: result.parsed.warnings,
      errors: result.parsed.errors,
      summary: result.parsed.summary,
      year: result.parsed.year,
      lineCount: result.parsed.lines.length,
      weekCount: result.parsed.weeks.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'İçe aktarma hatası' });
  }
});

api.get('/companies/:id/imports', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, filename, status, message, year, created_at FROM import_jobs
       WHERE company_id = ? ORDER BY created_at DESC LIMIT 20`,
    )
    .all(req.params.id);
  res.json(rows);
});

// Dashboard
api.get('/companies/:id/dashboard', (req, res) => {
  const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id) as
    | Company
    | undefined;
  if (!company) return res.status(404).json({ error: 'Bulunamadı' });

  if (company.role === 'parent') {
    return res.json({ type: 'consolidated', company, ...getConsolidatedDashboard(company.id) });
  }

  res.json({
    type: 'subsidiary',
    company,
    kpis: getKpis(company.id),
    categories: getCategoryTotals(company.id),
    monthly: getMonthlySeries(company.id),
    weekly: getWeeklyBalanceSeries(company.id),
    hasData: companyHasData(company.id),
  });
});

// PPTX
api.get('/companies/:id/presentation', async (req, res) => {
  try {
    const company = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(req.params.id) as
      | Company
      | undefined;
    if (!company) return res.status(404).json({ error: 'Bulunamadı' });
    if (company.role === 'parent') {
      return res.status(400).json({ error: 'Sunum iştirak bazında üretilir' });
    }
    if (!companyHasData(company.id)) {
      return res.status(400).json({ error: 'Önce Excel yükleyin' });
    }

    const buf = await buildPresentation(company.id);
    const asciiName = company.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_|_$/g, '') || 'istirak';
    const filename = `${asciiName}-nakit-akis.pptx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sunum hatası' });
  }
});

// Seed helper for demo
api.post('/demo/seed', async (req, res) => {
  try {
    const sample = path.join(process.cwd(), 'data', 'samples', 'ornek-nakit-akis.xlsx');
    if (!fs.existsSync(sample)) {
      return res.status(400).json({ error: 'Örnek Excel bulunamadı (data/samples/ornek-nakit-akis.xlsx)' });
    }

    let parent = db.prepare(`SELECT * FROM companies WHERE role = 'parent'`).get() as Company | undefined;
    if (!parent) {
      const id = uuid();
      db.prepare(`INSERT INTO companies (id, name, role, parent_id) VALUES (?, ?, 'parent', NULL)`).run(
        id,
        'Ana Holding A.Ş.',
      );
      db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(id);
      parent = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id) as Company;
    }

    let sub = db
      .prepare(`SELECT * FROM companies WHERE role = 'subsidiary' AND parent_id = ? LIMIT 1`)
      .get(parent.id) as Company | undefined;
    if (!sub) {
      const id = uuid();
      db.prepare(`INSERT INTO companies (id, name, role, parent_id) VALUES (?, ?, 'subsidiary', ?)`).run(
        id,
        'Demo İştirak A.Ş.',
        parent.id,
      );
      db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(id);
      db.prepare(
        `UPDATE company_profiles SET founded_at = ?, board_chair = ?, personnel_count = ? WHERE company_id = ?`,
      ).run('2018', 'Demo Başkan', '42', id);
      sub = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id) as Company;
    }

    const dest = path.join(UPLOADS_DIR, `demo-${Date.now()}.xlsx`);
    fs.copyFileSync(sample, dest);
    const result = await importExcelFile(sub.id, dest, 'ornek-nakit-akis.xlsx');
    res.json({ parent, subsidiary: sub, import: result.message, status: result.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Seed hatası' });
  }
});
