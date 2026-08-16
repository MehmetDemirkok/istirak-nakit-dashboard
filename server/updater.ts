import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { GITHUB_TOKEN_FILE, ROOT_DIR, TMP_DIR } from './db.js';

export const PROJECT_ROOT = ROOT_DIR;

/** GitHub repo used for local app updates */
export const UPDATE_REPO = process.env.UPDATE_REPO || 'MehmetDemirkok/istirak-nakit-dashboard';
export const UPDATE_BRANCH = process.env.UPDATE_BRANCH || 'main';

const PRESERVE = new Set([
  'data',
  'node_modules',
  'dist',
  'dist-server',
  '.git',
  '.env',
  '.env.local',
  '.DS_Store',
]);

function getGithubToken(): string | null {
  const fromEnv = process.env.UPDATE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnv?.trim()) return fromEnv.trim();
  const candidates = [
    GITHUB_TOKEN_FILE,
    path.join(PROJECT_ROOT, 'data', 'update-token.txt'),
  ];
  for (const tokenFile of candidates) {
    try {
      if (fs.existsSync(tokenFile)) {
        const t = fs.readFileSync(tokenFile, 'utf8').trim();
        if (t) return t;
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const t = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return t || null;
  } catch {
    return null;
  }
}

function githubHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'istirak-nakit-dashboard-updater',
    Accept: 'application/vnd.github+json',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function readLocalPackage(): { name: string; version: string } {
  const raw = fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8');
  return JSON.parse(raw);
}

export function getLocalVersion(): string {
  try {
    return readLocalPackage().version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Compare semver-ish a vs b: 1 if a>b, -1 if a<b, 0 if equal */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export type UpdateCheckResult = {
  ok: boolean;
  localVersion: string;
  remoteVersion: string | null;
  updateAvailable: boolean;
  repo: string;
  branch: string;
  error?: string;
  checkedAt: string;
};

async function readRemoteVersion(token: string | null): Promise<{ version: string | null; httpStatus: number }> {
  const apiUrl = `https://api.github.com/repos/${UPDATE_REPO}/contents/package.json?ref=${UPDATE_BRANCH}`;
  const rawUrl = `https://raw.githubusercontent.com/${UPDATE_REPO}/${UPDATE_BRANCH}/package.json`;

  const tryJson = async (url: string, headers: Record<string, string>) => {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!res.ok) return { version: null as string | null, httpStatus: res.status };
      const body = (await res.json()) as { content?: string; version?: string };
      if (body.content) {
        const decoded = Buffer.from(body.content, 'base64').toString('utf8');
        const pkg = JSON.parse(decoded) as { version?: string };
        return { version: pkg.version || null, httpStatus: res.status };
      }
      if (body.version) return { version: body.version, httpStatus: res.status };
      return { version: null as string | null, httpStatus: res.status };
    } catch {
      return { version: null as string | null, httpStatus: 0 };
    }
  };

  // Public repo first so end users do not need a GitHub token.
  const viaRaw = await tryJson(rawUrl, {
    'User-Agent': 'istirak-nakit-dashboard-updater',
    Accept: 'application/json',
  });
  if (viaRaw.version) return viaRaw;

  const viaPublicApi = await tryJson(apiUrl, githubHeaders(null));
  if (viaPublicApi.version) return viaPublicApi;

  if (token) {
    const viaApi = await tryJson(apiUrl, githubHeaders(token));
    if (viaApi.version) return viaApi;
    return viaApi;
  }

  return { version: null, httpStatus: viaPublicApi.httpStatus || viaRaw.httpStatus || 0 };
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const localVersion = getLocalVersion();
  const checkedAt = new Date().toISOString();
  const token = getGithubToken();
  try {
    const remote = await readRemoteVersion(token);
    if (!remote.version) {
      const needsToken = remote.httpStatus === 401 || remote.httpStatus === 403 || remote.httpStatus === 404;
      return {
        ok: false,
        localVersion,
        remoteVersion: null,
        updateAvailable: false,
        repo: UPDATE_REPO,
        branch: UPDATE_BRANCH,
        error: needsToken
          ? 'GitHub’a ulaşılamadı. İnternet bağlantısını kontrol edin.'
          : `Uzak sürüm okunamadı (HTTP ${remote.httpStatus || 'ağ hatası'})`,
        checkedAt,
      };
    }

    return {
      ok: true,
      localVersion,
      remoteVersion: remote.version,
      updateAvailable: compareVersions(remote.version, localVersion) > 0,
      repo: UPDATE_REPO,
      branch: UPDATE_BRANCH,
      checkedAt,
    };
  } catch (e) {
    return {
      ok: false,
      localVersion,
      remoteVersion: null,
      updateAvailable: false,
      repo: UPDATE_REPO,
      branch: UPDATE_BRANCH,
      error: e instanceof Error ? e.message : 'Güncelleme kontrolü başarısız',
      checkedAt,
    };
  }
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function rmrf(p: string) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyTree(src: string, dest: string) {
  ensureDir(dest);
  for (const name of fs.readdirSync(src)) {
    if (PRESERVE.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      rmrf(to);
      copyTree(from, to);
    } else {
      ensureDir(path.dirname(to));
      fs.copyFileSync(from, to);
    }
  }
}

async function downloadZip(zipUrl: string, destFile: string, token: string | null) {
  const res = await fetch(zipUrl, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(180000),
    redirect: 'follow',
  });
  if (!res.ok || !res.body) {
    throw new Error(`İndirme başarısız (HTTP ${res.status})`);
  }
  ensureDir(path.dirname(destFile));
  const nodeStream = Readable.fromWeb(res.body as any);
  await pipeline(nodeStream, createWriteStream(destFile));
}

function extractZip(zipFile: string, destDir: string) {
  ensureDir(destDir);
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );
  } else {
    execFileSync('unzip', ['-oq', zipFile, '-d', destDir], { stdio: 'pipe' });
  }
}

