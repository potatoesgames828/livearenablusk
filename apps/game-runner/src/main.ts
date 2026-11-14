import { createLogger, initMetrics, initTracing, metrics, startEventLoopMonitor, startHealthServer } from '@live-arena/observability';
import {
  createRedis, getQueue, installProcessHandlers, keys, Lease, QUEUES, redisHealthy, serviceIdentity, startHeartbeat, closeQueues,
  confirmSessionActive,
} from '@live-arena/runtime';
import { disconnectPrisma } from '@live-arena/database';
import { SessionRunner } from './session-runner';

const logger = createLogger('game-runner');
const MAX_SESSIONS = Number(process.env.RUNNER_MAX_SESSIONS ?? 20);
const MAX_HEAP_MB = Number(process.env.RUNNER_MAX_HEAP_MB ?? 768);
const LEASE_TTL_MS = Number(process.env.RUNNER_LEASE_TTL_MS ?? 6_000);

async function main(): Promise<void> {
  await initTracing('game-runner');
  initMetrics('game-runner');
  const redis = createRedis('game-runner');
  const queueRedis = createRedis('game-runner-queue', { forQueue: true });
  const identity = serviceIdentity('game-runner');
  const gameEventsQueue = getQueue(QUEUES.gameEvents, queueRedis);
  const runners = new Map<string, SessionRunner>();
  const starting = new Set<string>();
  const halting = new Set<string>();
  let lastLoopAt = Date.now();
  let shuttingDown = false;

  /**
   * Laço de alocação: tenta assumir sessões ativas sem dono (lease NX).
   * Vários runners podem rodar em paralelo — cada sessão terá exatamente um dono.
   */
  const assign = async () => {
    lastLoopAt = Date.now();
    if (shuttingDown) return;
    const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
    const active = await redis.smembers(keys.activeSessions()).catch(() => [] as string[]);
    const activeSet = new Set(active);
    // Sessões fora do índice Redis: confirma no banco antes de encerrar
    // (após perda de dados do Redis o índice é reconstruído, sem derrubar a LIVE).
    for (const [id, r] of runners) {
      if (activeSet.has(id) || halting.has(id)) continue;
      if (await confirmSessionActive(redis, id)) continue;
      halting.add(id);
      logger.info({ sessionId: id }, 'sessão encerrada no banco; finalizando localmente');
      void r.halt(true).finally(() => halting.delete(id));
    }
    if (heapMb > MAX_HEAP_MB) {
      logger.warn({ heapMb: Math.round(heapMb) }, 'limite de memória atingido; não aceitando novas sessões');
      return;
    }
    for (const id of active) {
      if (runners.size + starting.size >= MAX_SESSIONS) break;
      if (runners.has(id) || starting.has(id)) continue;
      const lease = new Lease(redis, keys.runnerLease(id), LEASE_TTL_MS, `${identity.id}:${id}`);
      if (!(await lease.acquire().catch(() => false))) continue;
      starting.add(id);
      const runner = new SessionRunner(id, redis, lease, gameEventsQueue, logger, (sid) => {
        runners.delete(sid);
        metrics.activeSessions.set({ kind: 'runner' }, runners.size);
      });
      try {
        await runner.start();
        runners.set(id, runner);
        logger.info({ sessionId: id }, 'sessão assumida');
      } catch (err) {
        logger.error({ err: (err as Error).message, sessionId: id }, 'falha ao iniciar sessão');
        await lease.release();
      } finally {
        starting.delete(id);
      }
    }
    metrics.activeSessions.set({ kind: 'runner' }, runners.size);
  };

  const loopTimer = setInterval(() => void assign().catch((err: unknown) => logger.error({ err }, 'erro no laço de alocação')), 1000);
  void assign();

  const stopHb = startHeartbeat(redis, identity, () => ({ sessions: [...runners.values()].map((r) => r.stats()), capacity: MAX_SESSIONS }));
  startEventLoopMonitor((lag) => logger.warn({ lagMs: Math.round(lag) }, 'event loop lento — jogos podem engasgar'), 200);
  const health = startHealthServer({
    port: Number(process.env.RUNNER_HEALTH_PORT ?? 9102),
    readiness: { redis: () => redisHealthy(redis) },
    // Watchdog: o laço de alocação precisa estar girando.
    liveness: { loop: () => Date.now() - lastLoopAt < 10_000 },
    metricsToken: process.env.METRICS_TOKEN,
  });

  installProcessHandlers(logger, [
    async () => {
      shuttingDown = true;
      clearInterval(loopTimer);
      // Entrega as sessões para outro runner com checkpoint atualizado.
      await Promise.all([...runners.values()].map((r) => r.handoff()));
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
  logger.info({ id: identity.id, maxSessions: MAX_SESSIONS }, 'game-runner pronto');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'falha ao iniciar game-runner');
  process.exit(1);
});
