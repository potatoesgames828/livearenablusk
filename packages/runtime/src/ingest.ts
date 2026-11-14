import type { Queue } from 'bullmq';
import { EVENT_PRIORITY, LOW_PRIORITY_EVENTS, type LiveEvent } from '@live-arena/shared';
import { metrics } from '@live-arena/observability';
import { INGEST_BACKPRESSURE_LIMIT, INGEST_HARD_LIMIT } from './queues';

let cachedDepth = { value: 0, at: 0 };

async function queueDepth(queue: Queue): Promise<number> {
  const now = Date.now();
  if (now - cachedDepth.at < 500) return cachedDepth.value;
  const counts = await queue.getJobCounts('waiting', 'prioritized', 'delayed');
  cachedDepth = { value: (counts.waiting ?? 0) + (counts.prioritized ?? 0), at: now };
  return cachedDepth.value;
}

export class IngestOverloadedError extends Error {
  constructor() {
    super('Fila de ingestão sobrecarregada');
    this.name = 'IngestOverloadedError';
  }
}

/**
 * Enfileira eventos normalizados com prioridade e backpressure:
 *  - acima do limite suave, eventos de baixa prioridade (curtidas, chat,
 *    entradas) são descartados de forma controlada e contabilizados;
 *  - acima do limite rígido, a chamada falha para o produtor desacelerar.
 * O jobId (tenant+eventId) dá idempotência enquanto o job existir na fila.
 */
export async function enqueueEvents(queue: Queue, events: LiveEvent[], opts: { delayMs?: (i: number) => number } = {}): Promise<{ queued: number; dropped: number }> {
  if (events.length === 0) return { queued: 0, dropped: 0 };
  const depth = await queueDepth(queue);
  if (depth > INGEST_HARD_LIMIT) throw new IngestOverloadedError();
  const accepted: LiveEvent[] = [];
  let dropped = 0;
  for (const e of events) {
    metrics.eventsReceived.inc({ type: e.type, source: e.source });
    if (depth > INGEST_BACKPRESSURE_LIMIT && LOW_PRIORITY_EVENTS.has(e.type)) {
      dropped++;
      metrics.eventsDropped.inc({ type: e.type, reason: 'backpressure' });
      continue;
    }
    accepted.push(e);
  }
  await queue.addBulk(
    accepted.map((e, i) => ({
      name: e.type,
      data: e,
      opts: {
        jobId: `${e.tenantId}:${e.eventId}`.replace(/:/g, '_'),
        priority: EVENT_PRIORITY[e.type],
        delay: opts.delayMs?.(i),
      },
    })),
  );
  return { queued: accepted.length, dropped };
}
