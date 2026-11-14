import type {
  EventRule,
  GameActionMessage,
  GiftPayload,
  LikePayload,
  LiveEvent,
  RunnerMessage,
  ViewerSignalMessage,
} from '@live-arena/shared';
import type { EventStore } from './store';
import { computeGiftDelta } from './gift-streak';
import { matchRules, parseCommand } from './rules';

export type ProcessStatus = 'PROCESSED' | 'DUPLICATE' | 'NO_RULE' | 'IGNORED';

export interface EngineKeys {
  dedupe(tenantId: string, eventId: string): string;
  giftStreak(sessionId: string, streakKey: string): string;
  counters(sessionId: string): string;
  ruleCooldown(sessionId: string, ruleId: string): string;
  ruleUserCooldown(sessionId: string, ruleId: string, viewerId: string): string;
  ruleRate(sessionId: string, ruleId: string, minute: number): string;
}

export const defaultEngineKeys: EngineKeys = {
  dedupe: (t, e) => `la:dedupe:${t}:${e}`,
  giftStreak: (s, k) => `la:streak:${s}:${k}`,
  counters: (s) => `la:session:${s}:counters`,
  ruleCooldown: (s, r) => `la:cd:${s}:${r}`,
  ruleUserCooldown: (s, r, v) => `la:cd:${s}:${r}:${v}`,
  ruleRate: (s, r, m) => `la:rate:${s}:${r}:${m}`,
};

export interface ProcessOptions {
  rules: EventRule[];
  store: EventStore;
  keys?: EngineKeys;
  /** Janela de deduplicação. */
  dedupeTtlMs?: number;
  now?: () => number;
}

export interface ProcessResult {
  status: ProcessStatus;
  messages: RunnerMessage[];
  matchedRuleIds: string[];
  /** Regras que casaram mas foram bloqueadas por cooldown/limite. */
  throttledRuleIds: string[];
  counters: Record<string, number>;
  /** Se o evento deve ser persistido no histórico. */
  persist: boolean;
  giftDelta?: number;
}

const PERSISTED_TYPES = new Set(['GIFT', 'FOLLOW', 'SHARE', 'SUBSCRIPTION', 'STREAM_START', 'STREAM_END', 'SYSTEM_WARNING', 'SYSTEM_ERROR', 'BATTLE', 'LIKE']);

function viewerOf(event: LiveEvent): GameActionMessage['viewer'] {
  if (!event.user) return undefined;
  const v: NonNullable<GameActionMessage['viewer']> = { id: event.user.id };
  if (event.user.username) v.username = event.user.username;
  if (event.user.nickname) v.nickname = event.user.nickname;
  if (event.user.avatarUrl) v.avatarUrl = event.user.avatarUrl;
  return v;
}

/**
 * Pipeline central do Event Engine:
 *   deduplicação → tratamento de sequência de presentes → contadores →
 *   correspondência de regras → cooldowns/limites → mensagens para o jogo.
 */
