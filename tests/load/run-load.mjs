#!/usr/bin/env node
/**
 * Teste de carga progressivo contra a pilha LOCAL (nunca contra serviços
 * externos). Para cada estágio (N sessões simultâneas) mede:
 *  - latência ponta a ponta: chamada de simulação → evento recebido no WebSocket;
 *  - eventos enviados x processados (contadores) e erros;
 *  - FPS efetivo de snapshots recebidos pelos clientes;
 *  - CPU e memória de cada serviço (ps).
 * Uso: node tests/load/run-load.mjs [estágios=1,5,10,20] [segundos=40] [clientesPorSessao=3]
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api';
const RT = process.env.REALTIME_URL ?? 'http://127.0.0.1:4001';
const STAGES = (process.argv[2] ?? '1,5,10,20').split(',').map(Number);
const DURATION = Number(process.argv[3] ?? 40);
const CLIENTS = Number(process.argv[4] ?? 3);
const GAMES = ['snake-live', 'battle-arena', 'avatar-race', 'plinko-live', 'survival-arena'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => `10.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}`;

async function call(token, method, path, body) {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip(), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let b = null;
  try { b = JSON.parse(text); } catch { /* */ }
  return { s: r.status, b };
}

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}

const HZ = 100; // clock ticks (padrão Linux)
let lastTicks = new Map();
let lastAt = Date.now();
/** CPU instantânea (delta de utime+stime em /proc) e RSS por serviço. */
function sampleProcs() {
  const out = {};
  const now = Date.now();
  const dt = Math.max(0.001, (now - lastAt) / 1000);
  const ticks = new Map();
  const lines = execSync('ps -eo pid,rss,args').toString().split('\n');
  for (const l of lines) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l);
    if (!m) continue;
    const args = m[3];
    const svc = /apps\/([a-z-]+)\/dist\/main\.js/.exec(args)?.[1] ?? (args.includes('next-server') ? 'web' : args.startsWith('redis-server') ? 'redis' : /postgres/.test(args) ? 'postgres' : null);
    if (!svc) continue;
    let t = 0;
    try {
      const stat = readFileSync(`/proc/${m[1]}/stat`, 'utf8').split(') ')[1].split(' ');
      t = Number(stat[11]) + Number(stat[12]);
    } catch { continue; }
    ticks.set(m[1], t);
    const prev = lastTicks.get(m[1]);
    out[svc] ??= { cpu: 0, rssMb: 0 };
    if (prev !== undefined) out[svc].cpu += ((t - prev) / HZ / dt) * 100;
    out[svc].rssMb += Number(m[2]) / 1024;
  }
  lastTicks = ticks;
  lastAt = now;
  return out;
}

async function setupSession(i) {
  const reg = await call(null, 'POST', '/auth/register', { name: `Carga ${i}`, email: `load.${Date.now()}.${i}.${Math.random() * 1e6 | 0}@example.com`, password: 'SenhaForte123' });
  if (reg.s !== 201) throw new Error(`registro ${reg.s}`);
  execSync(`PGPASSWORD=devpassword psql -h 127.0.0.1 -U postgres -d livearena -qc "UPDATE \\"Tenant\\" SET \\"planCode\\"='advanced' WHERE id='${reg.b.user.tenant.id}'"`);
  const t = reg.b.accessToken;
  const cfg = await call(t, 'POST', '/games/configs', { gameId: GAMES[i % GAMES.length], name: 'Carga' });
  const s = await call(t, 'POST', '/sessions', { name: `Sessão ${i}`, gameConfigId: cfg.b.id });
  await call(t, 'POST', `/sessions/${s.b.id}/start`);
  return { token: t, sessionId: s.b.id, gameId: GAMES[i % GAMES.length] };
}

