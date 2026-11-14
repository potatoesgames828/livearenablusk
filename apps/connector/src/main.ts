import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { createAdapter, CircuitBreaker, UserOfflineError, ConnectorUnavailableError, type TikTokConnectorAdapter, type ProviderId, type DemoLoad } from '@live-arena/tiktok-adapter';
import { normalizeEvent, TokenBucket, type RawSourceEvent } from '@live-arena/event-engine';
import { decryptSecret } from '@live-arena/security';
import { getPrisma, disconnectPrisma } from '@live-arena/database';
import {
  createRedis, enqueueEvents, getQueue, installProcessHandlers, keys, Lease, QUEUES, raiseAlert, redisHealthy, resolveAlerts,
  serviceIdentity, startHeartbeat, updateSessionStatus, closeQueues, getOrRebuildSessionMeta,
} from '@live-arena/runtime';
import { backoffDelay, type ConnectorState, type LiveEvent } from '@live-arena/shared';
import { createLogger, initMetrics, initTracing, metrics, startHealthServer, type Logger } from '@live-arena/observability';

const logger = createLogger('connector');
const MAX_CONNECTIONS = Number(process.env.CONNECTOR_MAX_CONNECTIONS ?? 50);

const DEMO_LOADS: Record<string, DemoLoad | null> = {
  off: null,
  light: { chatPerSec: 0.6, likesPerSec: 8, giftsPerMin: 6, followsPerMin: 2 },
  busy: { chatPerSec: 3, likesPerSec: 60, giftsPerMin: 40, followsPerMin: 10 },
};

/**
 * Gerencia uma conexão de fonte de eventos para uma sessão: conecta,
 * normaliza e enfileira eventos, reconecta com backoff exponencial e
 * circuit breaker. Independente do jogo e do vídeo.
 */
class ManagedConnection {
  private adapter: TikTokConnectorAdapter | null = null;
  private attempt = 0;
  private breaker = new CircuitBreaker(5, 120_000);
  private buffer: LiveEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private faultTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private state: ConnectorState = 'IDLE';
  // Proteção contra tempestades na origem (antes da fila).
  private bucket = new TokenBucket(2000, 1000);
  private tenantId = '';

  constructor(
    readonly sessionId: string,
    private readonly redis: Redis,
    private readonly queue: Queue,
    private readonly lease: Lease,
    private readonly log: Logger,
    private readonly onFinished: (id: string) => void,
  ) {}

  async start(): Promise<void> {
    this.lease.keepAlive(() => void this.stop('lease perdido'));
    this.flushTimer = setInterval(() => void this.flush(), 100);
    this.faultTimer = setInterval(() => void this.checkFault(), 1000);
    await this.connect();
  }

