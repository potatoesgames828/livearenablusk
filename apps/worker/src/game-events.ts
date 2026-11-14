import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { getPrisma, toJson, type PrismaClient } from '@live-arena/database';
import { getQueue, QUEUES } from '@live-arena/runtime';
import type { GameDomainEvent } from '@live-arena/game-engine';
import type { Logger } from '@live-arena/observability';

export interface GameEventsJob {
  tenantId: string;
  sessionId: string;
  gameId: string;
  simulated: boolean;
  events: GameDomainEvent[];
}

interface Agg {
  name: string;
  score: number;
  participations: number;
  wins: number;
}

async function viewerIds(prisma: PrismaClient, tenantId: string, source: string, refs: Map<string, string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const externalIds = [...refs.keys()];
  if (externalIds.length === 0) return out;
  // Upsert em lote: cria ausentes e atualiza "visto por último".
  const existing = await prisma.viewer.findMany({ where: { tenantId, source, externalId: { in: externalIds } }, select: { id: true, externalId: true } });
  for (const v of existing) out.set(v.externalId, v.id);
  const missing = externalIds.filter((id) => !out.has(id));
  if (missing.length) {
    await prisma.viewer.createMany({
      data: missing.map((externalId) => ({ tenantId, source, externalId, nickname: refs.get(externalId) ?? null })),
      skipDuplicates: true,
    });
    const created = await prisma.viewer.findMany({ where: { tenantId, source, externalId: { in: missing } }, select: { id: true, externalId: true } });
    for (const v of created) out.set(v.externalId, v.id);
  }
  await prisma.viewer.updateMany({ where: { tenantId, source, externalId: { in: externalIds } }, data: { lastSeenAt: new Date() } });
  return out;
}

/**
 * Persiste eventos de domínio dos jogos em lote: ranking (por sessão, por jogo
 * e geral), rodadas (GameSession) e dispara automações de fim de rodada.
 */
export function createGameEventsProcessor(deps: { queueRedis: Redis; logger: Logger }) {
  const prisma = getPrisma();
  const automationQueue = getQueue(QUEUES.automation, deps.queueRedis);

  return async function processGameEvents(job: Job<GameEventsJob>): Promise<void> {
    const { tenantId, sessionId, gameId, simulated, events } = job.data;
    const source = simulated ? 'simulator' : 'tiktok';
    const agg = new Map<string, Agg>();
    const names = new Map<string, string>();
    for (const e of events) {
      if (e.type === 'score' || e.type === 'participation') {
        names.set(e.viewer.id, e.viewer.name);
        const a = agg.get(e.viewer.id) ?? { name: e.viewer.name, score: 0, participations: 0, wins: 0 };
        if (e.type === 'score') a.score += e.points;
        else a.participations += 1;
        agg.set(e.viewer.id, a);
      } else if (e.type === 'roundEnd' && e.winner && !e.winner.id.startsWith('bot-')) {
        names.set(e.winner.id, e.winner.name);
        const a = agg.get(e.winner.id) ?? { name: e.winner.name, score: 0, participations: 0, wins: 0 };
        a.wins += 1;
        agg.set(e.winner.id, a);
      }
    }

    if (agg.size) {
      const settings = await prisma.leaderboard.findUnique({ where: { tenantId } });
      const scopes = [`session:${sessionId}`, `game:${gameId}`];
      if (settings?.accumulateAcrossSessions !== false) scopes.push('all');
      const ids = await viewerIds(prisma, tenantId, source, names);
      for (const [externalId, a] of agg) {
        const viewerId = ids.get(externalId);
        if (!viewerId) continue;
        for (const scope of scopes) {
          await prisma.viewerScore.upsert({
            where: { tenantId_viewerId_scope: { tenantId, viewerId, scope } },
            create: { tenantId, viewerId, scope, score: a.score, participations: a.participations, wins: a.wins, best: a.score },
            update: { score: { increment: a.score }, participations: { increment: a.participations }, wins: { increment: a.wins } },
          });
        }
      }
    }

    for (const e of events) {
      if (e.type === 'roundStart') {
        await prisma.gameSession.create({ data: { tenantId, sessionId, gameId, round: e.round } });
      } else if (e.type === 'roundEnd') {
        const open = await prisma.gameSession.findFirst({ where: { tenantId, sessionId, round: e.round, endedAt: null }, orderBy: { startedAt: 'desc' } });
        const data = { endedAt: new Date(), winnerViewerId: e.winner?.id ?? null, winnerName: e.winner?.name ?? null, summary: toJson(e.summary) };
        if (open) await prisma.gameSession.update({ where: { id: open.id }, data });
        else await prisma.gameSession.create({ data: { tenantId, sessionId, gameId, round: e.round, ...data } });
        await automationQueue.add('round-ended', { tenantId, sessionId, trigger: 'ROUND_ENDED' }, { jobId: `round_${sessionId}_${e.round}_${job.id}` });
      }
    }
  };
}
