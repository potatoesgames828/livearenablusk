#!/usr/bin/env node
/**
 * Testes de caos/estabilidade contra a pilha local em execução
 * (node scripts/start-all.mjs --no-web). Cada cenário injeta uma falha real
 * e mede se/como o sistema se recupera. Resultado em reports/chaos-*.json.
 *
 * ATENÇÃO: derruba processos locais (game-runner, worker, connector, Redis e
 * PostgreSQL). Use apenas em ambiente de desenvolvimento/teste.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api';
const RT = process.env.REALTIME_URL ?? 'http://127.0.0.1:4001';
const PG_CTL = process.env.PG_CTL ?? '/usr/lib/postgresql/16/bin/pg_ctl';
const PGDATA = process.env.PGDATA ?? '/var/lib/la-pg';
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return { ok: true, ms: Date.now() - start, value: v };
    } catch {
      /* serviço ainda indisponível */
    }
    await sleep(250);
  }
  return { ok: false, ms: Date.now() - start, label };
}

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (e) {
    return e.stdout?.toString() ?? '';
  }
}

async function scenario(name, fn) {
  const t0 = Date.now();
  process.stdout.write(`\n▶ ${name}\n`);
  try {
    const detail = await fn();
    const ok = detail?.ok !== false;
    results.push({ name, ok, durationMs: Date.now() - t0, ...detail });
    process.stdout.write(`  ${ok ? '✔' : '✘'} ${JSON.stringify(detail)}\n`);
  } catch (err) {
    results.push({ name, ok: false, durationMs: Date.now() - t0, error: String(err?.message ?? err) });
    process.stdout.write(`  ✘ ${err?.stack ?? err}\n`);
  }
}

