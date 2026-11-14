import type { Redis } from 'ioredis';
import { getPrisma } from '@live-arena/database';
import { ACTIVE_SESSION_STATES, type SessionState } from '@live-arena/shared';
import { keys } from './keys';
import { rebuildSessionMeta } from './session-meta';

const cache = new Map<string, { active: boolean; at: number }>();

/**
 * O PostgreSQL é a fonte da verdade do ciclo de vida. Os conjuntos no Redis
 * são apenas um índice rápido. Antes de encerrar algo porque "sumiu do Redis",
 * os serviços confirmam aqui — e, se a sessão continua ativa, reconstroem o índice.
 *
 * Retorna true se a sessão deve continuar rodando. Em caso de banco
 * indisponível, retorna true (na dúvida, não derruba a LIVE).
 */
export async function confirmSessionActive(redis: Redis, sessionId: string, opts: { withConnector?: boolean } = {}): Promise<boolean> {
  const c = cache.get(sessionId);
  if (c && Date.now() - c.at < 3000) return c.active;
  let active: boolean;
  try {
    const s = await getPrisma().liveSession.findUnique({ where: { id: sessionId }, select: { state: true } });
    active = !!s && ACTIVE_SESSION_STATES.has(s.state as SessionState) && s.state !== 'STOPPING';
  } catch {
    return true;
  }
  cache.set(sessionId, { active, at: Date.now() });
  if (cache.size > 10_000) cache.clear();
  if (active) {
    // Autocorreção do índice no Redis (ex.: após reinício sem persistência).
    await redis.sadd(keys.activeSessions(), sessionId).catch(() => undefined);
    if (opts.withConnector) await redis.sadd(keys.activeConnectors(), sessionId).catch(() => undefined);
    if (!(await redis.exists(keys.sessionMeta(sessionId)).catch(() => 1))) await rebuildSessionMeta(redis, sessionId).catch(() => undefined);
  }
  return active;
}
