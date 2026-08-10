import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const SAMPLES_DIR = path.join(DATA_DIR, 'samples');
export const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');

for (const dir of [DATA_DIR, UPLOADS_DIR, SAMPLES_DIR, TEMPLATES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'app.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('parent', 'subsidiary')),
    parent_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS company_profiles (
    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    founded_at TEXT,
    board_chair TEXT,
    board_vice TEXT,
    board_members TEXT,
    general_assembly_date TEXT,
    partnership TEXT,
    personnel_count TEXT,
    credits TEXT,
    patents TEXT,
    project_count TEXT,
    project_amount_try TEXT,
    project_amount_usd TEXT,
    project_amount_eur TEXT,
    debts_to_partners TEXT,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    year INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cash_flow_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    import_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL,
    code TEXT,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    line_kind TEXT NOT NULL,
    period_type TEXT NOT NULL CHECK(period_type IN ('week', 'month', 'year')),
    period_index INTEGER NOT NULL,
    period_label TEXT,
    amount REAL NOT NULL DEFAULT 0,
    UNIQUE(company_id, code, label, line_kind, period_type, period_index)
  );

  CREATE INDEX IF NOT EXISTS idx_cfl_company ON cash_flow_lines(company_id);
  CREATE INDEX IF NOT EXISTS idx_cfl_category ON cash_flow_lines(company_id, category);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

migrateCashFlowSchema();

function migrateCashFlowSchema() {
  const importCols = db.prepare(`PRAGMA table_info(import_jobs)`).all() as { name: string }[];
  if (!importCols.some((c) => c.name === 'month')) {
    db.exec(`ALTER TABLE import_jobs ADD COLUMN month INTEGER`);
  }

  const tableSql = (
    db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cash_flow_lines'`).get() as
      | { sql: string }
      | undefined
  )?.sql;

  const hasYearUnique = !!tableSql?.includes('company_id, year, code');
  const cflCols = db.prepare(`PRAGMA table_info(cash_flow_lines)`).all() as { name: string }[];
  const hasYearCol = cflCols.some((c) => c.name === 'year');

  if (hasYearUnique && hasYearCol) return;

  if (!hasYearCol) {
    db.exec(`ALTER TABLE cash_flow_lines ADD COLUMN year INTEGER`);
  }

  db.exec(`
    UPDATE cash_flow_lines
    SET year = COALESCE(
      (SELECT year FROM import_jobs WHERE import_jobs.id = cash_flow_lines.import_id),
      CAST(strftime('%Y', 'now') AS INTEGER)
    )
    WHERE year IS NULL
  `);

  db.exec(`
    CREATE TABLE cash_flow_lines_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      import_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL,
      code TEXT,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      line_kind TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('week', 'month', 'year')),
      period_index INTEGER NOT NULL,
      period_label TEXT,
      amount REAL NOT NULL DEFAULT 0,
      year INTEGER NOT NULL,
      UNIQUE(company_id, year, code, label, line_kind, period_type, period_index)
    );

    INSERT INTO cash_flow_lines_new
      (company_id, import_id, code, category, label, line_kind, period_type, period_index, period_label, amount, year)
    SELECT company_id, import_id, code, category, label, line_kind, period_type, period_index, period_label, amount,
           COALESCE(year, CAST(strftime('%Y', 'now') AS INTEGER))
    FROM cash_flow_lines;

    DROP TABLE cash_flow_lines;
    ALTER TABLE cash_flow_lines_new RENAME TO cash_flow_lines;
    CREATE INDEX IF NOT EXISTS idx_cfl_company ON cash_flow_lines(company_id);
    CREATE INDEX IF NOT EXISTS idx_cfl_category ON cash_flow_lines(company_id, category);
    CREATE INDEX IF NOT EXISTS idx_cfl_year ON cash_flow_lines(company_id, year);
  `);
}

export type CompanyRole = 'parent' | 'subsidiary';

export interface Company {
  id: string;
  name: string;
  role: CompanyRole;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyProfile {
  company_id: string;
  founded_at: string | null;
  board_chair: string | null;
  board_vice: string | null;
  board_members: string | null;
  general_assembly_date: string | null;
  partnership: string | null;
  personnel_count: string | null;
  credits: string | null;
  patents: string | null;
  project_count: string | null;
  project_amount_try: string | null;
  project_amount_usd: string | null;
  project_amount_eur: string | null;
  debts_to_partners: string | null;
  notes: string | null;
  updated_at: string;
}
