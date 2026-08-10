import crypto from 'node:crypto';
import fs from 'node:fs';
import { db } from './db.js';

const SESSION_DAYS = 14;
const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'Admin123!';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarUrl: string | null;
  displayName: string;
  initials: string;
}

type UserRow = {
  id: string;
  username: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_path: string | null;
};

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function mapUser(row: UserRow): AuthUser {
  const firstName = row.first_name?.trim() || null;
  const lastName = row.last_name?.trim() || null;
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') || row.username;
  let initials = '';
  if (firstName || lastName) {
    initials = `${(firstName || '').slice(0, 1)}${(lastName || '').slice(0, 1)}`.toUpperCase();
  }
  if (!initials) initials = row.username.slice(0, 1).toUpperCase();

  const hasAvatar = !!(row.avatar_path && fs.existsSync(row.avatar_path));
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    firstName,
    lastName,
    email: row.email?.trim() || null,
    avatarUrl: hasAvatar ? `/api/auth/avatar/${row.id}` : null,
    displayName,
    initials,
  };
}

const USER_SELECT = `id, username, role, first_name, last_name, email, avatar_path`;

export function getUserById(id: string): AuthUser | null {
  const row = db.prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`).get(id) as
    | UserRow
    | undefined;
  return row ? mapUser(row) : null;
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
    .prepare(
      `SELECT id, username, role, password_hash, salt, first_name, last_name, email, avatar_path
       FROM users WHERE username = ?`,
    )
    .get(username.trim()) as
    | (UserRow & { password_hash: string; salt: string })
    | undefined;
  if (!row) return null;
  const attempt = hashPassword(password, row.salt);
  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(row.password_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return mapUser(row);
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
      `SELECT u.id, u.username, u.role, u.first_name, u.last_name, u.email, u.avatar_path, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as (UserRow & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(token);
    return null;
  }
  return mapUser(row);
}

export function updateUserProfile(
  userId: string,
  input: { firstName?: string; lastName?: string; email?: string },
): AuthUser {
  const first = (input.firstName ?? '').trim() || null;
  const last = (input.lastName ?? '').trim() || null;
  const email = (input.email ?? '').trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Geçerli bir e-posta adresi girin');
  }
  db.prepare(
    `UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?`,
  ).run(first, last, email, userId);
  const user = getUserById(userId);
  if (!user) throw new Error('Kullanıcı bulunamadı');
  return user;
}

export function setUserAvatarPath(userId: string, avatarPath: string | null): AuthUser {
  const prev = db.prepare(`SELECT avatar_path FROM users WHERE id = ?`).get(userId) as
    | { avatar_path: string | null }
    | undefined;
  if (prev?.avatar_path && prev.avatar_path !== avatarPath && fs.existsSync(prev.avatar_path)) {
    try {
      fs.unlinkSync(prev.avatar_path);
    } catch {
      /* ignore */
    }
  }
  db.prepare(`UPDATE users SET avatar_path = ? WHERE id = ?`).run(avatarPath, userId);
  const user = getUserById(userId);
  if (!user) throw new Error('Kullanıcı bulunamadı');
  return user;
}

export function getUserAvatarPath(userId: string): string | null {
  const row = db.prepare(`SELECT avatar_path FROM users WHERE id = ?`).get(userId) as
    | { avatar_path: string | null }
    | undefined;
  if (!row?.avatar_path || !fs.existsSync(row.avatar_path)) return null;
  return row.avatar_path;
}

export function cleanupExpiredSessions(): void {
  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
}

/** Uygulama her açıldığında tüm oturumları sıfırla — login zorunlu olsun. */
export function clearAllSessions(): void {
  db.prepare(`DELETE FROM sessions`).run();
}
