import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { liveEventSchema, channels, type LiveEvent, type GiftPayload, type LikePayload } from '@live-arena/shared';
import { matchAlerts, processEvent, RedisEventStore, toAlertFx, type AlertConfig, type ProcessResult } from '@live-arena/event-engine';
import { getPrisma, toJson } from '@live-arena/database';
import { getOrRebuildSessionMeta, keys, pushRunnerMessages, QUEUES, getQueue, type SessionMeta } from '@live-arena/runtime';
import { metrics, type Logger } from '@live-arena/observability';

/** Cache curto de metadados de sessão (evita uma leitura Redis por evento). */
class MetaCache {
  private map = new Map<string, { meta: SessionMeta | null; at: number }>();
  constructor(private readonly redis: Redis) {}
  async get(sessionId: string): Promise<SessionMeta | null> {
    const c = this.map.get(sessionId);
    if (c && Date.now() - c.at < 2000) return c.meta;
    const active = await this.redis.sismember(keys.activeSessions(), sessionId);
    const meta = active ? await getOrRebuildSessionMeta(this.redis, sessionId) : null;
    this.map.set(sessionId, { meta, at: Date.now() });
    if (this.map.size > 5000) this.map.clear();
    return meta;
  }
}

/** Alertas do tenant em cache curto (evita consulta ao banco a cada evento). */
class AlertCache {
  private map = new Map<string, { items: AlertConfig[]; at: number }>();
  async get(tenantId: string): Promise<AlertConfig[]> {
    const c = this.map.get(tenantId);
    if (c && Date.now() - c.at < 5000) return c.items;
    const rows = await getPrisma().alertRule.findMany({ where: { tenantId, enabled: true }, take: 100 });
    const items: AlertConfig[] = rows.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, trigger: r.trigger, message: r.message, emoji: r.emoji, color: r.color, soundId: r.soundId, volume: r.volume, durationMs: r.durationMs, cooldownMs: r.cooldownMs }));
    this.map.set(tenantId, { items, at: Date.now() });
    if (this.map.size > 5000) this.map.clear();
    return items;
  }
}

/** Resumo enviado ao feed de eventos em tempo real (sem dados desnecessários). */
function feedItem(e: LiveEvent, r: ProcessResult) {
  const p = e.payload as Record<string, unknown>;
  let detail = '';
  if (e.type === 'GIFT') {
    const g = p as unknown as GiftPayload;
    detail = `${g.giftName ?? g.giftId} x${r.giftDelta ?? g.repeatCount}`;
  } else if (e.type === 'LIKE') detail = `${(p as unknown as LikePayload).count} curtidas`;
  else if (e.type === 'CHAT') detail = String(p.comment ?? '').slice(0, 120);
  else if (e.type === 'ROOM_USER') detail = `${String(p.viewerCount)} espectadores`;
  return {
    id: e.eventId,
    type: e.type,
    user: e.user ? e.user.nickname ?? e.user.username ?? 'Espectador' : null,
    detail,
    status: r.status,
    actions: r.matchedRuleIds.length,
    throttled: r.throttledRuleIds.length,
    simulated: e.simulated,
    at: e.timestamp,
  };
}

