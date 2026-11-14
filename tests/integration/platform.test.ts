/**
 * Testes de integração contra a pilha em execução (API, realtime, worker,
 * game-runner, connector). Rode `pnpm build && node scripts/start-all.mjs --no-web`
 * e depois `pnpm test:integration`. Ver docs/DEVELOPMENT.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { connectSocket, raw, register, sleep, startDemoSession, uniqueEmail, waitFor, type Client } from './helpers';

let a: Client;
let b: Client;
const sockets: Socket[] = [];

beforeAll(async () => {
  const health = await raw('GET', '/health/ready');
  if (health.status !== 200) throw new Error('A pilha não está rodando. Execute: node scripts/start-all.mjs --no-web');
  a = await register('Ana Teste');
  b = await register('Bruno Teste');
});

afterAll(() => {
  for (const s of sockets) s.disconnect();
});

describe('autenticação', () => {
  it('login, me, refresh com rotação e detecção de reuso', async () => {
    const email = uniqueEmail('login');
    await raw('POST', '/auth/register', { name: 'Login Teste', email, password: 'SenhaForte123' });
    const bad = await raw('POST', '/auth/login', { email, password: 'errada123456' });
    expect(bad.status).toBe(401);
    expect((bad.body as { error: { code: string } }).error.code).toBe('AUTH_INVALID_CREDENTIALS');
    const ok = await raw('POST', '/auth/login', { email, password: 'SenhaForte123' });
    expect(ok.status).toBe(200);
    const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    // Refresh sem cabeçalho anti-CSRF é recusado.
    expect((await raw('POST', '/auth/refresh', undefined, { cookie })).status).toBe(403);
    const r1 = await raw('POST', '/auth/refresh', undefined, { cookie, 'x-requested-with': 'live-arena' });
    expect(r1.status).toBe(200);
    const cookie2 = (r1.headers.get('set-cookie') ?? '').split(';')[0]!;
    // Reuso do token antigo revoga a família inteira.
    expect((await raw('POST', '/auth/refresh', undefined, { cookie, 'x-requested-with': 'live-arena' })).status).toBe(401);
    expect((await raw('POST', '/auth/refresh', undefined, { cookie: cookie2, 'x-requested-with': 'live-arena' })).status).toBe(401);
  });

  it('rejeita senha fraca e e-mail duplicado', async () => {
    const weak = await raw('POST', '/auth/register', { name: 'X Y', email: uniqueEmail(), password: 'curta' });
    expect(weak.status).toBe(400);
    const email = uniqueEmail('dup');
    await raw('POST', '/auth/register', { name: 'Dup Um', email, password: 'SenhaForte123' });
    const dup = await raw('POST', '/auth/register', { name: 'Dup Dois', email, password: 'SenhaForte123' });
    expect(dup.status).toBe(409);
  });

  it('exige autenticação nas rotas privadas', async () => {
    expect((await raw('GET', '/sessions')).status).toBe(401);
    expect((await raw('GET', '/sessions', undefined, { authorization: 'Bearer lixo' })).status).toBe(401);
  });

  it('recuperação de senha pela caixa de saída de desenvolvimento', async () => {
    const email = uniqueEmail('reset');
    await raw('POST', '/auth/register', { name: 'Reset Teste', email, password: 'SenhaForte123' });
    expect((await raw('POST', '/auth/forgot-password', { email })).status).toBe(200);
    const outbox = (await raw('GET', '/auth/dev-outbox')).body as Array<{ to: string; text: string }>;
    const mail = outbox.find((m) => m.to === email);
    expect(mail).toBeDefined();
    const token = decodeURIComponent(/token=([^\s]+)/.exec(mail!.text)![1]!);
    expect((await raw('POST', '/auth/reset-password', { token, password: 'NovaSenha456' })).status).toBe(200);
    expect((await raw('POST', '/auth/reset-password', { token, password: 'OutraSenha789' })).status).toBe(400);
    expect((await raw('POST', '/auth/login', { email, password: 'NovaSenha456' })).status).toBe(200);
  });

  it('não permite acessar a administração sem papel de plataforma', async () => {
    expect((await a.call('GET', '/admin/overview')).status).toBe(403);
  });
});

describe('fluxo completo: jogo + simulador + tempo real', () => {
  it('evento simulado chega ao jogo, ao feed em tempo real e ao ranking', async () => {
    const { sessionId } = await startDemoSession(a, 'snake-live');
    const ticket = (await a.call<{ ticket: string }>('POST', '/auth/realtime-ticket')).body.ticket;
    const socket = await connectSocket(ticket);
    sockets.push(socket);
    const states: Array<{ gameId: string; foods: Array<{ owner?: string; kind: string }> }> = [];
    const feed: Array<{ type: string; simulated: boolean }> = [];
    socket.on('session:state', (s) => states.push(s));
    socket.on('session:events', (e) => feed.push(e));
    const ack = await socket.emitWithAck('session:subscribe', sessionId);
    expect(ack).toEqual({ ok: true });

    const sim = await a.call<{ queued: number }>('POST', `/sessions/${sessionId}/simulate`, { type: 'GIFT', count: 3, username: 'carla_teste' });
    expect(sim.status).toBe(200);
    expect(sim.body.queued).toBe(3);

    await waitFor(async () => states.length > 5);
    expect(states.at(-1)!.gameId).toBe('snake-live');
    // Presentes criaram comida especial com o nome de quem enviou.
    await waitFor(async () => states.some((s) => s.foods.some((f) => f.kind === 'special' && f.owner === 'carla_teste')));
    await waitFor(async () => feed.filter((e) => e.type === 'GIFT').length >= 3);
    expect(feed.every((e) => e.simulated)).toBe(true);

    // Eventos persistidos e consultáveis.
    const events = await waitFor(async () => {
      const r = await a.call<{ items: Array<{ type: string; simulated: boolean }> }>('GET', `/sessions/${sessionId}/events?type=GIFT`);
      return r.body.items.length >= 3 ? r.body.items : null;
    });
    expect(events.every((e) => e.simulated)).toBe(true);

    // Ranking recebe participação (presentes geram pontos).
    const lb = await waitFor(async () => {
      const r = await a.call<{ items: Array<{ realName: string; score: number; simulated: boolean }> }>('GET', `/leaderboard?scope=session:${sessionId}`);
      return r.body.items.find((i) => i.realName === 'carla_teste' && i.score > 0);
    });
    expect(lb.simulated).toBe(true);

    // Contadores agregados.
    const detail = await a.call<{ counters: Record<string, number> }>('GET', `/sessions/${sessionId}`);
    expect(detail.body.counters.gifts).toBe(3);
  });

  it('sequência de presentes (streak) não duplica recompensas', async () => {
    const { sessionId } = await startDemoSession(a, 'plinko-live');
    await a.call('POST', `/sessions/${sessionId}/simulate`, { type: 'GIFT', count: 5, streak: true, username: 'streak_user' });
    await waitFor(async () => (await a.call<{ counters: Record<string, number> }>('GET', `/sessions/${sessionId}`)).body.counters.gifts === 5);
    await sleep(1500);
    const d = await a.call<{ counters: Record<string, number> }>('GET', `/sessions/${sessionId}`);
    expect(d.body.counters.gifts).toBe(5);
    await a.call('POST', `/sessions/${sessionId}/stop`);
  });

  it('curtidas são agregadas e ativam metas', async () => {
    const { sessionId } = await startDemoSession(a, 'survival-arena');
    const r = await a.call<{ queued: number }>('POST', `/sessions/${sessionId}/simulate`, { type: 'LIKE', count: 1000 });
    expect(r.body.queued).toBeLessThanOrEqual(20); // lotes, nunca 1000 tarefas
    await waitFor(async () => (await a.call<{ counters: Record<string, number> }>('GET', `/sessions/${sessionId}`)).body.counters.likes === 1000);
    await a.call('POST', `/sessions/${sessionId}/stop`);
  });

  it('pausar, retomar, trocar jogo e encerrar', async () => {
    const { sessionId } = await startDemoSession(a, 'battle-arena');
    const p = await a.call<{ state: string }>('POST', `/sessions/${sessionId}/pause`);
    expect(p.body.state).toBe('PAUSED');
    // Repetir a mesma ação é idempotente (clique duplo); transição inválida é recusada.
    expect((await a.call('POST', `/sessions/${sessionId}/pause`)).status).toBe(200);
    expect((await a.call('POST', `/sessions/${sessionId}/start`)).status).toBe(409);
    expect((await a.call<{ state: string }>('POST', `/sessions/${sessionId}/resume`)).body.state).toBe('RUNNING');
    const race = await a.call<{ id: string }>('POST', '/games/configs', { gameId: 'avatar-race', name: 'Corrida' });
    expect((await a.call('POST', `/sessions/${sessionId}/control`, { command: 'SWITCH_GAME', args: { gameConfigId: race.body.id } })).status).toBe(200);
    await waitFor(async () => ((await a.call<{ gameId: string } | null>('GET', `/games/state/${sessionId}`)).body?.gameId === 'avatar-race'));
    expect((await a.call('POST', `/sessions/${sessionId}/control`, { command: 'ANNOUNCE', args: { text: 'Olá LIVE!' } })).status).toBe(200);
    await a.call('POST', `/sessions/${sessionId}/stop`);
    await waitFor(async () => (await a.call<{ state: string }>('GET', `/sessions/${sessionId}`)).body.state === 'STOPPED');
    const t = await a.call<Array<{ toState: string }>>('GET', `/sessions/${sessionId}/transitions`);
    expect(t.body.map((x) => x.toState)).toEqual(expect.arrayContaining(['STARTING', 'RUNNING', 'PAUSED', 'STOPPING', 'STOPPED']));
  });

  it('respeita o limite de sessões simultâneas do plano gratuito', async () => {
    const c = await register('Plano Teste', uniqueEmail('plano'), 'free');
    await startDemoSession(c, 'snake-live');
    const cfg = await c.call<{ id: string }>('POST', '/games/configs', { gameId: 'plinko-live', name: 'Outra' });
    const s2 = await c.call<{ id: string }>('POST', '/sessions', { name: 'Segunda', gameConfigId: cfg.body.id });
    const r = await c.call<{ error: { code: string } }>('POST', `/sessions/${s2.body.id}/start`);
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe('PLAN_LIMIT');
    // Jogo fora do plano gratuito.
    const blocked = await c.call<{ error: { code: string } }>('POST', '/games/configs', { gameId: 'battle-arena', name: 'Bloqueado' });
    expect(blocked.status).toBe(402);
  });
});

describe('isolamento multi-tenant', () => {
  it('um tenant não acessa dados de outro (API e WebSocket)', async () => {
    const { sessionId, configId } = await startDemoSession(b, 'snake-live');
    expect((await a.call('GET', `/sessions/${sessionId}`)).status).toBe(404);
    expect((await a.call('POST', `/sessions/${sessionId}/pause`)).status).toBe(404);
    expect((await a.call('POST', `/sessions/${sessionId}/simulate`, { type: 'GIFT' })).status).toBe(404);
    expect((await a.call('GET', `/games/configs/${configId}`)).status).toBe(404);
    expect((await a.call('PUT', `/games/configs/${configId}`, { name: 'hack' })).status).toBe(404);
    expect((await a.call('GET', `/sessions/${sessionId}/events`)).status).toBe(404);
    expect((await a.call('POST', '/overlays', { sessionId })).status).toBe(404);
    // Usar a config de outro tenant ao criar sessão também é bloqueado.
    expect((await a.call('POST', '/sessions', { name: 'x', gameConfigId: configId })).status).toBe(400);
    const list = await a.call<Array<{ id: string }>>('GET', '/sessions');
    expect(list.body.some((s) => s.id === sessionId)).toBe(false);
    // WebSocket: inscrição em sessão de outro tenant é negada.
    const ticket = (await a.call<{ ticket: string }>('POST', '/auth/realtime-ticket')).body.ticket;
    const socket = await connectSocket(ticket);
    sockets.push(socket);
    expect(await socket.emitWithAck('session:subscribe', sessionId)).toEqual({ ok: false, error: 'FORBIDDEN' });
    await b.call('POST', `/sessions/${sessionId}/stop`);
  });
});

describe('overlays', () => {
  it('token de overlay dá acesso somente leitura à própria sessão e pode ser revogado', async () => {
    const { sessionId } = await startDemoSession(b, 'plinko-live');
    const o = await b.call<{ id: string; token: string; url: string }>('POST', '/overlays', { sessionId, name: 'OBS' });
    expect(o.status).toBe(201);
    expect(o.body.url).toContain(`/overlay/${sessionId}`);
    const list = await b.call<Array<Record<string, unknown>>>('GET', '/overlays');
    expect(JSON.stringify(list.body)).not.toContain(o.body.token); // token nunca reaparece
    const boot = await raw('POST', `/public/overlay/${sessionId}/bootstrap`, { token: o.body.token });
    expect(boot.status).toBe(200);
    const ticket = (boot.body as { ticket: string }).ticket;
    const sock = await connectSocket(ticket);
    sockets.push(sock);
    expect(await sock.emitWithAck('session:subscribe', sessionId)).toEqual({ ok: true });
    expect(await sock.emitWithAck('session:subscribe', 'outra-sessao')).toEqual({ ok: false, error: 'FORBIDDEN' });
    // Token não serve para outra sessão.
    expect((await raw('POST', `/public/overlay/outra/bootstrap`, { token: o.body.token })).status).toBe(401);
    const disconnected = new Promise<void>((r) => sock.once('disconnect', () => r()));
    await b.call('DELETE', `/overlays/${o.body.id}`);
    await disconnected;
    expect((await raw('POST', `/public/overlay/${sessionId}/bootstrap`, { token: o.body.token })).status).toBe(401);
    await b.call('POST', `/sessions/${sessionId}/stop`);
  });
});

describe('configuração de jogos', () => {
  it('valida ações contra o manifesto, duplica e restaura padrões', async () => {
    const cfg = await a.call<{ id: string; body: { rules: unknown[] } }>('POST', '/games/configs', { gameId: 'snake-live', name: 'Minha cobra' });
    const bad = await a.call('PUT', `/games/configs/${cfg.body.id}`, {
      body: { settings: {}, rules: [{ id: 'x', trigger: { kind: 'FOLLOW' }, action: 'acao_inexistente', params: {} }] },
    });
    expect(bad.status).toBe(400);
    const outOfRange = await a.call('PUT', `/games/configs/${cfg.body.id}`, { body: { settings: { baseSpeed: 999 }, rules: [] } });
    expect(outOfRange.status).toBe(400);
    const dup = await a.call<{ name: string }>('POST', `/games/configs/${cfg.body.id}/duplicate`);
    expect(dup.body.name).toContain('cópia');
    await a.call('PUT', `/games/configs/${cfg.body.id}`, { body: { settings: { baseSpeed: 5 }, rules: [] } });
    const restored = await a.call<{ body: { rules: unknown[] } }>('POST', `/games/configs/${cfg.body.id}/restore-defaults`);
    expect(restored.body.body.rules.length).toBeGreaterThan(3);
  });
});
