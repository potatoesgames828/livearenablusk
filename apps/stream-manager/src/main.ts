import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { getPrisma, disconnectPrisma } from '@live-arena/database';
import { createRedis, installProcessHandlers, keys, Lease, QUEUES, raiseAlert, redisHealthy, serviceIdentity, startHeartbeat, updateSessionStatus, confirmSessionActive } from '@live-arena/runtime';
import { createLogger, initMetrics, initTracing, startHealthServer } from '@live-arena/observability';
import { StreamPipeline } from './pipeline';

const logger = createLogger('stream-manager');
const MAX_PIPELINES = Number(process.env.STREAM_MAX_PIPELINES ?? 2);

interface StreamJob {
  tenantId: string;
  sessionId: string;
  action: 'start' | 'stop';
}

async function main(): Promise<void> {
  await initTracing('stream-manager');
  initMetrics('stream-manager');
  const redis = createRedis('stream-manager');
  const queueRedis = createRedis('stream-manager-queue', { forQueue: true });
  const identity = serviceIdentity('stream-manager');
  const pipelines = new Map<string, StreamPipeline>();

  const handle = async (job: Job<StreamJob>) => {
    const { tenantId, sessionId, action } = job.data;
    if (action === 'stop') {
      const p = pipelines.get(sessionId);
      if (p) await p.stop(true);
      // Se o pipeline estiver em outra instância, ela verá a sessão parada e encerrará (ver laço abaixo).
      return { stopped: Boolean(p) };
    }
    if (pipelines.has(sessionId)) return { already: true };
    if (pipelines.size >= MAX_PIPELINES) throw new Error('capacidade de vídeo esgotada neste servidor');
    const s = await getPrisma().liveSession.findFirst({ where: { id: sessionId, tenantId }, include: { streamConfig: true } });
    if (!s?.streamConfig) return { error: 'sem configuração' };
    // Lock por chave de transmissão: impede dois processos usando a mesma chave (conflito na plataforma).
    const lockKey = s.streamConfig.streamKeyHash ?? `record:${s.streamConfig.id}:${sessionId}`;
    const lease = new Lease(redis, keys.streamLease(lockKey), 15_000, `${identity.id}:${sessionId}`);
    if (!(await lease.acquire())) {
      await updateSessionStatus(redis, tenantId, sessionId, { streamState: 'ERROR', message: 'Esta chave de transmissão já está em uso por outro processo.' });
      await raiseAlert({ tenantId, sessionId, severity: 'WARNING', component: 'stream-manager', code: 'STREAM_KEY_IN_USE', message: 'Tentativa de usar uma chave de transmissão já em uso.' });
      return { error: 'STREAM_KEY_IN_USE' };
    }
    lease.keepAlive(() => void pipelines.get(sessionId)?.stop(false));
    const p = new StreamPipeline(tenantId, sessionId, redis, lease, logger, (id) => pipelines.delete(id));
    pipelines.set(sessionId, p);
    try {
      await p.start();
    } catch (err) {
      logger.error({ err: (err as Error).message, sessionId }, 'falha ao iniciar transmissão');
      await updateSessionStatus(redis, tenantId, sessionId, { streamState: 'ERROR', message: `Falha ao iniciar a transmissão: ${(err as Error).message}` });
      await p.stop(false);
    }
    return { started: true };
  };

  const worker = new Worker(QUEUES.streamControl, handle, { connection: queueRedis as unknown as ConnectionOptions, concurrency: 2, lockDuration: 60_000 });
  worker.on('error', (err) => logger.error({ err: err.message }, 'erro no worker de vídeo'));

  // Encerra pipelines de sessões que não estão mais ativas (independe de quem recebeu o "stop").
  const reaper = setInterval(() => {
    void (async () => {
      const active = new Set(await redis.smembers(keys.activeSessions()).catch(() => [] as string[]));
      for (const [id, p] of pipelines) if (!active.has(id) && !(await confirmSessionActive(redis, id))) await p.stop(true);
    })();
  }, 5000);

  const stopHb = startHeartbeat(redis, identity, () => ({ pipelines: [...pipelines.values()].map((p) => p.status()), capacity: MAX_PIPELINES }));
  const health = startHealthServer({
    port: Number(process.env.STREAM_HEALTH_PORT ?? 9104),
    readiness: { redis: () => redisHealthy(redis) },
    liveness: { worker: () => worker.isRunning() },
    metricsToken: process.env.METRICS_TOKEN,
  });
  installProcessHandlers(logger, [
    async () => {
      clearInterval(reaper);
      await worker.close();
      await Promise.all([...pipelines.values()].map((p) => p.stop(true)));
    },
    stopHb,
    () => void health.close(),
    () => {
      redis.disconnect();
      queueRedis.disconnect();
    },
    disconnectPrisma,
  ], 20_000);
  logger.info({ id: identity.id }, 'stream-manager pronto');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'falha ao iniciar stream-manager');
  process.exit(1);
});
