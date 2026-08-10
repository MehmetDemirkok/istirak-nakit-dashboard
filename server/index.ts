import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api } from './routes.js';
import { DATA_DIR } from './db.js';
import { cleanupExpiredSessions, ensureAdminUser } from './auth.js';
import { authRoutes } from './authRoutes.js';

ensureAdminUser();
cleanupExpiredSessions();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api', api);

if (isProd) {
  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
}

app.listen(PORT, HOST, () => {
  console.log(`\n  İştirak Nakit Dashboard`);
  console.log(`  API:  http://${HOST}:${PORT}`);
  console.log(`  Data: ${DATA_DIR}`);
  console.log(`  (Yalnızca lokal — veri dışarı çıkmaz)\n`);
});
