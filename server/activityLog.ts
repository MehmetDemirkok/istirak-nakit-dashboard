import type { NextFunction, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from './db.js';
import { MONTH_LABELS } from './categories.js';

export type ActivityLevel = 'info' | 'success' | 'warn' | 'error';

export interface ActivityInput {
  userId?: string | null;
  username?: string | null;
  action: string;
  category: string;
  detail?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  ip?: string | null;
  meta?: Record<string, unknown> | null;
  level?: ActivityLevel;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    username TEXT,
    action TEXT NOT NULL,
    category TEXT NOT NULL,
    detail TEXT,
    method TEXT,
    path TEXT,
    status_code INTEGER,
    ip TEXT,
    meta_json TEXT,
    level TEXT NOT NULL DEFAULT 'info',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(username);
  CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_logs(category);
`);

export function writeActivity(input: ActivityInput) {
  const id = uuid();
  db.prepare(
    `INSERT INTO activity_logs
      (id, user_id, username, action, category, detail, method, path, status_code, ip, meta_json, level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId ?? null,
    input.username ?? null,
    input.action,
    input.category,
    input.detail ?? null,
    input.method ?? null,
    input.path ?? null,
    input.statusCode ?? null,
    input.ip ?? null,
    input.meta ? JSON.stringify(input.meta) : null,
    input.level ?? 'info',
  );
  return id;
}

function clientIp(req: Request): string | null {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || null;
}

function companyName(id?: string | null): string | null {
  if (!id) return null;
  const row = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(id) as
    | { name: string }
    | undefined;
  return row?.name ?? id;
}

function monthLabel(month: unknown): string | null {
  const m = Number(month);
  if (!Number.isFinite(m) || m < 0 || m > 11) return null;
  return MONTH_LABELS[m];
}

/** İnsan okunur Türkçe özet */
export function describeApiCall(req: Request, status: number): {
  action: string;
  category: string;
  detail: string;
  level: ActivityLevel;
} {
  const method = req.method.toUpperCase();
  const path = (req.originalUrl || req.url || '').split('?')[0];
  const q = req.query || {};
  const body = (req.body || {}) as Record<string, unknown>;
  const companyId =
    (req.params as { id?: string }).id ||
    (typeof body.companyId === 'string' ? body.companyId : null);
  const cName = companyName(companyId);
  const ok = status < 400;
  const level: ActivityLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'success';

  // Auth
  if (path === '/api/auth/login' && method === 'POST') {
    const user = typeof body.username === 'string' ? body.username : '?';
    return {
      action: ok ? 'Giriş başarılı' : 'Giriş başarısız',
      category: 'auth',
      detail: ok ? `${user} oturum açtı` : `${user} hatalı giriş denemesi`,
      level: ok ? 'success' : 'warn',
    };
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    return {
      action: 'Çıkış yapıldı',
      category: 'auth',
      detail: req.user?.username ? `${req.user.username} oturumu kapattı` : 'Oturum kapatıldı',
      level: 'info',
    };
  }
  if (path === '/api/auth/me') {
    return {
      action: 'Oturum kontrolü',
      category: 'auth',
      detail: ok ? `${req.user?.username || 'kullanıcı'} oturumu doğrulandı` : 'Oturum yok',
      level: 'info',
    };
  }

  // Companies
  if (path === '/api/companies' && method === 'GET') {
    return { action: 'Şirket listesi', category: 'company', detail: 'Şirket listesi görüntülendi', level: 'info' };
  }
  if (path === '/api/companies' && method === 'POST') {
    const name = typeof body.name === 'string' ? body.name : '—';
    const role = body.role === 'parent' ? 'ana şirket' : 'iştirak';
    return {
      action: ok ? 'Şirket eklendi' : 'Şirket eklenemedi',
      category: 'company',
      detail: `${name} (${role})`,
      level,
    };
  }
  if (/^\/api\/companies\/[^/]+$/.test(path) && method === 'PUT') {
    const name = typeof body.name === 'string' ? body.name : cName || '—';
    return {
      action: ok ? 'Şirket güncellendi' : 'Şirket güncellenemedi',
      category: 'company',
      detail: `Ad: ${name}`,
      level,
    };
  }
  if (/^\/api\/companies\/[^/]+$/.test(path) && method === 'DELETE') {
    return {
      action: ok ? 'Şirket silindi' : 'Şirket silinemedi',
      category: 'company',
      detail: cName || companyId || '—',
      level,
    };
  }
  if (/\/profile$/.test(path) && method === 'GET') {
    return {
      action: 'Profil görüntülendi',
      category: 'profile',
      detail: cName || '—',
      level: 'info',
    };
  }
  if (/\/profile$/.test(path) && method === 'PUT') {
    return {
      action: ok ? 'Profil kaydedildi' : 'Profil kaydedilemedi',
      category: 'profile',
      detail: cName || '—',
      level,
    };
  }

  // Import
  if (/\/import$/.test(path) && method === 'POST') {
    const year = body.year ?? q.year;
    const month = body.month ?? q.month;
    const ml = monthLabel(month);
    const file = (req as Request & { file?: Express.Multer.File }).file?.originalname;
    return {
      action: ok ? 'Excel içe aktarıldı' : 'Excel içe aktarılamadı',
      category: 'import',
      detail: [cName, ml && year ? `${ml} ${year}` : null, file].filter(Boolean).join(' · '),
      level,
    };
  }
  if (/\/imports$/.test(path) && method === 'GET') {
    return {
      action: 'İçe aktarma geçmişi',
      category: 'import',
      detail: cName || 'Tüm yüklemeler',
      level: 'info',
    };
  }
  if (/^\/api\/imports\/[^/]+\/file$/.test(path) && method === 'GET') {
    return {
      action: ok ? 'Excel dosyası indirildi' : 'Excel indirilemedi',
      category: 'import',
      detail: 'Yüklenen dosya görüntülendi/indirildi',
      level,
    };
  }
  if (/\/periods$/.test(path) && method === 'GET') {
    return {
      action: 'Dönem listesi',
      category: 'dashboard',
      detail: cName || '—',
      level: 'info',
    };
  }

  // Dashboard
  if (/\/dashboard$/.test(path) && method === 'GET') {
    const year = q.year;
    const month = q.month;
    const ml = month === 'all' || month == null ? 'Tüm yıl' : monthLabel(month);
    return {
      action: 'Dashboard görüntülendi',
      category: 'dashboard',
      detail: [cName, ml, year].filter(Boolean).join(' · '),
      level: 'info',
    };
  }

  // Export
  const exportMatch = path.match(/\/export\/(pptx|pdf|xlsx)$/);
  if (exportMatch && method === 'GET') {
    const fmt = exportMatch[1].toUpperCase();
    const year = q.year;
    const month = q.month;
    const ml = month === 'all' || month == null ? 'Tüm yıl' : monthLabel(month);
    return {
      action: ok ? `${fmt} indirildi` : `${fmt} indirilemedi`,
      category: 'export',
      detail: [cName, ml, year].filter(Boolean).join(' · '),
      level,
    };
  }
  if (/\/presentation$/.test(path) && method === 'GET') {
    return {
      action: ok ? 'PPTX indirildi' : 'PPTX indirilemedi',
      category: 'export',
      detail: cName || '—',
      level,
    };
  }

  // Demo / logs
  if (path === '/api/demo/seed' && method === 'POST') {
    return {
      action: ok ? 'Demo veriler yüklendi' : 'Demo yükleme hatası',
      category: 'demo',
      detail: '3 demo şirket seed',
      level,
    };
  }
  if (path.startsWith('/api/logs') && method === 'GET') {
    return {
      action: 'İşlem logları görüntülendi',
      category: 'logs',
      detail: 'Log listesi açıldı',
      level: 'info',
    };
  }
  if (path === '/api/logs' && method === 'DELETE') {
    return {
      action: ok ? 'Loglar temizlendi' : 'Log temizleme hatası',
      category: 'logs',
      detail: 'Tüm işlem logları silindi',
      level: ok ? 'warn' : 'error',
    };
  }

  if (path === '/api/health') {
    return { action: 'Sağlık kontrolü', category: 'system', detail: 'health', level: 'info' };
  }

  return {
    action: `${method} ${path}`,
    category: 'api',
    detail: `HTTP ${status}`,
    level,
  };
}

export function activityMiddleware(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  res.on('finish', () => {
    try {
      const path = (req.originalUrl || req.url || '').split('?')[0];
      // Gürültü / geri besleme: sağlık, oturum ping, log listesi
      if (path === '/api/health') return;
      if (path === '/api/auth/me' && req.method === 'GET') return;
      if (path === '/api/logs' && req.method === 'GET') return;

      // Log listesini her poll'da şişirmemek için: sadece ilk sayfa / filtre değişimi değil her GET log'u
      // kullanıcı "her şeyi" istedi — yine de /api/logs GET'i loglanır ama meta ile ayırt edilir

      const desc = describeApiCall(req, res.statusCode);
      const username =
        req.user?.username ||
        (typeof req.body?.username === 'string' ? req.body.username : null);

      writeActivity({
        userId: req.user?.id ?? null,
        username,
        action: desc.action,
        category: desc.category,
        detail: desc.detail,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        ip: clientIp(req),
        level: desc.level,
        meta: {
          durationMs: Date.now() - started,
          params: req.params,
          query: req.query,
          file: (req as Request & { file?: Express.Multer.File }).file
            ? {
                name: (req as Request & { file?: Express.Multer.File }).file!.originalname,
                size: (req as Request & { file?: Express.Multer.File }).file!.size,
              }
            : undefined,
        },
      });
    } catch (err) {
      console.error('activity log error', err);
    }
  });
  next();
}

export function listActivities(opts: {
  limit?: number;
  offset?: number;
  category?: string;
  username?: string;
  q?: string;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (opts.category && opts.category !== 'all') {
    where.push(`category = ?`);
    params.push(opts.category);
  }
  if (opts.username?.trim()) {
    where.push(`username = ?`);
    params.push(opts.username.trim());
  }
  if (opts.q?.trim()) {
    where.push(`(action LIKE ? OR detail LIKE ? OR path LIKE ? OR username LIKE ?)`);
    const like = `%${opts.q.trim()}%`;
    params.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM activity_logs ${whereSql}`).get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT id, user_id, username, action, category, detail, method, path, status_code, ip, meta_json, level, created_at
       FROM activity_logs
       ${whereSql}
       ORDER BY created_at DESC, rowid DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as {
    id: string;
    user_id: string | null;
    username: string | null;
    action: string;
    category: string;
    detail: string | null;
    method: string | null;
    path: string | null;
    status_code: number | null;
    ip: string | null;
    meta_json: string | null;
    level: string;
    created_at: string;
  }[];

  return {
    total,
    limit,
    offset,
    items: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      action: r.action,
      category: r.category,
      detail: r.detail,
      method: r.method,
      path: r.path,
      statusCode: r.status_code,
      ip: r.ip,
      level: r.level,
      createdAt: r.created_at,
      meta: r.meta_json ? JSON.parse(r.meta_json) : null,
    })),
  };
}

export function clearActivities() {
  db.prepare(`DELETE FROM activity_logs`).run();
}

export function activityStats() {
  const total = (db.prepare(`SELECT COUNT(*) as c FROM activity_logs`).get() as { c: number }).c;
  const byCategory = db
    .prepare(
      `SELECT category, COUNT(*) as c FROM activity_logs GROUP BY category ORDER BY c DESC`,
    )
    .all() as { category: string; c: number }[];
  const last = db
    .prepare(`SELECT created_at FROM activity_logs ORDER BY created_at DESC LIMIT 1`)
    .get() as { created_at: string } | undefined;
  return { total, byCategory, lastAt: last?.created_at ?? null };
}
