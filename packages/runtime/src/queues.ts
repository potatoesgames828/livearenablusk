import { Queue, type JobsOptions, type ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';

/** Filas independentes por finalidade (uma fila travada não bloqueia as demais). */
export const QUEUES = {
  ingest: 'events-ingest',
  automation: 'automation',
  maintenance: 'maintenance',
  streamControl: 'stream-control',
  notifications: 'notifications',
  deadLetter: 'dead-letter',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 500 },
  removeOnComplete: { age: 600, count: 5000 },
  removeOnFail: { age: 24 * 3600, count: 10000 },
};

/** Limite de jobs aguardando na ingestão antes de descartar eventos de baixa prioridade. */
export const INGEST_BACKPRESSURE_LIMIT = Number(process.env.INGEST_BACKPRESSURE_LIMIT ?? 20000);
/** Limite absoluto: acima dele até eventos de alta prioridade aguardam (o produtor recebe erro). */
export const INGEST_HARD_LIMIT = Number(process.env.INGEST_HARD_LIMIT ?? 100000);

const queues = new Map<string, Queue>();

export function getQueue(name: QueueName, connection: Redis | ConnectionOptions): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: connection as ConnectionOptions, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queues.set(name, q);
  }
  return q;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
