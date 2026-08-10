import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { db, SAMPLES_DIR, UPLOADS_DIR, type Company } from './db.js';
import { importExcelFile } from './importService.js';

const DEMO_COMPANIES = [
  {
    name: 'Anadolu Enerji A.Ş.',
    factor: 1,
    profile: {
      founded_at: '2015',
      board_chair: 'Ahmet Yılmaz',
      board_vice: 'Ayşe Kara',
      board_members: 'M. Demir, S. Çelik',
      personnel_count: '86',
      credits: 'Düşük risk',
      patents: '4',
      project_count: '7',
      partnership: '%65 Holding / %35 Diğer',
    },
  },
  {
    name: 'Marmara Teknoloji A.Ş.',
    factor: 1.55,
    profile: {
      founded_at: '2018',
      board_chair: 'Burak Şen',
      board_vice: 'Elif Aksoy',
      board_members: 'K. Arslan, N. Polat',
      personnel_count: '124',
      credits: 'Orta',
      patents: '11',
      project_count: '14',
      partnership: '%80 Holding / %20 Diğer',
    },
  },
  {
    name: 'Ege Lojistik A.Ş.',
    factor: 0.68,
    profile: {
      founded_at: '2012',
      board_chair: 'Cem Öztürk',
      board_vice: 'Zeynep Aydın',
      board_members: 'H. Koç, T. Erdem',
      personnel_count: '53',
      credits: 'Yok',
      patents: '1',
      project_count: '3',
      partnership: '%51 Holding / %49 Diğer',
    },
  },
];

function scaleCompanyData(companyId: string, factor: number) {
  if (factor === 1) return;
  db.prepare(`UPDATE cash_flow_lines SET amount = amount * ? WHERE company_id = ?`).run(factor, companyId);
}

function upsertProfile(companyId: string, profile: Record<string, string>) {
  const fields = Object.keys(profile);
  const sets = fields.map((f) => `${f} = ?`).join(', ');
  db.prepare(
    `UPDATE company_profiles SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`,
  ).run(...fields.map((f) => profile[f]), companyId);
}

export async function seedThreeDemoCompanies() {
  const sample = path.join(SAMPLES_DIR, 'ornek-nakit-akis.xlsx');
  if (!fs.existsSync(sample)) {
    throw new Error('Örnek Excel bulunamadı (data/samples/ornek-nakit-akis.xlsx)');
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

  const created: { id: string; name: string; status: string; message: string }[] = [];

  for (const demo of DEMO_COMPANIES) {
    let sub = db
      .prepare(`SELECT * FROM companies WHERE name = ? AND role = 'subsidiary'`)
      .get(demo.name) as Company | undefined;

    if (!sub) {
      const id = uuid();
      db.prepare(`INSERT INTO companies (id, name, role, parent_id) VALUES (?, ?, 'subsidiary', ?)`).run(
        id,
        demo.name,
        parent.id,
      );
      db.prepare(`INSERT INTO company_profiles (company_id) VALUES (?)`).run(id);
      sub = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id) as Company;
    }

    upsertProfile(sub.id, demo.profile);

    const dest = path.join(UPLOADS_DIR, `demo-${Date.now()}-${demo.factor}.xlsx`);
    fs.copyFileSync(sample, dest);
    const result = await importExcelFile(sub.id, dest, 'ornek-nakit-akis.xlsx');
    if (result.status === 'ok') scaleCompanyData(sub.id, demo.factor);

    created.push({
      id: sub.id,
      name: demo.name,
      status: result.status,
      message: result.message,
    });
  }

  // remove old generic demo if present and not one of the three
  const old = db
    .prepare(`SELECT id FROM companies WHERE name = ?`)
    .get('Demo İştirak A.Ş.') as { id: string } | undefined;
  if (old) {
    db.prepare(`DELETE FROM companies WHERE id = ?`).run(old.id);
  }

  return { parent, subsidiaries: created };
}
