import type { Redis } from 'ioredis';
import type { RunnerMessage } from '@live-arena/shared';
import { keys } from './keys';

/** Tamanho máximo aproximado do stream de ações por sessão (proteção de memória). */
const ACTIONS_MAXLEN = Number(process.env.ACTIONS_STREAM_MAXLEN ?? 5000);

export async function pushRunnerMessage(redis: Redis, sessionId: string, msg: RunnerMessage): Promise<string> {
  const id = await redis.xadd(keys.actions(sessionId), 'MAXLEN', '~', ACTIONS_MAXLEN, '*', 'm', JSON.stringify(msg));
  return id ?? '';
}

export async function pushRunnerMessages(redis: Redis, sessionId: string, msgs: RunnerMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  const pipe = redis.pipeline();
  for (const m of msgs) pipe.xadd(keys.actions(sessionId), 'MAXLEN', '~', ACTIONS_MAXLEN, '*', 'm', JSON.stringify(m));
  await pipe.exec();
}

export interface StreamEntry {
  id: string;
  msg: RunnerMessage;
}

/** Lê mensagens após `lastId` (leitura simples; o runner guarda o último ID aplicado no checkpoint). */
export async function readRunnerMessages(
  redis: Redis,
  sessionId: string,
  lastId: string,
  count = 200,
  blockMs?: number,
): Promise<StreamEntry[]> {
  const args: (string | number)[] = ['COUNT', count];
  if (blockMs !== undefined) args.push('BLOCK', blockMs);
  args.push('STREAMS', keys.actions(sessionId), lastId);
  const res = (await (redis as unknown as { xread: (...a: (string | number)[]) => Promise<unknown> }).xread(...args)) as
    | Array<[string, Array<[string, string[]]>]>
    | null;
  if (!res) return [];
  const out: StreamEntry[] = [];
  for (const [, entries] of res) {
    for (const [id, fields] of entries) {
      const idx = fields.indexOf('m');
      const raw = idx >= 0 ? fields[idx + 1] : undefined;
      if (!raw) continue;
      try {
        out.push({ id, msg: JSON.parse(raw) as RunnerMessage });
      } catch {
        /* mensagem corrompida é ignorada */
      }
    }
  }
  return out;
}

/** Compara IDs de stream Redis ("ms-seq"). */
export function compareStreamIds(a: string, b: string): number {
  const [am, as] = a.split('-').map(Number);
  const [bm, bs] = b.split('-').map(Number);
  if ((am ?? 0) !== (bm ?? 0)) return (am ?? 0) - (bm ?? 0);
  return (as ?? 0) - (bs ?? 0);
}
