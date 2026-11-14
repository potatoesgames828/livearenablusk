#!/usr/bin/env node
/**
 * Supervisor local: sobe todos os serviços da LIVE ARENA como processos
 * separados e reinicia automaticamente quem cair (com backoff).
 * Em produção esse papel é do Docker/systemd/orquestrador.
 *
 * Uso: node scripts/start-all.mjs [--only api,worker] [--no-web]
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

const env = { ...loadEnv(path.join(root, '.env')), ...process.env };
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const noWeb = args.includes('--no-web');

const services = [
  { name: 'api', cmd: 'node', args: ['apps/api/dist/main.js'] },
  { name: 'realtime', cmd: 'node', args: ['apps/realtime/dist/main.js'] },
  { name: 'worker', cmd: 'node', args: ['apps/worker/dist/main.js'] },
  { name: 'game-runner', cmd: 'node', args: ['apps/game-runner/dist/main.js'] },
  { name: 'connector', cmd: 'node', args: ['apps/connector/dist/main.js'] },
  { name: 'stream-manager', cmd: 'node', args: ['apps/stream-manager/dist/main.js'] },
  { name: 'web', cmd: 'node', args: ['node_modules/next/dist/bin/next', 'start', '-p', env.WEB_PORT ?? '3000'], cwd: 'apps/web' },
].filter((s) => (!only || only.includes(s.name)) && !(noWeb && s.name === 'web'));

const colors = ['\x1b[36m', '\x1b[35m', '\x1b[33m', '\x1b[32m', '\x1b[34m', '\x1b[31m', '\x1b[37m'];
const procs = new Map();
let shuttingDown = false;

function start(svc, i, attempt = 0) {
  const color = colors[i % colors.length];
  const child = spawn(svc.cmd, svc.args, { cwd: path.join(root, svc.cwd ?? '.'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.set(svc.name, child);
  const prefix = `${color}[${svc.name}]\x1b[0m `;
  const pipe = (stream) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        process.stdout.write(prefix + buf.slice(0, idx) + '\n');
        buf = buf.slice(idx + 1);
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  const startedAt = Date.now();
  child.on('exit', (code, signal) => {
    procs.delete(svc.name);
    if (shuttingDown) return;
    const healthy = Date.now() - startedAt > 30_000;
    const next = healthy ? 0 : attempt + 1;
    const delay = Math.min(30_000, 500 * 2 ** next);
    process.stdout.write(`${prefix}saiu (code=${code} signal=${signal}); reiniciando em ${delay}ms\n`);
    setTimeout(() => start(svc, i, next), delay);
  });
}

services.forEach((s, i) => start(s, i));

const stop = () => {
  shuttingDown = true;
  for (const [, p] of procs) p.kill('SIGTERM');
  setTimeout(() => process.exit(0), 12_000).unref();
  const check = setInterval(() => {
    if (procs.size === 0) {
      clearInterval(check);
      process.exit(0);
    }
  }, 200);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
