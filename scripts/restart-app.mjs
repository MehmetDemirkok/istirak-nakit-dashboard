/**
 * Relaunches the app after an in-app update.
 * The main process exits first; this script waits briefly then runs Start / npm start.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await new Promise((r) => setTimeout(r, 2500));

const isWin = process.platform === 'win32';
const bat = path.join(root, 'Start.bat');
const cmd = path.join(root, 'Start.command');
const legacyBat = path.join(root, 'Baslat.bat');
const legacyCmd = path.join(root, 'Baslat.command');

if (isWin && existsSync(bat)) {
  spawn('cmd.exe', ['/c', bat], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();
} else if (!isWin && existsSync(cmd)) {
  spawn('open', [cmd], { cwd: root, detached: true, stdio: 'ignore' }).unref();
} else if (isWin && existsSync(legacyBat)) {
  spawn('cmd.exe', ['/c', legacyBat], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();
} else if (!isWin && existsSync(legacyCmd)) {
  spawn('open', [legacyCmd], { cwd: root, detached: true, stdio: 'ignore' }).unref();
} else {
  spawn(isWin ? 'npm.cmd' : 'npm', ['start'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production' },
  }).unref();
}

process.exit(0);
