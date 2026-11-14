import type { Redis } from 'ioredis';
import { getPrisma } from '@live-arena/database';
import { canTransition } from '@live-arena/automation';
import type { ControlCommand, SessionState } from '@live-arena/shared';
import { keys } from './keys';
import { pushRunnerMessage } from './streams';
import { updateSessionStatus } from './session-status';
import { rebuildSessionMeta } from './session-meta';

export class TransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transição inválida: ${from} → ${to}`);
    this.name = 'TransitionError';
  }
}

/**
 * Transição de estado com controle otimista: a atualização só acontece se o
 * estado no banco ainda for o lido (evita corrida entre API, runner e worker).
 * Toda transição é registrada no histórico.
 */
export async function transitionSession(
  redis: Redis,
  input: { tenantId: string; sessionId: string; to: SessionState; reason?: string; actorId?: string | null; force?: boolean },
): Promise<{ from: SessionState; to: SessionState }> {
  const prisma = getPrisma();
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await prisma.liveSession.findFirst({ where: { id: input.sessionId, tenantId: input.tenantId }, select: { state: true } });
    if (!s) throw new Error('sessão não encontrada');
    const from = s.state as SessionState;
    if (from === input.to) return { from, to: input.to };
    if (!input.force && !canTransition(from, input.to)) throw new TransitionError(from, input.to);
    const data: Record<string, unknown> = { state: input.to };
    if (input.to === 'STARTING') {
      data.startedAt = new Date();
      data.endedAt = null;
      data.lastError = null;
    }
    if (input.to === 'STOPPED') data.endedAt = new Date();
    const res = await prisma.liveSession.updateMany({ where: { id: input.sessionId, tenantId: input.tenantId, state: from }, data });
    if (res.count === 0) continue; // outro processo mudou o estado; relê e tenta de novo
    await prisma.sessionTransition.create({
      data: { tenantId: input.tenantId, sessionId: input.sessionId, fromState: from, toState: input.to, reason: input.reason, actorId: input.actorId ?? null },
    });
    await updateSessionStatus(redis, input.tenantId, input.sessionId, { state: input.to, message: input.reason });
    return { from, to: input.to };
  }
  throw new Error('não foi possível atualizar o estado da sessão (concorrência)');
}

export async function sendControl(
  redis: Redis,
  sessionId: string,
  command: ControlCommand,
  args?: Record<string, unknown>,
  requestedBy?: string,
): Promise<void> {
  await pushRunnerMessage(redis, sessionId, { kind: 'control', command, args, requestedBy, at: Date.now() });
}

/** Marca a sessão como ativa para os serviços (runner e, se houver, conector). */
export async function activateSession(redis: Redis, sessionId: string, withConnector: boolean): Promise<void> {
  const meta = await rebuildSessionMeta(redis, sessionId);
  if (!meta) throw new Error('sessão não encontrada');
  const multi = redis.multi().sadd(keys.activeSessions(), sessionId);
  if (withConnector) multi.sadd(keys.activeConnectors(), sessionId);
  else multi.srem(keys.activeConnectors(), sessionId);
  await multi.exec();
}

export async function deactivateSession(redis: Redis, sessionId: string): Promise<void> {
  await redis.multi().srem(keys.activeSessions(), sessionId).srem(keys.activeConnectors(), sessionId).exec();
}
