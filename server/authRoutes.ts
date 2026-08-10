import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { AVATARS_DIR } from './db.js';
import {
  authenticate,
  createSession,
  destroySession,
  getUserAvatarPath,
  getUserBySession,
  setUserAvatarPath,
  updateUserProfile,
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

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      cb(null, `${req.user?.id || 'user'}-${Date.now()}${safeExt}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(null, ok);
  },
  limits: { fileSize: 3 * 1024 * 1024 },
});

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
  res.json({ token, user });
});

authRoutes.post('/logout', (req, res) => {
  const token = readToken(req);
  const user = getUserBySession(token);
  if (user) req.user = user;
  destroySession(token);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRoutes.get('/me', (req, res) => {
  const user = getUserBySession(readToken(req));
  if (!user) return res.status(401).json({ error: 'Oturum yok' });
  res.json({ user });
});

authRoutes.put('/profile', requireAuth, (req, res) => {
  try {
    const body = req.body as { firstName?: string; lastName?: string; email?: string };
    const user = updateUserProfile(req.user!.id, body);
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Profil güncellenemedi' });
  }
});

authRoutes.post('/avatar', requireAuth, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Geçersiz görsel (jpg/png/webp, max 3MB)' });
    }
    if (!req.file) return res.status(400).json({ error: 'Fotoğraf gerekli' });
    try {
      const user = setUserAvatarPath(req.user!.id, req.file.path);
      res.json({ user });
    } catch (e) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      res.status(500).json({ error: e instanceof Error ? e.message : 'Yükleme hatası' });
    }
  });
});

authRoutes.delete('/avatar', requireAuth, (req, res) => {
  try {
    const user = setUserAvatarPath(req.user!.id, null);
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Silinemedi' });
  }
});

authRoutes.get('/avatar/:userId', requireAuth, (req, res) => {
  const filePath = getUserAvatarPath(req.params.userId);
  if (!filePath) return res.status(404).json({ error: 'Fotoğraf yok' });
  res.sendFile(path.resolve(filePath));
});
