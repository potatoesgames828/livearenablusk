import { describe, expect, it, vi } from 'vitest';
import { eventRuleSchema, type EventRule } from '@live-arena/shared';
import { normalizeEvent, EventValidationError } from './normalize';
import { MemoryEventStore } from './store';
import { processEvent } from './processor';
import { LikeAggregator, thresholdsCrossed } from './like-aggregator';
import { matchRules, parseCommand } from './rules';
import { TokenBucket } from './rate-limiter';

const T = 'tenant-a';
const S = 'session-1';

function rules(...input: Parameters<typeof eventRuleSchema.parse>[0][]): EventRule[] {
  return input.map((r) => eventRuleSchema.parse(r));
}

function gift(id: string, repeatCount: number, extra: Record<string, unknown> = {}) {
  return normalizeEvent(T, S, {
    sourceEventId: id,
    source: 'tiktok',
    type: 'GIFT',
    user: { id: 'u1', username: 'ana' },
    payload: { giftId: 'rose', giftName: 'Rose', repeatCount, diamondValue: 1, groupId: 'g1', ...extra },
  });
}

describe('normalizeEvent', () => {
  it('valida e sanitiza comentários', () => {
    const e = normalizeEvent(T, S, { source: 'tiktok', type: 'CHAT', user: { id: '9' }, payload: { comment: '  !join\u202E agora ' } });
    expect(e.payload.comment).toBe('!join agora');
    expect(e.eventId).toMatch(/^tiktok:h:/);
    expect(e.simulated).toBe(false);
  });
  it('rejeita payload inválido', () => {
    expect(() => normalizeEvent(T, S, { source: 'tiktok', type: 'GIFT', payload: { giftId: 'x' } })).toThrow(EventValidationError);
  });
  it('não inventa usuário ausente e marca simulação', () => {
    const e = normalizeEvent(T, S, { source: 'simulator', type: 'LIKE', payload: { count: 5 } });
    expect(e.user).toBeUndefined();
    expect(e.simulated).toBe(true);
  });
  it('gera o mesmo eventId para o mesmo msgId (idempotência)', () => {
    const a = gift('m1', 1);
    const b = gift('m1', 1);
    expect(a.eventId).toBe(b.eventId);
  });
});

describe('processEvent — deduplicação e sequência de presentes', () => {
  const r = rules({ id: 'g', trigger: { kind: 'GIFT' }, action: 'special_food', params: { value: 5 } });

  it('ignora evento duplicado', async () => {
    const store = new MemoryEventStore();
    const first = await processEvent(gift('dup', 1), { rules: r, store });
    const second = await processEvent(gift('dup', 1), { rules: r, store });
    expect(first.status).toBe('PROCESSED');
    expect(second.status).toBe('DUPLICATE');
    expect(second.messages).toHaveLength(0);
  });

  it('credita apenas a diferença de uma sequência (streak) sem duplicar no final', async () => {
    const store = new MemoryEventStore();
    const r1 = await processEvent(gift('s1', 1), { rules: r, store });
    const r2 = await processEvent(gift('s2', 3), { rules: r, store });
    const r3 = await processEvent(gift('s3', 3, { repeatEnd: true }), { rules: r, store });
    const r4 = await processEvent(gift('s4', 2), { rules: r, store }); // fora de ordem
    const actions = [r1, r2, r3, r4].flatMap((x) => x.messages.filter((m) => m.kind === 'game'));
    expect(actions.map((a) => (a.kind === 'game' ? a.quantity : 0))).toEqual([1, 2]);
    expect(r3.status).toBe('IGNORED');
    expect(r4.status).toBe('IGNORED');
    expect(r2.counters.gifts).toBe(3);
  });

  it('respeita minDiamonds e limite de quantidade', async () => {
    const store = new MemoryEventStore();
    const rs = rules(
      { id: 'big', trigger: { kind: 'GIFT', minDiamonds: 100 }, action: 'golden', params: {}, scaleWithQuantity: false },
      { id: 'any', trigger: { kind: 'GIFT' }, action: 'food', params: {}, maxQuantity: 3 },
    );
    const res = await processEvent(gift('x', 10, { diamondValue: 1 }), { rules: rs, store });
    const game = res.messages.filter((m) => m.kind === 'game');
    expect(game).toHaveLength(1);
    expect(game[0]?.kind === 'game' && game[0].quantity).toBe(3);
  });
});