async function runStage(n) {
  process.stdout.write(`\n▶ Estágio: ${n} sessão(ões), ${CLIENTS} cliente(s) WebSocket cada, ${DURATION}s\n`);
  const sessions = [];
  for (let i = 0; i < n; i++) sessions.push(await setupSession(i));
  // aguarda todas em execução
  for (const s of sessions) {
    for (let k = 0; k < 60; k++) {
      if ((await call(s.token, 'GET', `/sessions/${s.sessionId}`)).b?.state === 'RUNNING') break;
      await sleep(500);
    }
  }
  const latencies = [];
  const pending = new Map();
  const sockets = [];
  let snapshots = 0;
  let errors = 0;
  let sentGifts = 0;
  let sentLikes = 0;
  for (const s of sessions) {
    for (let c = 0; c < CLIENTS; c++) {
      const ticket = (await call(s.token, 'POST', '/auth/realtime-ticket')).b.ticket;
      const sock = io(RT, { auth: { ticket }, transports: ['websocket'], forceNew: true });
      sock.on('connect', () => sock.emit('session:subscribe', s.sessionId));
      sock.on('session:state', () => snapshots++);
      if (c === 0) {
        sock.on('session:events', (e) => {
          const key = `${s.sessionId}:${e.user}`;
          const t0 = pending.get(key);
          if (t0 && e.type === 'GIFT') {
            latencies.push(Date.now() - t0);
            pending.delete(key);
          }
        });
      }
      sockets.push(sock);
    }
  }
  await sleep(2000);
  const before = sampleProcs();
  sampleProcs();
  const cpuSamples = [];
  const sampler = setInterval(() => cpuSamples.push(sampleProcs()), 3000);
  const snapStart = snapshots;
  const t0 = Date.now();
  let seq = 0;
  // Cada sessão: 1 chamada de presente (com usuário único p/ medir latência) a cada 1,5s
  // e 1 rajada de 300 curtidas a cada 3s.
  const loops = sessions.map(async (s) => {
    let tick = 0;
    while (Date.now() - t0 < DURATION * 1000) {
      const user = `lat${seq++}`;
      pending.set(`${s.sessionId}:${user}`, Date.now());
      const r = await call(s.token, 'POST', `/sessions/${s.sessionId}/simulate`, { type: 'GIFT', count: 5, username: user });
      if (r.s !== 200) errors++;
      else sentGifts += 5;
      if (tick++ % 2 === 0) {
        const l = await call(s.token, 'POST', `/sessions/${s.sessionId}/simulate`, { type: 'LIKE', count: 300 });
        if (l.s !== 200) errors++;
        else sentLikes += 300;
      }
      await sleep(1500);
    }
  });
  await Promise.all(loops);
  await sleep(4000); // drenagem
  clearInterval(sampler);
  const elapsed = (Date.now() - t0) / 1000;
  let processedGifts = 0;
  let processedLikes = 0;
  for (const s of sessions) {
    const d = (await call(s.token, 'GET', `/sessions/${s.sessionId}`)).b;
    processedGifts += d.counters.gifts ?? 0;
    processedLikes += d.counters.likes ?? 0;
  }
  const avg = {};
  for (const smp of cpuSamples) for (const [k, v] of Object.entries(smp)) {
    avg[k] ??= { cpu: 0, rssMb: 0, n: 0 };
    avg[k].cpu += v.cpu;
    avg[k].rssMb = Math.max(avg[k].rssMb, v.rssMb);
    avg[k].n++;
  }
  const resources = Object.fromEntries(Object.entries(avg).map(([k, v]) => [k, { cpuPctAvg: Math.round(v.cpu / Math.max(1, v.n - 1)), rssMbMax: Math.round(v.rssMb) }]));
  for (const sock of sockets) sock.disconnect();
  for (const s of sessions) await call(s.token, 'POST', `/sessions/${s.sessionId}/stop`);
  const result = {
    sessions: n,
    wsClients: sockets.length,
    durationSec: Math.round(elapsed),
    giftsSent: sentGifts,
    giftsProcessed: processedGifts,
    likesSent: sentLikes,
    likesProcessed: processedLikes,
    apiErrors: errors,
    e2eLatencyMs: { p50: pct(latencies, 50), p95: pct(latencies, 95), p99: pct(latencies, 99), samples: latencies.length },
    snapshotsPerClientPerSec: Math.round(((snapshots - snapStart) / sockets.length / elapsed) * 10) / 10,
    resources,
    baselineRssMb: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, Math.round(v.rssMb)])),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const results = [];
for (const n of STAGES) {
  results.push(await runStage(n));
  await sleep(5000);
}
mkdirSync('reports', { recursive: true });
const file = `reports/load-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), host: { cpus: execSync('nproc').toString().trim(), memGb: execSync("free -g | awk '/Mem:/{print $2}'").toString().trim() }, results }, null, 2));
console.log(`\nRelatório: ${file}`);
process.exit(0);
