import { describe, expect, it } from 'vitest';
import { eventRuleSchema, type EventRule, type LiveEvent } from '@live-arena/shared';
import { keywordMatches, matchRules } from './rules';
import { matchAlerts, renderAlertMessage, toAlertFx, type AlertConfig } from './alerts';

function ev(type: LiveEvent['type'], payload: Record<string, unknown>, user = 'u1'): LiveEvent {
  return { eventId: `e-${Math.random()}`, tenantId: 't', sessionId: 's', source: 'simulator', type, user: { id: user, nickname: 'Ana' }, payload, timestamp: new Date().toISOString(), simulated: true };
}
const rule = (r: Partial<EventRule> & Pick<EventRule, 'trigger'>): EventRule => eventRuleSchema.parse({ id: 'r', action: 'x', ...r });

describe('gatilhos v2', () => {
  it('palavra-chave sem "!" ignora maiúsculas e acentos', () => {
    expect(keywordMatches('ENTRAR agora', 'entrar')).toBe(true);
    expect(keywordMatches('Elástico', 'elastico')).toBe(true);
    expect(keywordMatches('quero entrar', 'entrar')).toBe(false);
    expect(keywordMatches('quero entrar', 'entrar', 'contains')).toBe(true);
    expect(keywordMatches('time azul', 'time azul', 'exact')).toBe(true);
    expect(keywordMatches('!entrar', 'entrar')).toBe(true);
  });

  it('CHAT_KEYWORD casa comentários', () => {
    const r = rule({ trigger: { kind: 'CHAT_KEYWORD', keyword: 'Entrar', match: 'word' } });
    expect(matchRules(ev('CHAT', { comment: 'entrar' }), [r])).toHaveLength(1);
    expect(matchRules(ev('CHAT', { comment: 'oi' }), [r])).toHaveLength(0);
  });

  it('presente com faixa de diamantes', () => {
    const small = rule({ trigger: { kind: 'GIFT', maxDiamonds: 9 } });
    const big = rule({ id: 'b', trigger: { kind: 'GIFT', minDiamonds: 10 } });
    const g = (d: number) => ev('GIFT', { giftId: 'x', diamondValue: d, repeatCount: 1 });
    expect(matchRules(g(1), [small, big]).map((m) => m.rule.id)).toEqual(['r']);
    expect(matchRules(g(100), [small, big]).map((m) => m.rule.id)).toEqual(['b']);
  });

  it('evento personalizado e meta de espectadores', () => {
    const c = rule({ trigger: { kind: 'CUSTOM', name: 'meta_batida' } });
    expect(matchRules(ev('CUSTOM', { name: 'META_BATIDA' }), [c])).toHaveLength(1);
    const v = rule({ trigger: { kind: 'VIEWERS_THRESHOLD', every: 100 } });
    expect(matchRules(ev('ROOM_USER', { viewerCount: 250 }), [v], { viewersBefore: 90, viewersAfter: 250 })[0]?.quantity).toBe(2);
    expect(matchRules(ev('ROOM_USER', { viewerCount: 120 }), [v], { viewersBefore: 110, viewersAfter: 120 })).toHaveLength(0);
  });
});

describe('alertas', () => {
  const base: AlertConfig = { id: 'a', name: 'Presente', enabled: true, trigger: { kind: 'GIFT' }, message: '{usuario} enviou {quantidade}x {presente}', emoji: '🎁', color: '#ffffff', volume: 80, durationMs: 4000, cooldownMs: 0, soundId: 'snd' };

  it('renderiza variáveis da mensagem', () => {
    const e = ev('GIFT', { giftId: 'r', giftName: 'Rosa', diamondValue: 1, repeatCount: 5 });
    expect(renderAlertMessage(base.message, e, 5)).toBe('Ana enviou 5x Rosa');
  });

  it('casa pelo mesmo formato de gatilho das regras e ignora alertas desativados ou inválidos', () => {
    const e = ev('GIFT', { giftId: 'r', giftName: 'Rosa', diamondValue: 1, repeatCount: 1 });
    const out = matchAlerts(e, [base, { ...base, id: 'off', enabled: false }, { ...base, id: 'bad', trigger: { kind: 'NOPE' } }], { giftDelta: 3 });
    expect(out.map((m) => m.alert.id)).toEqual(['a']);
    const fx = toAlertFx(out[0]!.alert, e, out[0]!.quantity);
    expect(fx).toMatchObject({ type: 'alert', title: 'Ana enviou 3x Rosa', soundId: 'snd', simulated: true });
  });
});
