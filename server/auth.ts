import crypto from 'node:crypto';
import { db } from './db.js';

const SESSION_DAYS = 14;
const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'Admin123!';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function ensureAdminUser(): void {
  const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(DEFAULT_ADMIN_USER);
  if (existing) return;

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(DEFAULT_ADMIN_PASS, salt);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, salt, role) VALUES (?, ?, ?, ?, 'admin')`,
  ).run(id, DEFAULT_ADMIN_USER, passwordHash, salt);
  console.log(`  Varsayılan admin: ${DEFAULT_ADMIN_USER} / ${DEFAULT_ADMIN_PASS}`);
}

export function authenticate(username: string, password: string): AuthUser | null {
  const row = db
    .prepare(`SELECT id, username, role, password_hash, salt FROM users WHERE username = ?`)
    .get(username.trim()) as
    | { id: string; username: string; role: string; password_hash: string; salt: string }
    | undefined;
  if (!row) return null;
  const attempt = hashPassword(password, row.salt);
  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(row.password_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { id: row.id, username: row.username, role: row.role };
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    expires,
  );
  return token;
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function getUserBySession(token: string | undefined | null): AuthUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as
    | { id: string; username: string; role: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(token);
    return null;
  }
  return { id: row.id, username: row.username, role: row.role };
}

export function cleanupExpiredSessions(): void {
  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
}