  private async setState(state: ConnectorState, message?: string): Promise<void> {
    this.state = state;
    if (this.tenantId) await updateSessionStatus(this.redis, this.tenantId, this.sessionId, { connectorState: state, message }).catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const meta = await getOrRebuildSessionMeta(this.redis, this.sessionId);
    if (!meta?.connection) {
      await this.stop('sessão sem fonte de eventos');
      return;
    }
    this.tenantId = meta.tenantId;
    const conn = await getPrisma().liveConnection.findFirst({ where: { id: meta.connection.id, tenantId: meta.tenantId } });
    if (!conn) {
      await this.stop('conexão removida');
      return;
    }
    if (!this.breaker.canAttempt()) {
      await this.setState('ERROR', `Muitas falhas seguidas. Nova tentativa em ${Math.ceil(this.breaker.retryInMs() / 1000)}s.`);
      this.scheduleRetry(this.breaker.retryInMs());
      return;
    }
    let credentials: Record<string, string> | undefined;
    if (conn.credentialsEnc) {
      try {
        credentials = JSON.parse(decryptSecret(conn.credentialsEnc)) as Record<string, string>;
      } catch {
        await this.setState('ERROR', 'Não foi possível ler as credenciais da conexão.');
        return;
      }
    }
    const demoLoad = DEMO_LOADS[String((conn.config as { demoLoad?: string })?.demoLoad ?? 'off')] ?? null;
    this.adapter = createAdapter(conn.provider as ProviderId, { demoLoad });
    await this.setState('CONNECTING');
    try {
      await this.adapter.connect(
        { uniqueId: conn.tiktokUsername ?? 'simulator', credentials },
        {
          onEvent: (raw) => this.onRaw(raw),
          onState: (s, detail) => void this.setState(s, detail),
          onDisconnected: (reason, retryable) => void this.onDisconnected(reason, retryable),
        },
      );
      this.attempt = 0;
      this.breaker.success();
      await this.setState('CONNECTED');
      await resolveAlerts('CONNECTOR_DOWN', 'connector', this.sessionId);
    } catch (err) {
      await this.adapter.disconnect().catch(() => undefined);
      this.adapter = null;
      if (err instanceof ConnectorUnavailableError) {
        await this.setState('ERROR', err.message);
        await raiseAlert({ tenantId: this.tenantId, sessionId: this.sessionId, severity: 'WARNING', component: 'connector', code: 'CONNECTOR_UNAVAILABLE', message: err.message });
        this.scheduleRetry(5 * 60_000);
        return;
      }
      if (err instanceof UserOfflineError) {
        await this.setState('OFFLINE', 'O criador não está ao vivo. Verificando de novo em 60s.');
        this.scheduleRetry(60_000);
        return;
      }
      this.breaker.failure();
      const delay = backoffDelay(this.attempt++, 1000, 60_000);
      await this.setState('RECONNECTING', `Falha ao conectar: ${(err as Error).message}. Nova tentativa em ${Math.round(delay / 1000)}s.`);
      this.scheduleRetry(delay);
    }
  }

  private scheduleRetry(ms: number): void {
    if (this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.connect(), ms);
  }

  private async onDisconnected(reason: string, retryable: boolean): Promise<void> {
    if (this.stopped) return;
    await this.adapter?.disconnect().catch(() => undefined);
    this.adapter = null;
    metrics.reconnections.inc({ provider: 'any' });
    if (!retryable) {
      await this.setState('OFFLINE', reason);
      this.scheduleRetry(60_000);
      return;
    }
    await raiseAlert({ tenantId: this.tenantId, sessionId: this.sessionId, severity: 'WARNING', component: 'connector', code: 'CONNECTOR_DOWN', message: `Fonte de eventos caiu: ${reason}` });
    const delay = backoffDelay(this.attempt++, 500, 30_000);
    await this.setState('RECONNECTING', `${reason}. Reconectando em ${Math.round(delay / 1000)}s.`);
    this.scheduleRetry(delay);
  }

