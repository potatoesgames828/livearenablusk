import { afterAll, describe, expect, it } from 'vitest';
import { disconnectPrisma } from '@live-arena/database';
import { API, connectSocket, fakeIp, raw, register, startDemoSession, waitFor, type Client } from './helpers';

afterAll(async () => {
  await disconnectPrisma();
});

function wav(): Buffer {
  // WAV PCM mono 8 kHz com 800 amostras de silêncio
  const data = Buffer.alloc(800, 128);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1');
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24);
  h.writeUInt32LE(8000, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36, 'latin1');
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function upload(c: Client, name: string, body: Buffer) {
  const res = await fetch(`${API}/sounds?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', authorization: `Bearer ${c.token}`, 'x-forwarded-for': fakeIp() },
    body: new Uint8Array(body),
  });
  return { status: res.status, body: (await res.json()) as { id: string; mime: string } };
}

describe('biblioteca de jogos', () => {
  it('lista os jogos com metadados e guarda favoritos por usuário', async () => {
    const c = await register();
    const list = await c.call<Array<{ id: string; meta: { categories: string[] } | null; favorite: boolean }>>('GET', '/games');
    expect(list.status).toBe(200);
    const ids = list.body.map((g) => g.id);
    for (const id of ['battle-arena', 'animal-race', 'slap-arena', 'melon-pop', 'tug-of-war', 'tower-war', 'party-show']) expect(ids).toContain(id);
    expect(list.body.every((g) => g.meta && g.meta.categories.length > 0)).toBe(true);
    expect((await c.call('POST', '/games/melon-pop/favorite')).status).toBe(200);
    expect((await c.call<Array<{ id: string; favorite: boolean }>>('GET', '/games')).body.find((g) => g.id === 'melon-pop')?.favorite).toBe(true);
    expect((await c.call('DELETE', '/games/melon-pop/favorite')).status).toBe(200);
    expect((await c.call<Array<{ id: string; favorite: boolean }>>('GET', '/games')).body.find((g) => g.id === 'melon-pop')?.favorite).toBe(false);
    expect((await c.call('POST', '/games/nao-existe/favorite')).status).toBe(404);
  });
});

describe('soundboard', () => {
  it('aceita áudio válido pelo conteúdo, recusa arquivo disfarçado e isola por tenant', async () => {
    const a = await register();
    const b = await register();
    const ok = await upload(a, 'Aplausos', wav());
    expect(ok.status).toBe(201);
    expect(ok.body.mime).toBe('audio/wav');
    const fake = await upload(a, 'falso.mp3', Buffer.from('<script>alert(1)</script> isto não é áudio'));
    expect(fake.status).toBe(400);
    const file = await fetch(`${API}/sounds/${ok.body.id}/file`, { headers: { authorization: `Bearer ${a.token}`, 'x-forwarded-for': fakeIp() } });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toContain('audio/wav');
    // outro tenant não enxerga o som
    expect((await b.call('DELETE', `/sounds/${ok.body.id}`)).status).toBe(404);
    const bind = await a.call('PUT', '/sound-bindings', { slot: 'game.victory', soundId: ok.body.id, volume: 70 });
    expect(bind.status).toBe(200);
    expect((await b.call('PUT', '/sound-bindings', { slot: 'game.victory', soundId: ok.body.id, volume: 70 })).status).toBe(404);
    const list = await a.call<{ items: unknown[]; bindings: Array<{ slot: string }> }>('GET', '/sounds');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.bindings[0]?.slot).toBe('game.victory');
    expect((await a.call('DELETE', `/sounds/${ok.body.id}`)).status).toBe(200);
    expect((await a.call<{ bindings: unknown[] }>('GET', '/sounds')).body.bindings).toHaveLength(0);
  });
});

describe('overlay único do criador + alertas', () => {
  it('acompanha a LIVE ativa, recebe estado e alertas, e o link antigo morre ao gerar outro', async () => {
    const c = await register();
    const created = await c.call<{ token: string; url: string }>('POST', '/overlays/user');
    expect(created.status).toBe(201);
    expect(created.body.url).toContain(`/overlay/${encodeURIComponent(created.body.token)}`);
    const idle = await raw('POST', '/public/overlay-user/bootstrap', { token: created.body.token });
    expect(idle.status).toBe(200);
    expect((idle.body as { sessionId: string | null }).sessionId).toBeNull();

    const alert = await c.call<{ id: string }>('POST', '/alerts', { name: 'Presente', trigger: { kind: 'GIFT' }, message: '{usuario} mandou {presente}!', emoji: '🎁' });
    expect(alert.status).toBe(201);
    const { sessionId } = await startDemoSession(c, 'melon-pop');
    const boot = await raw('POST', '/public/overlay-user/bootstrap', { token: created.body.token });
    const b = boot.body as { sessionId: string; ticket: string; settings: { showAlerts: boolean } };
    expect(b.sessionId).toBe(sessionId);
    expect(b.settings.showAlerts).toBe(true);

    const sock = await connectSocket(b.ticket);
    const states: Array<{ gameId: string }> = [];
    const fx: Array<{ type: string; title?: string }> = [];
    sock.on('session:state', (s: { gameId: string }) => states.push(s));
    sock.on('session:fx', (f: { type: string; title?: string }) => fx.push(f));
    const ack = await new Promise<{ ok: boolean }>((r) => sock.emit('session:subscribe', sessionId, r));
    expect(ack.ok).toBe(true);
    await waitFor(async () => states.length > 0);
    expect(states[0]!.gameId).toBe('melon-pop');
    await c.call('POST', `/sessions/${sessionId}/simulate`, { type: 'GIFT', count: 1, username: 'ana_teste', giftName: 'Rosa', diamondValue: 1 });
    const got = await waitFor(async () => fx.find((f) => f.type === 'alert'));
    expect(got.title).toBe('ana_teste mandou Rosa!');

    // outro tenant: o ticket do overlay não assina LIVES de terceiros
    const other = await register();
    const { sessionId: foreign } = await startDemoSession(other, 'melon-pop');
    const denied = await new Promise<{ ok: boolean }>((r) => sock.emit('session:subscribe', foreign, r));
    expect(denied.ok).toBe(false);
    sock.disconnect();

    const settings = await c.call('PUT', '/overlays/user/settings', { showGame: true, showAlerts: false, playSounds: true, volume: 50, alertPosition: 'bottom', idleCard: false });
    expect(settings.status).toBe(200);
    const rotated = await c.call<{ token: string }>('POST', '/overlays/user');
    expect((await raw('POST', '/public/overlay-user/bootstrap', { token: created.body.token })).status).toBe(401);
    const nb = await raw('POST', '/public/overlay-user/bootstrap', { token: rotated.body.token });
    expect((nb.body as { settings: { alertPosition: string } }).settings.alertPosition).toBe('bottom');
    await c.call('POST', `/sessions/${sessionId}/stop`);
    await other.call('POST', `/sessions/${foreign}/stop`);
  });
});

describe('conta e histórico', () => {
  it('mostra uso x limites do plano e o histórico de partidas', async () => {
    const c = await register('Pessoa Plano', undefined, 'free');
    const u = await c.call<{ plan: { code: string }; usage: Array<{ key: string; limit: number }>; billing: { available: boolean } }>('GET', '/account/usage');
    expect(u.status).toBe(200);
    expect(u.body.plan.code).toBe('free');
    expect(u.body.usage.find((x) => x.key === 'sounds')?.limit).toBe(5);
    expect(u.body.billing.available).toBe(false);
    const h = await c.call<{ total: number; items: unknown[] }>('GET', '/account/history');
    expect(h.status).toBe(200);
    expect(h.body.total).toBe(0);
  });
});
