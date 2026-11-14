import { Worker, type ConnectionOptions } from 'bullmq';
import { createLogger, initMetrics, initTracing, startEventLoopMonitor, startHealthServer, metrics } from '@live-arena/observability';
import { createRedis, getQueue, installProcessHandlers, QUEUES, redisHealthy, serviceIdentity, startHeartbeat, closeQueues } from '@live-arena/runtime';
import { getPrisma, disconnectPrisma } from '@live-arena/database';
import { createIngestProcessor, recordDeadLetter } from './ingest';
import { createGameEventsProcessor } from './game-events';
import { createAutomationProcessor } from './automation';
import { createMaintenanceProcessor } from './maintenance';

const logger = createLogger('worker');

async function main(): Promise<void> {
  await initTracing('worker');
  initMetrics('worker');
  const redis = createRedis('worker');
  const queueRedis = createRedis('worker-queue', { forQueue: true });
  const connection = queueRedis as unknown as ConnectionOptions;
  const identity = serviceIdentity('worker');
  const concurrency = Number(process.env.INGEST_CONCURRENCY ?? 32);

  const ingest = new Worker(QUEUES.ingest, createIngestProcessor({ redis, queueRedis, logger }), {
    connection,
    concurrency,
    // Limite global de processamento (proteção contra tempestades).
    limiter: { max: Number(process.env.INGEST_MAX_PER_SECOND ?? 5000), duration: 1000 },
    lockDuration: 30_000,
    stalledInterval: 15_000,
    maxStalledCount: 2,
  });
  const gameEvents = new Worker(QUEUES.gameEvents, createGameEventsProcessor({ queueRedis, logger }), { connection, concurrency: 8 });
  const automation = new Worker(QUEUES.automation, createAutomationProcessor({ redis, logger }), { connection, concurrency: 4 });
  const maintenance = new Worker(QUEUES.maintenance, createMaintenanceProcessor({ redis, queueRedis, logger }), { connection, concurrency: 1, lockDuration: 120_000 });
  const workers = [ingest, gameEvents, automation, maintenance];

  for (const w of workers) {
    w.on('failed', (job, err) => {
      metrics.errors.inc({ component: `worker:${w.name}`, code: 'job_failed' });
      void recordDeadLetter(queueRedis, job, err, logger);
    });
    w.on('error', (err) => logger.error({ err: err.message, queue: w.name }, 'erro no worker'));
  }

  // Tarefas programadas (idempotentes: o BullMQ deduplica por "scheduler id").
  const maint = getQueue(QUEUES.maintenance, queueRedis);
  await maint.upsertJobScheduler('watchdog', { every: 15_000 }, { name: 'watchdog' });
  await maint.upsertJobScheduler('queue-metrics', { every: 15_000 }, { name: 'queue-metrics' });
  await maint.upsertJobScheduler('retention', { every: 3_600_000 }, { name: 'retention' });
  await getQueue(QUEUES.automation, queueRedis).upsertJobScheduler('automation-tick', { every: 30_000 }, { name: 'tick', data: { trigger: 'TICK' } });

  const stopHb = startHeartbeat(redis, identity, () => ({ concurrency, running: workers.map((w) => ({ q: w.name, running: w.isRunning() })) }));
  startEventLoopMonitor((lag) => logger.warn({ lagMs: Math.round(lag) }, 'event loop lento'));
  const health = startHealthServer({
    port: Number(process.env.WORKER_HEALTH_PORT ?? 9101),
    readiness: { redis: () => redisHealthy(redis), database: () => getPrisma().$queryRaw`SELECT 1`.then(() => true) },
    liveness: { workers: () => workers.every((w) => w.isRunning()) },
    metricsToken: process.env.METRICS_TOKEN,
  });

  installProcessHandlers(logger, [
    async () => {
      // Para de pegar novos jobs e aguarda os atuais terminarem.
      await Promise.all(workers.map((w) => w.close()));
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
  logger.info({ id: identity.id, concurrency }, 'worker pronto');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'falha ao iniciar worker');
  process.exit(1);
});