  private onRaw(raw: RawSourceEvent): void {
    if (!this.bucket.take()) {
      metrics.eventsDropped.inc({ type: raw.type, reason: 'source_rate_limit' });
      return;
    }
    try {
      this.buffer.push(normalizeEvent(this.tenantId, this.sessionId, raw));
    } catch {
      metrics.eventsDropped.inc({ type: raw.type, reason: 'invalid' });
    }
    if (this.buffer.length > 5000) this.buffer.splice(0, this.buffer.length - 5000); // fila em memória limitada
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, 500);
    try {
      await enqueueEvents(this.queue, batch);
    } catch (err) {
      this.log.warn({ err: (err as Error).message, n: batch.length }, 'falha ao enfileirar; mantendo eventos prioritários');
      // Mantém apenas presentes/seguidores em caso de falha (evita perder o que mais importa).
      const keep = batch.filter((e) => e.type === 'GIFT' || e.type === 'FOLLOW' || e.type === 'SUBSCRIPTION');
      this.buffer.unshift(...keep.slice(0, 1000));
    }
  }

  private async checkFault(): Promise<void> {
    const raw = await this.redis.get(keys.faultInjection(this.sessionId)).catch(() => null);
    if (!raw) return;
    const f = JSON.parse(raw) as { kind: string; until: number; connectorHandled?: boolean };
    if (f.kind !== 'connector-drop' || f.connectorHandled) return;
    await this.redis.set(keys.faultInjection(this.sessionId), JSON.stringify({ ...f, connectorHandled: true }), 'EX', 60);
    this.log.warn({ sessionId: this.sessionId }, 'FALHA INJETADA: derrubando a fonte de eventos');
    await this.adapter?.disconnect().catch(() => undefined);
    this.adapter = null;
    await raiseAlert({ tenantId: this.tenantId, sessionId: this.sessionId, severity: 'WARNING', component: 'connector', code: 'CONNECTOR_DOWN', message: 'Queda simulada da fonte de eventos (teste de recuperação).' });
    await this.setState('RECONNECTING', 'Queda simulada; reconectando automaticamente.');
    metrics.reconnections.inc({ provider: 'fault' });
    this.scheduleRetry(Math.max(1000, f.until - Date.now()));
  }

  async stop(reason: string): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.log.info({ sessionId: this.sessionId, reason }, 'encerrando conexão de eventos');
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.faultTimer) clearInterval(this.faultTimer);
    await this.adapter?.disconnect().catch(() => undefined);
    await this.flush();
    await this.setState('IDLE');
    await this.lease.release();
    this.onFinished(this.sessionId);
  }

  get status() {
    return { sessionId: this.sessionId, state: this.state, attempt: this.attempt, breaker: this.breaker.state };
  }
}

async function main(): Promise<void> {
  await initTracing('connector');
  initMetrics('connector');
  const redis = createRedis('connector');
  const queueRedis = createRedis('connector-queue', { forQueue: true });
  const queue = getQueue(QUEUES.ingest, queueRedis);
  const identity = serviceIdentity('connector');
  const conns = new Map<string, ManagedConnection>();
  let lastLoop = Date.now();

  const loop = async () => {
    lastLoop = Date.now();
    const wanted = new Set(await redis.smembers(keys.activeConnectors()).catch(() => [] as string[]));
    for (const [id, c] of conns) if (!wanted.has(id)) void c.stop('sessão encerrada');
    for (const id of wanted) {
      if (conns.has(id) || conns.size >= MAX_CONNECTIONS) continue;
      const lease = new Lease(redis, keys.connectorLease(id), 15_000, `${identity.id}:${id}`);
      if (!(await lease.acquire().catch(() => false))) continue;
      const c = new ManagedConnection(id, redis, queue, lease, logger, (sid) => conns.delete(sid));
      conns.set(id, c);
      c.start().catch((err: unknown) => logger.error({ err, sessionId: id }, 'falha ao iniciar conexão'));
    }
    metrics.activeSessions.set({ kind: 'connector' }, conns.size);
  };
  const timer = setInterval(() => void loop().catch((err: unknown) => logger.error({ err }, 'erro no laço do conector')), 1000);
  void loop();

  const stopHb = startHeartbeat(redis, identity, () => ({ connections: [...conns.values()].map((c) => c.status) }));
  const health = startHealthServer({
    port: Number(process.env.CONNECTOR_HEALTH_PORT ?? 9103),
    readiness: { redis: () => redisHealthy(redis) },
    liveness: { loop: () => Date.now() - lastLoop < 10_000 },
    metricsToken: process.env.METRICS_TOKEN,
  });
  installProcessHandlers(logger, [
    async () => {
      clearInterval(timer);
      await Promise.all([...conns.values()].map((c) => c.stop('processo encerrando')));
    },
    stopHb,
    closeQueues,
    () => void health.close(),
    () => {
      redis.disconnect();
      queueRedis.disconnect();
    },
    disconnectPrisma,
  ]);
  logger.info({ id: identity.id }, 'connector pronto');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'falha ao iniciar connector');
  process.exit(1);
});
