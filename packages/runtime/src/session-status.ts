import type { Redis } from 'ioredis';
import { getPrisma, toJson } from '@live-arena/database';
import { channels, type SessionStatusPayload } from '@live-arena/shared';

export type StatusField = 'state' | 'connectorState' | 'runnerState' | 'streamState';

/**
 * Atualiza campos de status da sessão no banco e publica no canal realtime.
 * Cada serviço só altera o campo que é responsável (conector → connectorState etc.).
 */
export async function updateSessionStatus(
  redis: Redis,
  tenantId: string,
  sessionId: string,
  patch: Partial<Record<StatusField, string>> & { lastError?: string | null; message?: string },
): Promise<void> {
  const prisma = getPrisma();
  const { message, ...data } = patch;
  await prisma.liveSession
    .updateMany({ where: { id: sessionId, tenantId }, data: { ...data, lastHeartbeatAt: new Date() } })
    .catch(() => undefined);
  const payload: SessionStatusPayload = { sessionId, ...data, message, at: Date.now() } as SessionStatusPayload;
  await redis.publish(channels.sessionStatus(tenantId, sessionId), JSON.stringify(payload)).catch(() => undefined);
}

export async function publishFx(redis: Redis, tenantId: string, sessionId: string, fx: Record<string, unknown>): Promise<void> {
  await redis.publish(channels.sessionFx(tenantId, sessionId), JSON.stringify({ ...fx, at: Date.now() })).catch(() => undefined);
}

/** Registra alerta deduplicado (mesmo código/componente/tenant em aberto apenas incrementa). */
export async function raiseAlert(input: {
  tenantId?: string | null;
  sessionId?: string | null;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  component: string;
  code: string;
  message: string;
}): Promise<void> {
  const prisma = getPrisma();
  try {
    const existing = await prisma.systemAlert.findFirst({
      where: {
        code: input.code,
        component: input.component,
        tenantId: input.tenantId ?? null,
        sessionId: input.sessionId ?? null,
        resolvedAt: null,
      },
    });
    if (existing) {
      await prisma.systemAlert.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, lastSeenAt: new Date(), message: input.message },
      });
    } else {
      await prisma.systemAlert.create({ data: { ...input, tenantId: input.tenantId ?? null, sessionId: input.sessionId ?? null } });
    }
  } catch {
    /* alertas nunca devem derrubar o chamador */
  }
}

export async function resolveAlerts(code: string, component: string, sessionId?: string): Promise<void> {
  await getPrisma()
    .systemAlert.updateMany({ where: { code, component, sessionId: sessionId ?? undefined, resolvedAt: null }, data: { resolvedAt: new Date() } })
    .catch(() => undefined);
}

export async function audit(input: {
  tenantId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  await getPrisma()
    .auditLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: toJson(input.metadata ?? {}),
        ip: input.ip,
      },
    })
    .catch(() => undefined);
}