export async function processEvent(event: LiveEvent, opts: ProcessOptions): Promise<ProcessResult> {
  const keys = opts.keys ?? defaultEngineKeys;
  const now = opts.now ?? Date.now;
  const store = opts.store;
  const base: ProcessResult = { status: 'PROCESSED', messages: [], matchedRuleIds: [], throttledRuleIds: [], counters: {}, persist: false };

  // 1) Deduplicação idempotente (mesmo eventId nunca é processado duas vezes).
  const first = await store.setIfAbsent(keys.dedupe(event.tenantId, event.eventId), opts.dedupeTtlMs ?? 6 * 3600_000);
  if (!first) return { ...base, status: 'DUPLICATE' };

  // 2) Contadores e contexto específico do tipo.
  const ctx: { giftDelta?: number; likesBefore?: number; likesAfter?: number } = {};
  const inc: Record<string, number> = { events: 1 };
  switch (event.type) {
    case 'GIFT': {
      const delta = await computeGiftDelta(store, keys.giftStreak, event);
      ctx.giftDelta = delta;
      const p = event.payload as unknown as GiftPayload;
      if (delta > 0) {
        inc.gifts = delta;
        if (p.diamondValue) inc.diamonds = delta * p.diamondValue;
      }
      break;
    }
    case 'LIKE': {
      const p = event.payload as unknown as LikePayload;
      inc.likes = p.count;
      break;
    }
    case 'CHAT':
      inc.comments = 1;
      break;
    case 'FOLLOW':
      inc.follows = 1;
      break;
    case 'SHARE':
      inc.shares = 1;
      break;
    case 'MEMBER':
      inc.members = 1;
      break;
    case 'SUBSCRIPTION':
      inc.subscriptions = 1;
      break;
    default:
      break;
  }
  const counters = await store.hincrby(keys.counters(event.sessionId), inc);
  if (event.type === 'LIKE') {
    ctx.likesAfter = counters.likes ?? 0;
    ctx.likesBefore = ctx.likesAfter - (inc.likes ?? 0);
  }
  if (event.type === 'ROOM_USER') {
    const vc = Number((event.payload as { viewerCount?: number }).viewerCount ?? 0);
    await store.hset(keys.counters(event.sessionId), { viewers: vc });
    counters.viewers = vc;
  }

  const result: ProcessResult = { ...base, counters, giftDelta: ctx.giftDelta, persist: PERSISTED_TYPES.has(event.type) };

  // Atualização intermediária de sequência sem unidades novas: nada a fazer.
  if (event.type === 'GIFT' && (ctx.giftDelta ?? 0) <= 0) {
    return { ...result, status: 'IGNORED', persist: false };
  }

  // 3) Sinal de participação (ranking/entrada nos jogos), independente de regras.
  const viewer = viewerOf(event);
  const signalType = (['CHAT', 'GIFT', 'LIKE', 'FOLLOW', 'SHARE', 'MEMBER'] as const).find((t) => t === event.type);
  if (signalType) {
    if (event.type === 'LIKE') {
      const p = event.payload as unknown as LikePayload;
      const contributors = p.contributors?.length ? p.contributors : viewer ? [{ id: viewer.id, username: viewer.username, count: p.count }] : [];
      for (const c of contributors) {
        result.messages.push({
          kind: 'signal', type: 'LIKE', viewer: { id: c.id, username: c.username }, value: c.count,
          eventId: event.eventId, simulated: event.simulated, at: now(),
        } satisfies ViewerSignalMessage);
      }
    } else {
      const p = event.payload as Record<string, unknown>;
      const value =
        event.type === 'GIFT' ? (ctx.giftDelta ?? 1) * Math.max(1, Number((p as unknown as GiftPayload).diamondValue ?? 1)) : 1;
      const sig: ViewerSignalMessage = { kind: 'signal', type: signalType, viewer, value, eventId: event.eventId, simulated: event.simulated, at: now() };
      if (event.type === 'CHAT') sig.text = String(p.comment ?? '').slice(0, 140);
      result.messages.push(sig);
    }
  }

  // 4) Regras configuradas.
  const matches = matchRules(event, opts.rules, ctx);
  if (matches.length === 0) {
    const isCommand = event.type === 'CHAT' && parseCommand(String((event.payload as { comment?: string }).comment ?? '')) !== null;
    return { ...result, status: 'NO_RULE', persist: result.persist || isCommand };
  }

  const minute = Math.floor(now() / 60_000);
  for (const m of matches) {
    const r = m.rule;
    if (r.maxPerMinute > 0) {
      const n = await store.incrWithTtl(keys.ruleRate(event.sessionId, r.id, minute), 61_000);
      if (n > r.maxPerMinute) {
        result.throttledRuleIds.push(r.id);
        continue;
      }
    }
    if (r.perUserCooldownMs > 0 && viewer) {
      const ok = await store.acquireCooldown(keys.ruleUserCooldown(event.sessionId, r.id, viewer.id), r.perUserCooldownMs);
      if (!ok) {
        result.throttledRuleIds.push(r.id);
        continue;
      }
    }
    if (r.cooldownMs > 0) {
      const ok = await store.acquireCooldown(keys.ruleCooldown(event.sessionId, r.id), r.cooldownMs);
      if (!ok) {
        result.throttledRuleIds.push(r.id);
        continue;
      }
    }
    result.matchedRuleIds.push(r.id);
    result.messages.push({
      kind: 'game',
      actionId: r.action,
      params: r.params,
      quantity: m.quantity,
      viewer,
      eventId: event.eventId,
      ruleId: r.id,
      simulated: event.simulated,
      at: now(),
    });
  }
  if (event.type === 'CHAT' && result.matchedRuleIds.length) result.persist = true;
  return result;
}