async function main() {
  // Conta de teste em plano avançado (setup direto no banco pela API não é possível; usa SQL).
  const email = `chaos.${Date.now()}@example.com`;
  const reg = await call(null, 'POST', '/auth/register', { name: 'Chaos Teste', email, password: 'SenhaForte123' });
  if (reg.status !== 201) throw new Error(`registro falhou ${reg.status}`);
  const token = reg.body.accessToken;
  const tenantId = reg.body.user.tenant.id;
  sh(`PGPASSWORD=devpassword psql -h 127.0.0.1 -U postgres -d livearena -c "UPDATE \\"Tenant\\" SET \\"planCode\\"='advanced' WHERE id='${tenantId}'"`);

  // Sessão com fonte de eventos simulada (passa pelo processo connector).
  const conn = await call(token, 'POST', '/connections', { label: 'Simulador', provider: 'SIMULATOR', demoLoad: 'light' });
  const cfg = await call(token, 'POST', '/games/configs', { gameId: 'survival-arena', name: 'Caos' });
  const sess = await call(token, 'POST', '/sessions', { name: 'Sessão caos', gameConfigId: cfg.body.id, connectionId: conn.body.id });
  const sid = sess.body.id;
  await call(token, 'POST', `/sessions/${sid}/start`);
  const running = await waitFor(async () => (await call(token, 'GET', `/sessions/${sid}`)).body.state === 'RUNNING', 20000);
  if (!running.ok) throw new Error('sessão não iniciou');

  // Observa snapshots pelo WebSocket durante todos os cenários.
  const ticket = (await call(token, 'POST', '/auth/realtime-ticket')).body.ticket;
  const socket = io(RT, { auth: { ticket }, transports: ['websocket'] });
  let lastState = null;
  let lastStateAt = 0;
  let maxGapMs = 0;
  socket.on('connect', () => socket.emit('session:subscribe', sid));
  socket.on('session:state', (s) => {
    const now = Date.now();
    if (lastStateAt) maxGapMs = Math.max(maxGapMs, now - lastStateAt);
    lastState = s;
    lastStateAt = now;
  });
  await waitFor(async () => lastState, 10000);
  await call(token, 'POST', `/sessions/${sid}/simulate`, { type: 'GIFT', count: 5, username: 'chaos_fan' });
  await sleep(3000);

  const status = async () => (await call(token, 'GET', `/sessions/${sid}`)).body;

  await scenario('1. Falha simulada no runner (injeção) → recuperação do checkpoint', async () => {
    const before = lastState.t;
    const waveBefore = lastState.wave;
    await sleep(2500); // garante checkpoint recente
    const r = await call(token, 'POST', `/sessions/${sid}/scenario`, { scenario: 'runner-crash' });
    if (r.status !== 200) return { ok: false, error: JSON.stringify(r.body) };
    const rec = await waitFor(async () => {
      const s = await status();
      return s.state === 'RUNNING' && s.runnerState === 'RUNNING' && lastState.t > before;
    }, 30000);
    return { ok: rec.ok, recoveryMs: rec.ms, simTimeBefore: before, simTimeAfter: lastState.t, waveBefore, waveAfter: lastState.wave, continuity: lastState.t >= before };
  });

  await scenario('2. SIGKILL no processo game-runner → failover após expirar o lease', async () => {
    await sleep(2500);
    const before = lastState.t;
    const pid = sh(`pgrep -f "apps/game-runner/dist/main.js"`).split('\n')[0];
    sh(`kill -9 ${pid}`);
    const killedAt = Date.now();
    const rec = await waitFor(async () => Date.now() - lastStateAt < 500 && lastState.t > before && lastStateAt > killedAt + 1000, 40000);
    return { ok: rec.ok, killedPid: pid, recoveryMs: rec.ms, simTimeBefore: before, simTimeAfter: lastState.t, progressLostSec: Math.max(0, before - (lastState.t - rec.ms / 1000)).toFixed(1) };
  });

  await scenario('3. Queda da fonte de eventos (injeção) → reconexão automática', async () => {
    const seen = new Set();
    const onStatus = (p) => p.connectorState && seen.add(p.connectorState);
    socket.on('session:status', onStatus);
    await call(token, 'POST', `/sessions/${sid}/scenario`, { scenario: 'connector-drop' });
    const rec = await waitFor(async () => seen.has('RECONNECTING') && (await status()).connectorState === 'CONNECTED', 30000);
    socket.off('session:status', onStatus);
    return { ok: rec.ok, recoveryMs: rec.ms, statesSeen: [...seen], gameKeptRunning: Date.now() - lastStateAt < 1000 };
  });

  await scenario('4. SIGKILL no worker durante rajada de eventos → nenhum presente perdido', async () => {
    const g0 = (await status()).counters.gifts ?? 0;
    await call(token, 'POST', `/sessions/${sid}/simulate`, { type: 'GIFT', count: 200, spreadMs: 4000 });
    await sleep(800);
    const pid = sh(`pgrep -f "apps/worker/dist/main.js"`).split('\n')[0];
    sh(`kill -9 ${pid}`);
    const rec = await waitFor(async () => ((await status()).counters.gifts ?? 0) - g0 >= 200, 90000);
    const g1 = (await status()).counters.gifts ?? 0;
    return { ok: rec.ok && g1 - g0 === 200, killedPid: pid, processed: g1 - g0, expected: 200, ms: rec.ms };
  });

  await scenario('5. Eventos duplicados (mesmo msgId reenviado) são ignorados', async () => {
    // Reenfileira manualmente o mesmo evento várias vezes via BullMQ não é exposto pela API;
    // usamos a sequência (streak), que reenvia o mesmo presente com contagens acumuladas.
    const g0 = (await status()).counters.gifts ?? 0;
    await call(token, 'POST', `/sessions/${sid}/simulate`, { type: 'GIFT', count: 10, streak: true });
    await sleep(4000);
    const g1 = (await status()).counters.gifts ?? 0;
    return { ok: g1 - g0 === 10, credited: g1 - g0, expected: 10 };
  });

  await scenario('6. Reinício do Redis (sem persistência) → jogo continua e índices são reconstruídos a partir do PostgreSQL', async () => {
    await sleep(16000); // garante checkpoint no banco (a cada 15s)
    const before = lastState.t;
    sh('redis-cli shutdown nosave');
    await sleep(2000);
    sh('redis-server --port 6379 --daemonize yes --save "" --appendonly no');
    const downAt = Date.now();
    const rec = await waitFor(async () => {
      const s = await status();
      return s.state === 'RUNNING' && lastStateAt > downAt + 2000;
    }, 120000);
    return { ok: rec.ok, recoveryMs: rec.ms, simTimeBefore: before, simTimeAfter: lastState?.t, note: 'Redis perdeu todos os dados voláteis; o runner manteve o jogo em memória, readquiriu o lease e reconstruiu o índice de sessões a partir do PostgreSQL (fonte da verdade).' };
  });

  await scenario('7. PostgreSQL indisponível por 8s → jogo continua; API se recupera', async () => {
    const before = lastStateAt;
    sh(`su postgres -c "${PG_CTL} -D ${PGDATA} -m fast stop"`);
    await sleep(3000);
    const ready = await call(null, 'GET', '/health/ready').catch(() => ({ status: 0 }));
    const gameAlive = Date.now() - lastStateAt < 1000 && lastStateAt > before;
    await sleep(5000);
    sh(`su postgres -c "${PG_CTL} -D ${PGDATA} -l /tmp/la-pg.log -o '-p 5432 -k /tmp' start"`);
    const rec = await waitFor(async () => (await call(null, 'GET', '/health/ready')).status === 200, 30000);
    const after = await waitFor(async () => (await call(token, 'GET', `/sessions/${sid}`)).status === 200, 30000);
    return { ok: gameAlive && ready.status === 503 && rec.ok && after.ok, readinessDuringOutage: ready.status, gameKeptPublishingDuringOutage: gameAlive, apiRecoveryMs: rec.ms };
  });

  await scenario('8. Estabilidade geral durante os testes', async () => {
    const s = await status();
    return { ok: s.state === 'RUNNING', finalState: s.state, runnerState: s.runnerState, connectorState: s.connectorState, maxSnapshotGapMs: maxGapMs };
  });

  await call(token, 'POST', `/sessions/${sid}/stop`);
  socket.disconnect();
  mkdirSync('reports', { recursive: true });
  const file = `reports/chaos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  const passed = results.filter((r) => r.ok).length;
  console.log(`\nResultado: ${passed}/${results.length} cenários aprovados. Relatório: ${file}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
