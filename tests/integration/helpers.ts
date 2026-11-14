import { io, type Socket } from 'socket.io-client';
import { getPrisma } from '@live-arena/database';

export const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api';
export const RT = process.env.REALTIME_URL ?? 'http://127.0.0.1:4001';

export interface Client {
  token: string;
  cookie: string;
  user: { id: string; tenant: { id: string } };
  call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }>;
}

export async function raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': fakeIp(), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* texto */
  }
  return { status: res.status, body: parsed as never, headers: res.headers };
}

/** IP aleatório por requisição (a API confia em X-Forwarded-For vindo do loopback). */
export function fakeIp(): string {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
}

/** Altera o plano do tenant diretamente no banco (setup de teste). */
export async function setPlan(c: Client, planCode: string): Promise<void> {
  await getPrisma().tenant.update({ where: { id: c.user.tenant.id }, data: { planCode } });
}

export function uniqueEmail(prefix = 'teste'): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function register(name = 'Pessoa Teste', email = uniqueEmail(), plan = 'advanced'): Promise<Client> {
  const r = await raw('POST', '/auth/register', { name, email, password: 'SenhaForte123' });
  if (r.status !== 201) throw new Error(`registro falhou: ${r.status} ${JSON.stringify(r.body)}`);
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const b = r.body as { accessToken: string; user: Client['user'] };
  const client: Client = {
    token: b.accessToken,
    cookie,
    user: b.user,
    call: async (method, path, body) => {
      const x = await raw(method, path, body, { authorization: `Bearer ${client.token}` });
      return { status: x.status, body: x.body };
    },
  };
  if (plan !== 'free') await setPlan(client, plan);
  return client;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, timeoutMs = 20_000, intervalMs = 300): Promise<T> {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      last = err;
    }
    await sleep(intervalMs);
  }
  throw new Error(`timeout em waitFor${last ? `: ${String(last)}` : ''}`);
}

export async function connectSocket(ticket: string): Promise<Socket> {
  const s = io(RT, { auth: { ticket }, transports: ['websocket'], reconnection: false, forceNew: true });
  await new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', (e) => reject(e));
  });
  return s;
}

/** Cria configuração + sessão demo (sem conexão) e inicia. */
export async function startDemoSession(c: Client, gameId = 'snake-live') {
  const cfg = await c.call<{ id: string }>('POST', '/games/configs', { gameId, name: `Config ${gameId}` });
  if (cfg.status !== 201) throw new Error(`config: ${cfg.status} ${JSON.stringify(cfg.body)}`);
  const s = await c.call<{ id: string }>('POST', '/sessions', { name: 'Sessão teste', gameConfigId: cfg.body.id });
  if (s.status !== 201) throw new Error(`sessão: ${s.status} ${JSON.stringify(s.body)}`);
  const started = await c.call<{ state: string }>('POST', `/sessions/${s.body.id}/start`);
  if (started.status !== 200) throw new Error(`start: ${started.status} ${JSON.stringify(started.body)}`);
  await waitFor(async () => (await c.call<{ state: string }>('GET', `/sessions/${s.body.id}`)).body.state === 'RUNNING');
  return { sessionId: s.body.id, configId: cfg.body.id };
}