describe('processEvent — curtidas, comandos e cooldown', () => {
  it('dispara ação a cada N curtidas acumuladas', async () => {
    const store = new MemoryEventStore();
    const rs = rules({ id: 'l', trigger: { kind: 'LIKE_THRESHOLD', every: 100 }, action: 'speed', params: {}, maxQuantity: 10 });
    const ev = (i: number, count: number) => normalizeEvent(T, S, { sourceEventId: `l${i}`, source: 'tiktok', type: 'LIKE', payload: { count } });
    const a = await processEvent(ev(1, 60), { rules: rs, store });
    const b = await processEvent(ev(2, 60), { rules: rs, store });
    const c = await processEvent(ev(3, 250), { rules: rs, store });
    const q = (x: typeof a) => x.messages.filter((m) => m.kind === 'game').map((m) => (m.kind === 'game' ? m.quantity : 0));
    expect(q(a)).toEqual([]);
    expect(q(b)).toEqual([1]);
    expect(q(c)).toEqual([2]);
    expect(c.counters.likes).toBe(370);
  });

  it('aplica cooldown global e por usuário', async () => {
    let now = 1_000_000;
    const store = new MemoryEventStore(() => now);
    const rs = rules({ id: 'c', trigger: { kind: 'CHAT_COMMAND', command: '!join' }, action: 'join', params: {}, perUserCooldownMs: 5000 });
    const chat = (i: number, user: string) =>
      normalizeEvent(T, S, { sourceEventId: `c${i}`, source: 'tiktok', type: 'CHAT', user: { id: user }, payload: { comment: '!JOIN' } });
    const opts = { rules: rs, store, now: () => now };
    expect((await processEvent(chat(1, 'a'), opts)).matchedRuleIds).toEqual(['c']);
    expect((await processEvent(chat(2, 'a'), opts)).throttledRuleIds).toEqual(['c']);
    expect((await processEvent(chat(3, 'b'), opts)).matchedRuleIds).toEqual(['c']);
    now += 6000;
    expect((await processEvent(chat(4, 'a'), opts)).matchedRuleIds).toEqual(['c']);
  });

  it('limita disparos por minuto', async () => {
    const store = new MemoryEventStore();
    const rs = rules({ id: 'f', trigger: { kind: 'FOLLOW' }, action: 'x', params: {}, maxPerMinute: 2 });
    const now = () => 120_000;
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await processEvent(normalizeEvent(T, S, { sourceEventId: `f${i}`, source: 'tiktok', type: 'FOLLOW', user: { id: `u${i}` }, payload: {} }), { rules: rs, store, now }));
    }
    expect(results.map((r) => r.matchedRuleIds.length)).toEqual([1, 1, 0, 0]);
  });

  it('gera sinais de participação para cada contribuinte de curtidas agregadas', async () => {
    const store = new MemoryEventStore();
    const ev = normalizeEvent(T, S, {
      source: 'tiktok', type: 'LIKE', user: { id: 'a' },
      payload: { count: 30, aggregated: true, contributors: [{ id: 'a', count: 20 }, { id: 'b', count: 10 }] },
    });
    const res = await processEvent(ev, { rules: [], store });
    expect(res.messages.filter((m) => m.kind === 'signal')).toHaveLength(2);
    expect(res.status).toBe('NO_RULE');
  });
});

describe('utilitários', () => {
  it('parseCommand', () => {
    expect(parseCommand('!Join agora')).toBe('!join');
    expect(parseCommand('oi !join')).toBeNull();
  });
  it('thresholdsCrossed', () => {
    expect(thresholdsCrossed(90, 210, 100)).toBe(2);
    expect(thresholdsCrossed(100, 100, 100)).toBe(0);
  });
  it('matchRules ignora regras desabilitadas', () => {
    const rs = rules({ id: 'x', enabled: false, trigger: { kind: 'FOLLOW' }, action: 'a', params: {} });
    const ev = normalizeEvent(T, S, { source: 'tiktok', type: 'FOLLOW', payload: {} });
    expect(matchRules(ev, rs)).toHaveLength(0);
  });
  it('LikeAggregator agrega curtidas em uma janela', () => {
    vi.useFakeTimers();
    const out: unknown[] = [];
    const agg = new LikeAggregator((e) => out.push(e), 1000);
    for (let i = 0; i < 1000; i++) agg.add(1, { id: `u${i % 7}` });
    expect(out).toHaveLength(0);
    vi.advanceTimersByTime(1001);
    expect(out).toHaveLength(1);
    const p = (out[0] as { payload: { count: number; contributors: unknown[] } }).payload;
    expect(p.count).toBe(1000);
    expect(p.contributors).toHaveLength(7);
    vi.useRealTimers();
  });
  it('TokenBucket limita rajadas', () => {
    let t = 0;
    const b = new TokenBucket(5, 5, () => t);
    let ok = 0;
    for (let i = 0; i < 20; i++) if (b.take()) ok++;
    expect(ok).toBe(5);
    t += 1000;
    expect(b.take()).toBe(true);
  });
});
