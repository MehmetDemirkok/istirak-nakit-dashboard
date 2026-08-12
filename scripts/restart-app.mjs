/**
 * Güncelleme sonrası uygulamayı yeniden başlatır.
 * Ana süreç önce çıkar; bu script kısa bekleyip Baslat / npm start çalıştırır.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await new Promise((r) => setTimeout(r, 2500));

const isWin = process.platform === 'win32';
const bat = path.join(root, 'Baslat.bat');
const cmd = path.join(root, 'Baslat.command');

if (isWin && existsSync(bat)) {
  spawn('cmd.exe', ['/c', bat], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();
} else if (!isWin && existsSync(cmd)) {
  spawn('open', [cmd], { cwd: root, detached: true, stdio: 'ignore' }).unref();
} else {
  spawn(isWin ? 'npm.cmd' : 'npm', ['start'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production' },
  }).unref();
}

process.exit(0);