function findExtractedRoot(extractDir: string): string {
  const kids = fs.readdirSync(extractDir).filter((n) => !n.startsWith('.'));
  if (kids.length === 1) {
    const p = path.join(extractDir, kids[0]);
    if (fs.statSync(p).isDirectory()) return p;
  }
  return extractDir;
}

function runNpm(args: string[]) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCmd, args, {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    env: { ...process.env },
  });
}

export type ApplyUpdateResult = {
  ok: boolean;
  localVersion: string;
  remoteVersion: string;
  message: string;
  restartScheduled: boolean;
  error?: string;
};

let applyInFlight = false;

export async function applyUpdate(): Promise<ApplyUpdateResult> {
  if (applyInFlight) {
    return {
      ok: false,
      localVersion: getLocalVersion(),
      remoteVersion: '',
      message: '',
      restartScheduled: false,
      error: 'Güncelleme zaten sürüyor',
    };
  }
  applyInFlight = true;
  const localVersion = getLocalVersion();
  const tmpRoot = path.join(TMP_DIR, 'update');
  const zipFile = path.join(tmpRoot, 'update.zip');
  const extractDir = path.join(tmpRoot, 'extract');

  try {
    const check = await checkForUpdate();
    if (!check.ok) {
      return {
        ok: false,
        localVersion,
        remoteVersion: check.remoteVersion || '',
        message: '',
        restartScheduled: false,
        error: check.error || 'Kontrol başarısız',
      };
    }
    if (!check.updateAvailable || !check.remoteVersion) {
      return {
        ok: true,
        localVersion,
        remoteVersion: check.remoteVersion || localVersion,
        message: 'Zaten güncel sürümdesiniz',
        restartScheduled: false,
      };
    }

    rmrf(tmpRoot);
    ensureDir(extractDir);

    const token = getGithubToken();
    // Public archive — no token required. Token is only a fallback.
    const zipUrl = `https://github.com/${UPDATE_REPO}/archive/refs/heads/${UPDATE_BRANCH}.zip`;
    const apiZip = `https://api.github.com/repos/${UPDATE_REPO}/zipball/${UPDATE_BRANCH}`;
    try {
      await downloadZip(zipUrl, zipFile, null);
    } catch {
      await downloadZip(apiZip, zipFile, token);
    }
    extractZip(zipFile, extractDir);
    const srcRoot = findExtractedRoot(extractDir);
    if (!fs.existsSync(path.join(srcRoot, 'package.json'))) {
      throw new Error('İndirilen pakette package.json yok');
    }

    rmrf(path.join(PROJECT_ROOT, 'dist'));
    rmrf(path.join(PROJECT_ROOT, 'dist-server'));

    copyTree(srcRoot, PROJECT_ROOT);

    runNpm(['install']);
    runNpm(['run', 'build']);

    const newVersion = getLocalVersion();
    rmrf(tmpRoot);

    scheduleRestart();

    return {
      ok: true,
      localVersion: newVersion,
      remoteVersion: check.remoteVersion,
      message: `Sürüm ${check.remoteVersion} yüklendi. Uygulama yeniden başlatılıyor…`,
      restartScheduled: true,
    };
  } catch (e) {
    return {
      ok: false,
      localVersion: getLocalVersion(),
      remoteVersion: '',
      message: '',
      restartScheduled: false,
      error: e instanceof Error ? e.message : 'Güncelleme uygulanamadı',
    };
  } finally {
    applyInFlight = false;
    try {
      rmrf(tmpRoot);
    } catch {
      /* ignore */
    }
  }
}

function scheduleRestart() {
  const helper = path.join(PROJECT_ROOT, 'scripts', 'restart-app.mjs');
  setTimeout(() => {
    try {
      spawn(process.execPath, [helper], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
      }).unref();
    } catch (err) {
      console.error('Yeniden başlatma hatası:', err);
    }
    setTimeout(() => process.exit(0), 500);
  }, 1200);
}
