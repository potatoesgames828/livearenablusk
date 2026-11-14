import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  automationActionSchema, automationTriggerSchema, intervalDue, nextInRotation,
  type AutomationAction, type AutomationTrigger,
} from '@live-arena/automation';
import { getPrisma } from '@live-arena/database';
import {
  keys, publishFx, raiseAlert, readSessionMeta, sendControl, transitionSession, writeSessionMeta, audit,
} from '@live-arena/runtime';
import { ACTIVE_SESSION_STATES, channels, type GameConfigBody, type SessionState } from '@live-arena/shared';
import type { Logger } from '@live-arena/observability';

export interface AutomationJob {
  tenantId?: string;
  sessionId?: string;
  trigger: AutomationTrigger['kind'] | 'TICK';
}

/**
 * Live Automation Engine (avaliação de regras "quando X → faça Y").
 * Executa ações via o mesmo controle de sessão usado pela API, garantindo
 * transições válidas e histórico.
 */
export function createAutomationProcessor(deps: { redis: Redis; logger: Logger }) {
  const prisma = getPrisma();

  async function execute(tenantId: string, sessionId: string, action: AutomationAction, automationId: string): Promise<void> {
    const r = deps.redis;
    const reason = `Automação ${automationId}`;
    const session = await prisma.liveSession.findFirst({ where: { id: sessionId, tenantId } });
    if (!session) return;
    switch (action.kind) {
      case 'START_GAME':
        await sendControl(r, sessionId, 'START', undefined, 'automation');
        break;
      case 'PAUSE_GAME':
        if (session.state === 'RUNNING') {
          await transitionSession(r, { tenantId, sessionId, to: 'PAUSED', reason });
          await sendControl(r, sessionId, 'PAUSE', undefined, 'automation');
        }
        break;
      case 'RESUME_GAME':
        if (session.state === 'PAUSED') {
          await transitionSession(r, { tenantId, sessionId, to: 'RUNNING', reason });
          await sendControl(r, sessionId, 'RESUME', undefined, 'automation');
        }
        break;
      case 'RESET_ROUND':
        await sendControl(r, sessionId, 'RESET_ROUND', undefined, 'automation');
        break;
      case 'RESET_SCORES':
        await sendControl(r, sessionId, 'RESET_SCORES', undefined, 'automation');
        break;
      case 'ANNOUNCE':
        await sendControl(r, sessionId, 'ANNOUNCE', { text: action.text }, 'automation');
        break;
      case 'NOTIFY_OWNER':
        await r.publish(channels.tenant(tenantId), JSON.stringify({ kind: 'automation', sessionId, text: action.text, at: Date.now() }));
        break;
      case 'SWITCH_GAME':
      case 'ROTATE_GAMES': {
        const target = action.kind === 'SWITCH_GAME' ? action.gameConfigId : nextInRotation(action.gameConfigIds, session.gameConfigId);
        const gc = await prisma.gameConfiguration.findFirst({ where: { id: target, tenantId } });
        if (!gc) return;
        await prisma.liveSession.update({ where: { id: sessionId }, data: { gameConfigId: gc.id } });
        const meta = await readSessionMeta(r, sessionId);
        if (meta) await writeSessionMeta(r, { ...meta, gameId: gc.gameId, gameConfigId: gc.id, config: gc.body as unknown as GameConfigBody, version: Date.now() });
        await sendControl(r, sessionId, 'SWITCH_GAME', { gameConfigId: gc.id }, 'automation');
        await publishFx(r, tenantId, sessionId, { kind: 'game-switched', gameId: gc.gameId });
        break;
      }
    }
    await audit({ tenantId, action: `automation.${action.kind.toLowerCase()}`, targetType: 'LiveSession', targetId: sessionId, metadata: { automationId } });
  }

  async function evaluate(tenantId: string, sessionId: string, trigger: AutomationJob['trigger']): Promise<number> {
    const now = Date.now();
    const automations = await prisma.automation.findMany({
      where: { tenantId, enabled: true, OR: [{ sessionId: null }, { sessionId }] },
      include: { rules: { orderBy: { position: 'asc' } } },
    });
    let executed = 0;
    for (const a of automations) {
      for (const rule of a.rules) {
        const t = automationTriggerSchema.safeParse(rule.trigger);
        const act = automationActionSchema.safeParse(rule.action);
        if (!t.success || !act.success) continue;
        let fire = false;
        if (trigger === 'TICK') {
          if (t.data.kind === 'INTERVAL') {
            const lastKey = `la:auto:last:${sessionId}:${rule.id}`;
            const last = await deps.redis.get(lastKey);
            const lastAt = last ? Number(last) : null;
            if (lastAt === null) {
              // Primeira avaliação: inicia a contagem sem disparar imediatamente.
              await deps.redis.set(lastKey, String(now), 'EX', 86400);
            } else if (intervalDue(lastAt, t.data.minutes, now)) {
              fire = true;
              await deps.redis.set(lastKey, String(now), 'EX', 86400);
            }
          } else if (t.data.kind === 'COUNTER_THRESHOLD') {
            const value = Number(await deps.redis.hget(keys.counters(sessionId), t.data.counter)) || 0;
            const stepKey = `la:auto:step:${sessionId}:${rule.id}`;
            const reached = Math.floor(value / t.data.every);
            const prev = Number(await deps.redis.get(stepKey)) || 0;
            if (reached > prev) {
              fire = true;
              await deps.redis.set(stepKey, String(reached), 'EX', 86400);
            }
          }
        } else if (t.data.kind === trigger) {
          fire = true;
        }
        if (!fire) continue;
        try {
          await execute(tenantId, sessionId, act.data, a.id);
          executed++;
        } catch (err) {
          deps.logger.warn({ err: (err as Error).message, automationId: a.id }, 'falha ao executar automação');
          await raiseAlert({ tenantId, sessionId, severity: 'WARNING', component: 'automation', code: 'AUTOMATION_FAILED', message: `Automação "${a.name}" falhou: ${(err as Error).message}` });
        }
      }
      if (executed) await prisma.automation.update({ where: { id: a.id }, data: { lastRunAt: new Date() } }).catch(() => undefined);
    }
    return executed;
  }

  return async function processAutomation(job: Job<AutomationJob>): Promise<{ executed: number }> {
    if (job.data.trigger === 'TICK') {
      const active = await prisma.liveSession.findMany({ where: { state: { in: [...ACTIVE_SESSION_STATES] as SessionState[] } }, select: { id: true, tenantId: true } });
      let executed = 0;
      for (const s of active) executed += await evaluate(s.tenantId, s.id, 'TICK');
      return { executed };
    }
    if (!job.data.tenantId || !job.data.sessionId) return { executed: 0 };
    return { executed: await evaluate(job.data.tenantId, job.data.sessionId, job.data.trigger) };
  };
}