export function createIngestProcessor(deps: { redis: Redis; queueRedis: Redis; logger: Logger }) {
  const store = new RedisEventStore(deps.redis);
  const metaCache = new MetaCache(deps.redis);
  const prisma = getPrisma();
  const lastStatusPublish = new Map<string, number>();
  const automationQueue = getQueue(QUEUES.automation, deps.queueRedis);
  const alertCache = new AlertCache();

  return async function processIngest(job: Job<LiveEvent>): Promise<{ status: string }> {
    const end = metrics.eventProcessingSeconds.startTimer();
    const parsed = liveEventSchema.safeParse(job.data);
    if (!parsed.success) {
      metrics.eventsProcessed.inc({ type: 'unknown', status: 'INVALID' });
      return { status: 'INVALID' }; // não adianta tentar de novo
    }
    const event = parsed.data;
    const meta = await metaCache.get(event.sessionId);
    // Isolamento: o tenant do evento precisa ser o mesmo dono da sessão.
    if (!meta || meta.tenantId !== event.tenantId) {
      metrics.eventsDropped.inc({ type: event.type, reason: 'session_inactive' });
      return { status: 'SESSION_INACTIVE' };
    }
    const result = await processEvent(event, { rules: meta.config.rules ?? [], store });
    end({ type: event.type });
    metrics.eventsProcessed.inc({ type: event.type, status: result.status });
    if (result.status === 'DUPLICATE') {
      metrics.eventsDuplicated.inc({ type: event.type });
      return { status: 'DUPLICATE' };
    }

    if (result.messages.length) await pushRunnerMessages(deps.redis, event.sessionId, result.messages);
    for (const m of result.messages) if (m.kind === 'game') metrics.actionsEmitted.inc({ game: meta.gameId, action: m.actionId });

    // Feed em tempo real (atualizações intermediárias de streak não poluem o feed).
    if (result.status !== 'IGNORED' && event.type !== 'ROOM_USER') {
      await deps.redis.publish(channels.sessionEvents(event.tenantId, event.sessionId), JSON.stringify(feedItem(event, result)));
    }
    // Alertas configurados (overlay): mesmo formato de gatilho das regras, com cooldown próprio.
    if (result.status !== 'IGNORED' && result.matchContext) {
      const alerts = await alertCache.get(event.tenantId).catch(() => [] as AlertConfig[]);
      if (alerts.length) {
        for (const m of matchAlerts(event, alerts, result.matchContext).slice(0, 3)) {
          if (m.alert.cooldownMs > 0 && !(await store.acquireCooldown(`la:alert:${event.sessionId}:${m.alert.id}`, m.alert.cooldownMs))) continue;
          await deps.redis.publish(channels.sessionFx(event.tenantId, event.sessionId), JSON.stringify(toAlertFx(m.alert, event, m.quantity)));
        }
      }
    }

    // Contadores agregados no máximo 2x por segundo por sessão.
    const now = Date.now();
    if ((lastStatusPublish.get(event.sessionId) ?? 0) + 500 < now) {
      lastStatusPublish.set(event.sessionId, now);
      await deps.redis.publish(
        channels.sessionStatus(event.tenantId, event.sessionId),
        JSON.stringify({ sessionId: event.sessionId, stats: result.counters, at: now }),
      );
    }

    if (result.persist) {
      await prisma.liveEvent
        .create({
          data: {
            tenantId: event.tenantId,
            sessionId: event.sessionId,
            eventId: event.eventId,
            type: event.type,
            source: event.source,
            viewerId: event.user?.id,
            viewerName: event.user?.nickname ?? event.user?.username,
            payload: toJson(event.payload),
            simulated: event.simulated,
            status: result.status,
            actions: result.matchedRuleIds.length,
            occurredAt: new Date(event.timestamp),
          },
        })
        .catch((err: unknown) => {
          // Violação de unicidade = já persistido (reprocessamento) — idempotente.
          if ((err as { code?: string }).code !== 'P2002') throw err;
        });
    }

    if (event.type === 'STREAM_START' || event.type === 'STREAM_END') {
      await automationQueue.add(event.type, { tenantId: event.tenantId, sessionId: event.sessionId, trigger: event.type }, { jobId: `auto_${event.eventId}`.replace(/:/g, '_') });
    }
    return { status: result.status };
  };
}

/** Registra falhas definitivas (após todas as tentativas) e envia à Dead Letter Queue. */
export async function recordDeadLetter(queueRedis: Redis, job: Job | undefined, err: Error, logger: Logger): Promise<void> {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < attempts) return;
  const data = job.data as Partial<LiveEvent>;
  metrics.eventsProcessed.inc({ type: data.type ?? 'unknown', status: 'FAILED' });
  logger.error({ jobId: job.id, err: err.message }, 'evento falhou definitivamente; enviado à DLQ');
  await getQueue(QUEUES.deadLetter, queueRedis).add('failed', { queue: job.queueName, jobId: job.id, data: job.data, error: err.message }, { removeOnComplete: false }).catch(() => undefined);
  if (data.tenantId && data.sessionId && data.eventId) {
    await getPrisma()
      .eventProcessing.create({
        data: { tenantId: data.tenantId, sessionId: data.sessionId, eventId: data.eventId, status: 'FAILED', error: err.message.slice(0, 500), attempts: job.attemptsMade, payload: toJson(data) },
      })
      .catch(() => undefined);
  }
}
