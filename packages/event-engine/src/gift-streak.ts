import type { GiftPayload, LiveEvent } from '@live-arena/shared';
import type { EventStore } from './store';

const STREAK_TTL_MS = 5 * 60_000;

export interface StreakKeyBuilder {
  (sessionId: string, streakKey: string): string;
}

/**
 * Sequências de presentes ("gift streak"): a fonte envia várias atualizações
 * da mesma sequência com `repeatCount` acumulado. Creditamos apenas a
 * diferença em relação à última contagem conhecida, então:
 *   - atualizações intermediárias recompensam imediatamente (resposta rápida);
 *   - a mesma unidade nunca é recompensada duas vezes;
 *   - a atualização final (repeatEnd) não duplica a recompensa.
 */
export async function computeGiftDelta(
  store: EventStore,
  keyFor: StreakKeyBuilder,
  event: LiveEvent,
): Promise<number> {
  const p = event.payload as unknown as GiftPayload;
  const repeat = Math.max(1, Number(p.repeatCount ?? 1));
  // Presentes não sequenciáveis: cada evento é uma unidade independente.
  if (p.streakable === false && p.groupId === undefined) {
    return typeof p.quantity === 'number' ? p.quantity : repeat;
  }
  const streakKey = `${event.user?.id ?? 'anon'}:${p.giftId}:${p.groupId ?? 'g'}`;
  const key = keyFor(event.sessionId, streakKey);
  const prev = await store.getSetNumber(key, repeat, STREAK_TTL_MS);
  if (prev === null) return repeat;
  if (repeat <= prev) {
    // Atualização repetida/fora de ordem: mantém o maior valor conhecido.
    if (repeat < prev) await store.getSetNumber(key, prev, STREAK_TTL_MS);
    return 0;
  }
  return repeat - prev;
}
