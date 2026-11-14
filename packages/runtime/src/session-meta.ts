import type { Redis } from 'ioredis';
import type { GameConfigBody } from '@live-arena/shared';
import { getPrisma } from '@live-arena/database';
import { keys } from './keys';

/** Metadados de uma sessão ativa, compartilhados entre os serviços via Redis. */
export interface SessionMeta {
  tenantId: string;
  sessionId: string;
  gameId: string;
  gameConfigId: string;
  config: GameConfigBody;
  demo: boolean;
  autoMode: boolean;
  connection: { id: string; provider: string; username: string | null } | null;
  /** Versão incrementada a cada alteração (troca de jogo, edição de regras). */
  version: number;
}

export async function writeSessionMeta(redis: Redis, meta: SessionMeta): Promise<void> {
  await redis.set(keys.sessionMeta(meta.sessionId), JSON.stringify(meta));
}

export async function readSessionMeta(redis: Redis, sessionId: string): Promise<SessionMeta | null> {
  const raw = await redis.get(keys.sessionMeta(sessionId));
  return raw ? (JSON.parse(raw) as SessionMeta) : null;
}

/**
 * Reconstrói os metadados a partir do banco (fonte da verdade) — usado na
 * recuperação quando o Redis foi reiniciado e perdeu os dados voláteis.
 */
export async function rebuildSessionMeta(redis: Redis, sessionId: string): Promise<SessionMeta | null> {
  const s = await getPrisma().liveSession.findUnique({
    where: { id: sessionId },
    include: { gameConfig: true, connection: true },
  });
  if (!s) return null;
  const meta: SessionMeta = {
    tenantId: s.tenantId,
    sessionId: s.id,
    gameId: s.gameConfig.gameId,
    gameConfigId: s.gameConfigId,
    config: s.gameConfig.body as unknown as GameConfigBody,
    demo: s.demo,
    autoMode: s.autoMode,
    connection: s.connection
      ? { id: s.connection.id, provider: s.connection.provider, username: s.connection.tiktokUsername }
      : null,
    version: Date.now(),
  };
  await writeSessionMeta(redis, meta);
  return meta;
}

export async function getOrRebuildSessionMeta(redis: Redis, sessionId: string): Promise<SessionMeta | null> {
  return (await readSessionMeta(redis, sessionId)) ?? rebuildSessionMeta(redis, sessionId);
}
