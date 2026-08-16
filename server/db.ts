import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

/** All user data stays in this folder on this computer. */
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const DATABASE_DIR = path.join(DATA_DIR, 'database');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
export const SAMPLES_DIR = path.join(DATA_DIR, 'samples');
export const SECRETS_DIR = path.join(DATA_DIR, 'secrets');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');

for (const dir of [
  DATA_DIR,
  DATABASE_DIR,
  UPLOADS_DIR,
  AVATARS_DIR,
  SAMPLES_DIR,
  SECRETS_DIR,
  TMP_DIR,
  TEMPLATES_DIR,
]) {
  fs.mkdirSync(dir, { recursive: true });
}

function moveIfPresent(from: string, to: string) {
  if (!fs.existsSync(from) || fs.existsSync(to)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}

function archiveSidecar(fromBase: string, toBase: string) {
  fs.mkdirSync(path.dirname(toBase), { recursive: true });
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const from = fromBase + suffix;
    if (!fs.existsSync(from)) continue;
    const to = toBase + suffix;
    try {
      if (fs.existsSync(to)) fs.rmSync(to, { force: true });
      fs.renameSync(from, to);
    } catch {
      /* still open in another process */
    }
  }
}

function companyCountAt(file: string): number {
  if (!fs.existsSync(file)) return 0;
  try {
    const probe = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const has = probe
        .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'companies'`)
        .get();
      if (!has) return 0;
      const row = probe.prepare(`SELECT COUNT(*) AS c FROM companies`).get() as { c: number };
      return Number(row?.c) || 0;
    } finally {
      probe.close();
    }
  } catch {
    return 0;
  }
}

/**
 * Prefer data/database/app.db. If an older data/app.db still has the real
 * companies, use that instead of an empty leftover created by a stale server.
 */
function resolveDbPath(): string {
  const nested = path.join(DATABASE_DIR, 'app.db');
  const legacy = path.join(DATA_DIR, 'app.db');
  const nestedCount = companyCountAt(nested);
  const legacyCount = companyCountAt(legacy);

  if (legacyCount > nestedCount) {
    if (nestedCount === 0) {
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        moveIfPresent(legacy + suffix, nested + suffix);
      }
    }
    return fs.existsSync(nested) && companyCountAt(nested) >= legacyCount ? nested : legacy;
  }

  if (fs.existsSync(legacy) && legacyCount === 0) {
    archiveSidecar(legacy, path.join(TMP_DIR, 'empty-legacy-app.db'));
  }
  return nested;
}

/** Older installs kept the GitHub token at data/update-token.txt. */
moveIfPresent(
  path.join(DATA_DIR, 'update-token.txt'),
  path.join(SECRETS_DIR, 'github-token.txt'),
);

export const DB_PATH = resolveDbPath();
export const GITHUB_TOKEN_FILE = path.join(SECRETS_DIR, 'github-token.txt');
export const db = new Database(DB_PATH);

export const STORAGE_FOLDERS = {
  data: DATA_DIR,
  database: DATABASE_DIR,
  uploads: UPLOADS_DIR,
  avatars: AVATARS_DIR,
  samples: SAMPLES_DIR,
  secrets: SECRETS_DIR,
  templates: TEMPLATES_DIR,
} as const;

export type StorageFolderKey = keyof typeof STORAGE_FOLDERS;

export function getStorageInfo() {
  return {
    localOnly: true,
    projectRoot: ROOT_DIR,
    dataDir: DATA_DIR,
    databaseFile: DB_PATH,
    uploadsDir: UPLOADS_DIR,
    avatarsDir: AVATARS_DIR,
    samplesDir: SAMPLES_DIR,
    secretsDir: SECRETS_DIR,
    templatesDir: TEMPLATES_DIR,
    folders: [
      {
        key: 'data' as const,
        label: 'Tüm yerel veri',
        path: DATA_DIR,
        note: 'Buluta gitmez; yalnızca bu bilgisayarda durur.',
      },
      {
        key: 'database' as const,
        label: 'Veritabanı (SQLite)',
        path: DB_PATH,
        note: 'Şirketler, nakit akış, kullanıcılar ve işlem logları.',
      },
      {
        key: 'uploads' as const,
        label: 'Yüklenen Excel dosyaları',
        path: UPLOADS_DIR,
        note: 'İçe aktardığınız .xlsx kopyaları.',
      },
      {
        key: 'avatars' as const,
        label: 'Profil fotoğrafları',
        path: AVATARS_DIR,
        note: 'Hesabım sayfasından yüklenen görseller.',
      },
      {
        key: 'samples' as const,
        label: 'Örnek Excel şablonları',
        path: SAMPLES_DIR,
        note: 'Deneme için örnek dosyalar; silmek verinizi etkilemez.',
      },
    ],
  };
}

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
migrateUserProfileSchema();

function migrateUserProfileSchema() {
  const cols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  const add = (col: string, defSql: string) => {
    if (!names.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${defSql}`);
  };
  add('first_name', 'TEXT');
  add('last_name', 'TEXT');
  add('email', 'TEXT');
  add('avatar_path', 'TEXT');
}

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
