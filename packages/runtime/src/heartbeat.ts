import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { getPrisma, toJson } from '@live-arena/database';
import { keys } from './keys';

export interface ServiceIdentity {
  id: string;
  kind: string;
  hostname: string;
  pid: number;
  version: string;
}

export function serviceIdentity(kind: string): ServiceIdentity {
  return {
    id: process.env.INSTANCE_ID ?? `${kind}-${os.hostname()}-${process.pid}-${randomUUID().slice(0, 6)}`,
    kind,
    hostname: os.hostname(),
    pid: process.pid,
    version: process.env.APP_VERSION ?? '0.1.0',
  };
}

/**
 * Heartbeat de serviço: grava no Redis (TTL curto, para watchdogs) e no banco
 * (histórico consultado pelo painel administrativo).
 */
export function startHeartbeat(
  redis: Redis,
  identity: ServiceIdentity,
  meta: () => Record<string, unknown> = () => ({}),
  intervalMs = 5000,
): () => Promise<void> {
  const prisma = getPrisma();
  let dbTick = 0;
  const beat = async () => {
    const m = meta();
    await redis
      .set(
        keys.serviceHeartbeat(identity.kind, identity.id),
        JSON.stringify({ ...identity, meta: m, at: Date.now() }),
        'PX',
        intervalMs * 3,
      )
      .catch(() => undefined);
    // Banco a cada 3 batidas para reduzir escrita.
    if (dbTick++ % 3 === 0) {
      await prisma.worker
        .upsert({
          where: { id: identity.id },
          create: { ...identity, status: 'UP', meta: toJson(m) },
          update: { lastHeartbeatAt: new Date(), status: 'UP', meta: toJson(m) },
        })
        .catch(() => undefined);
    }
  };
  void beat();
  const t = setInterval(() => void beat(), intervalMs);
  t.unref();
  return async () => {
    clearInterval(t);
    await redis.del(keys.serviceHeartbeat(identity.kind, identity.id)).catch(() => undefined);
    await prisma.worker.update({ where: { id: identity.id }, data: { status: 'DOWN' } }).catch(() => undefined);
  };
}

export async function listLiveServices(redis: Redis): Promise<Array<ServiceIdentity & { meta: unknown; at: number }>> {
  const out: Array<ServiceIdentity & { meta: unknown; at: number }> = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'la:svc:*', 'COUNT', 200);
    cursor = next;
    if (batch.length) {
      const vals = await redis.mget(...batch);
      for (const v of vals) if (v) out.push(JSON.parse(v) as ServiceIdentity & { meta: unknown; at: number });
    }
  } while (cursor !== '0');
  return out;
}
