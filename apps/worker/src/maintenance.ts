import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { getPrisma } from '@live-arena/database';
import {
  activateSession, deactivateSession, getQueue, keys, QUEUES, raiseAlert, resolveAlerts, sendControl, transitionSession,
} from '@live-arena/runtime';
import { ACTIVE_SESSION_STATES, planLimitsSchema, type SessionState } from '@live-arena/shared';
import { metrics, type Logger } from '@live-arena/observability';

/**
 * Watchdog e manutenção periódica:
 *  - garante que toda sessão ativa no banco tenha runner (re-registra após perda do Redis);
 *  - detecta sessões sem heartbeat e alerta;
 *  - corrige estados presos (STARTING/STOPPING);
 *  - aplica limite de duração do plano;
 *  - limpeza por política de retenção;
 *  - métricas de profundidade das filas.
 */
export function createMaintenanceProcessor(deps: { redis: Redis; queueRedis: Redis; logger: Logger }) {
  const prisma = getPrisma();

  async function watchdog(): Promise<Record<string, number>> {
    const now = Date.now();
    const out = { reactivated: 0, stale: 0, fixedStopping: 0, fixedStarting: 0, timeLimited: 0 };
    const active = await prisma.liveSession.findMany({
      where: { state: { in: [...ACTIVE_SESSION_STATES] as SessionState[] } },
      include: { connection: true, tenant: { include: { plan: true } } },
    });
    for (const s of active) {
      // Estados presos.
      if (s.state === 'STOPPING' && now - s.updatedAt.getTime() > 30_000) {
        await transitionSession(deps.redis, { tenantId: s.tenantId, sessionId: s.id, to: 'STOPPED', reason: 'Watchdog: encerramento concluído' }).catch(() => undefined);
        await deactivateSession(deps.redis, s.id);
        await prisma.liveSession.update({ where: { id: s.id }, data: { runnerState: 'STOPPED', connectorState: s.connectionId ? 'IDLE' : 'DISABLED' } });
        out.fixedStopping++;
        continue;
      }
      if (s.state === 'STARTING' && now - s.updatedAt.getTime() > 90_000) {
        await transitionSession(deps.redis, { tenantId: s.tenantId, sessionId: s.id, to: 'ERROR', reason: 'Watchdog: o jogo não iniciou a tempo' }).catch(() => undefined);
        await prisma.liveSession.update({ where: { id: s.id }, data: { lastError: 'O jogo não iniciou a tempo. Tente iniciar novamente.' } });
        await raiseAlert({ tenantId: s.tenantId, sessionId: s.id, severity: 'CRITICAL', component: 'game-runner', code: 'START_TIMEOUT', message: 'Nenhum game-runner assumiu a sessão em 90s.' });
        out.fixedStarting++;
        continue;
      }
      // Recuperação após perda de dados voláteis do Redis.
      const inSet = await deps.redis.sismember(keys.activeSessions(), s.id);
      if (!inSet && s.state !== 'STOPPING') {
        const withConnector = !!s.connection && (s.connection.provider !== 'SIMULATOR' || (s.connection.config as { demoLoad?: string })?.demoLoad !== 'off');
        await activateSession(deps.redis, s.id, withConnector);
        out.reactivated++;
        deps.logger.warn({ sessionId: s.id }, 'sessão ativa reinscrita no Redis (recuperação)');
      }
      // Heartbeat do runner.
      const leased = await deps.redis.exists(keys.runnerLease(s.id));
      const hb = s.lastHeartbeatAt?.getTime() ?? 0;
      if (!leased && now - hb > 30_000 && s.state !== 'STARTING') {
        out.stale++;
        await raiseAlert({ tenantId: s.tenantId, sessionId: s.id, severity: 'WARNING', component: 'game-runner', code: 'RUNNER_MISSING', message: 'Sessão ativa sem game-runner há mais de 30s. Aguardando failover.' });
      } else if (leased) {
        await resolveAlerts('RUNNER_MISSING', 'game-runner', s.id);
      }
      // Limite de duração do plano.
      const limits = planLimitsSchema.safeParse(s.tenant.plan.limits);
      if (limits.success && s.startedAt && now - s.startedAt.getTime() > limits.data.maxSessionMinutes * 60_000) {
        await transitionSession(deps.redis, { tenantId: s.tenantId, sessionId: s.id, to: 'STOPPING', reason: 'Limite de duração do plano atingido' }).catch(() => undefined);
        await sendControl(deps.redis, s.id, 'STOP', undefined, 'system');
        await deactivateSession(deps.redis, s.id);
        await raiseAlert({ tenantId: s.tenantId, sessionId: s.id, severity: 'INFO', component: 'plans', code: 'SESSION_TIME_LIMIT', message: 'A sessão foi encerrada ao atingir o limite de duração do plano.' });
        out.timeLimited++;
      }
    }
    // Sessões no Redis que não estão mais ativas no banco.
    const members = await deps.redis.smembers(keys.activeSessions());
    if (members.length) {
      const stillActive = new Set(active.map((s) => s.id));
      for (const id of members) if (!stillActive.has(id)) await deactivateSession(deps.redis, id);
    }
    metrics.activeSessions.set({ kind: 'db' }, active.length);
    return out;
  }

  async function retention(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const tenants = await prisma.tenant.findMany({ select: { id: true, eventRetentionDays: true } });
    let deletedEvents = 0;
    for (const t of tenants) {
      const cutoff = new Date(Date.now() - t.eventRetentionDays * 86400_000);
      // Exclusão em lotes para não travar o banco.
      for (let i = 0; i < 50; i++) {
        const batch = await prisma.liveEvent.findMany({ where: { tenantId: t.id, receivedAt: { lt: cutoff } }, select: { id: true }, take: 5000 });
        if (batch.length === 0) break;
        const r = await prisma.liveEvent.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
        deletedEvents += r.count;
      }
    }
    out.events = deletedEvents;
    out.refreshTokens = (await prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 7 * 86400_000) } }] } })).count;
    out.resetTokens = (await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } })).count;
    out.processing = (await prisma.eventProcessing.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400_000) } } })).count;
    out.transitions = (await prisma.sessionTransition.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } } })).count;
    out.workers = (await prisma.worker.deleteMany({ where: { lastHeartbeatAt: { lt: new Date(Date.now() - 7 * 86400_000) } } })).count;
    out.alerts = (await prisma.systemAlert.deleteMany({ where: { resolvedAt: { lt: new Date(Date.now() - 30 * 86400_000) } } })).count;
    return out;
  }

  async function queueMetrics(): Promise<void> {
    for (const name of Object.values(QUEUES)) {
      const c = await getQueue(name, deps.queueRedis).getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized');
      for (const [state, n] of Object.entries(c)) metrics.queueDepth.set({ queue: name, state }, n);
      if ((c.failed ?? 0) > 1000) {
        await raiseAlert({ severity: 'WARNING', component: 'queues', code: 'QUEUE_FAILURES', message: `Fila ${name} acumulou ${c.failed} falhas.` });
      }
    }
  }

  return async function processMaintenance(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'watchdog':
        return watchdog();
      case 'retention':
        return retention();
      case 'queue-metrics':
        await queueMetrics();
        return { ok: true };
      default:
        return { ignored: job.name };
    }
  };
}
