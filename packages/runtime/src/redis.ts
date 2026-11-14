import { Redis, type RedisOptions } from 'ioredis';

export { Redis };

/**
 * Cria um cliente Redis. `forQueue` aplica as opções exigidas pelo BullMQ
 * (maxRetriesPerRequest = null), que mantém o worker vivo durante quedas do Redis
 * e retoma automaticamente quando ele volta.
 */
export function createRedis(name: string, opts: { forQueue?: boolean } = {}): Redis {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const options: RedisOptions = {
    connectionName: `live-arena:${name}`,
    enableAutoPipelining: !opts.forQueue,
    maxRetriesPerRequest: opts.forQueue ? null : 3,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    reconnectOnError: (err) => err.message.includes('READONLY'),
  };
  const client = new Redis(url, options);
  client.on('error', (err: Error) => {
    // Erros transitórios são esperados durante reconexão; o retryStrategy cuida.
    if (process.env.LOG_REDIS_ERRORS === '1') console.error(`[redis:${name}]`, err.message);
  });
  return client;
}

export async function redisHealthy(client: Redis): Promise<boolean> {
  try {
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}
