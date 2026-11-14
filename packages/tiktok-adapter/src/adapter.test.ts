import { describe, expect, it, vi } from 'vitest';
import { normalizeEvent } from '@live-arena/event-engine';
import { CircuitBreaker } from './circuit-breaker';
import { mapChat, mapGift, mapLike, mapRoomUser, mapUser } from './webcast-mapping';
import { createAdapter, availableProviders, TtlcAdapter, ConnectorUnavailableError, SimulatorAdapter } from './index';

// Amostras no formato documentado pelo TikTok-Live-Connector (v2).
const giftSample = {
  common: { msgId: '7311', createTime: '1731585600000' },
  user: { userId: '6812', uniqueId: 'ana_gamer', nickname: 'Ana', profilePicture: { url: ['https://p16.example/a.jpg'] } },
  giftId: 5655,
  repeatCount: 3,
  repeatEnd: false,
  groupId: '99',
  giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 1 },
};

describe('mapeamento Webcast', () => {
  it('mapeia presente sem inventar campos', () => {
    const raw = mapGift(giftSample);
    expect(raw.sourceEventId).toBe('7311');
    expect(raw.payload).toEqual({ giftId: '5655', repeatCount: 3, giftName: 'Rose', diamondValue: 1, repeatEnd: false, streakable: true, groupId: '99' });
    expect(raw.user).toEqual({ id: '6812', username: 'ana_gamer', nickname: 'Ana', avatarUrl: 'https://p16.example/a.jpg' });
    const ev = normalizeEvent('t', 's', raw);
    expect(ev.type).toBe('GIFT');
    expect(ev.timestamp).toBe(new Date(1731585600000).toISOString());
  });
  it('presente sem detalhes mantém campos ausentes', () => {
    const raw = mapGift({ giftId: '1', user: { userId: '2' } });
    expect(raw.payload).toEqual({ giftId: '1', repeatCount: 1 });
  });
  it('chat, like e roomUser', () => {
    expect(mapChat({ comment: 'oi', user: { userId: '1' } }).payload).toEqual({ comment: 'oi' });
    expect(mapLike({ likeCount: 15, totalLikeCount: 300, user: { userId: '1' } })).toMatchObject({ likes: 15, total: 300 });
    expect(mapRoomUser({ viewerCount: 42 })?.payload).toEqual({ viewerCount: 42 });
    expect(mapRoomUser({})).toBeNull();
    expect(mapUser({ user: {} })).toBeUndefined();
  });
});

describe('fábrica e licença', () => {
  it('TTLC desabilitado por padrão', async () => {
    delete process.env.TTLC_ENABLED;
    expect(TtlcAdapter.isEnabled()).toBe(false);
    const a = createAdapter('TIKTOK_TTLC');
    await expect(a.connect({ uniqueId: 'x' }, { onEvent: vi.fn(), onState: vi.fn(), onDisconnected: vi.fn() })).rejects.toBeInstanceOf(ConnectorUnavailableError);
    expect(availableProviders().find((p) => p.id === 'TIKTOK_TTLC')?.enabled).toBe(false);
  });
  it('Euler sem configuração falha de forma clara', async () => {
    const a = createAdapter('EULER_STREAM');
    await expect(a.connect({ uniqueId: 'x' }, { onEvent: vi.fn(), onState: vi.fn(), onDisconnected: vi.fn() })).rejects.toBeInstanceOf(ConnectorUnavailableError);
  });
  it('simulador gera eventos marcados como simulados', async () => {
    vi.useFakeTimers();
    const events: Array<{ simulated?: boolean; source: string }> = [];
    const sim = new SimulatorAdapter({ chatPerSec: 20, likesPerSec: 50, giftsPerMin: 600, followsPerMin: 600 });
    await sim.connect({ uniqueId: 'demo' }, { onEvent: (e) => events.push(e), onState: vi.fn(), onDisconnected: vi.fn() });
    vi.advanceTimersByTime(3000);
    await sim.disconnect();
    vi.useRealTimers();
    expect(events.length).toBeGreaterThan(5);
    expect(events.every((e) => e.simulated === true && e.source === 'simulator')).toBe(true);
  });
});

describe('circuit breaker', () => {
  it('abre após falhas consecutivas e libera após cooldown', () => {
    let t = 0;
    const cb = new CircuitBreaker(3, 1000, () => t);
    cb.failure();
    cb.failure();
    expect(cb.canAttempt()).toBe(true);
    cb.failure();
    expect(cb.state).toBe('open');
    expect(cb.canAttempt()).toBe(false);
    t = 1000;
    expect(cb.state).toBe('half-open');
    cb.success();
    expect(cb.state).toBe('closed');
  });
});
