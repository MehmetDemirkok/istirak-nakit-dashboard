import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import {
  authenticate,
  createSession,
  destroySession,
  getUserBySession,
  type AuthUser,
} from './auth.js';

const COOKIE = 'istirak_session';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.cookies?.[COOKIE];
  if (typeof cookie === 'string' && cookie) return cookie;
  return undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getUserBySession(readToken(req));
  if (!user) {
    return res.status(401).json({ error: 'Oturum gerekli. Lütfen giriş yapın.' });
  }
  req.user = user;
  next();
}

export const authRoutes = Router();

authRoutes.post('/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }
  const user = authenticate(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
  }
  const token = createSession(user.id);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 14 * 86400000,
    path: '/',
  });
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

authRoutes.post('/logout', (req, res) => {
  destroySession(readToken(req));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRoutes.get('/me', (req, res) => {
  const user = getUserBySession(readToken(req));
  if (!user) return res.status(401).json({ error: 'Oturum yok' });
  res.json({ user });
});
