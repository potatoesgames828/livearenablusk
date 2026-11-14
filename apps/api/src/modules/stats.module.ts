import { Body, Controller, Get, Module, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ACTIVE_SESSION_STATES } from '@live-arena/shared';
import { audit } from '@live-arena/runtime';
import { tenantScope } from '@live-arena/database';
import { Auth, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Infra } from '../common/infra';
import { AuthModule } from './auth.module';

const leaderboardQuery = z.object({
  scope: z.string().regex(/^(all|game:[a-z0-9-]+|session:[a-z0-9]+)$/).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const settingsSchema = z.object({
  visibility: z.enum(['PUBLIC_NAMES', 'ANONYMIZED', 'HIDDEN']).optional(),
  showAvatars: z.boolean().optional(),
  accumulateAcrossSessions: z.boolean().optional(),
});
const tenantSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  eventRetentionDays: z.number().int().min(1).max(365).optional(),
});

function anonymize(name: string | null | undefined): string {
  const n = name ?? 'Espectador';
  return n.length <= 2 ? `${n[0] ?? '?'}*` : `${n.slice(0, 2)}${'*'.repeat(Math.min(6, n.length - 2))}`;
}

@Controller()
export class StatsController {
  constructor(private readonly infra: Infra) {}

  /** Resumo para o painel "Visão geral". */
  @Get('stats/overview')
  @RequirePerm('stats:read')
  async overview(@Auth() auth: AuthContext) {
    const t = auth.tenantId;
    const since = new Date(Date.now() - 7 * 86400_000);
    const [sessions, active, eventsByType, rounds, viewers, perDay] = await Promise.all([
      this.infra.prisma.liveSession.count({ where: { tenantId: t } }),
      this.infra.prisma.liveSession.count({ where: { tenantId: t, state: { in: [...ACTIVE_SESSION_STATES] } } }),
      this.infra.prisma.liveEvent.groupBy({ by: ['type', 'simulated'], where: { tenantId: t, receivedAt: { gte: since } }, _count: { _all: true } }),
      this.infra.prisma.gameSession.count({ where: { tenantId: t } }),
      this.infra.prisma.viewer.count({ where: { tenantId: t } }),
      this.infra.prisma.$queryRaw<Array<{ day: Date; type: string; simulated: boolean; n: bigint }>>`
        SELECT date_trunc('day', "receivedAt") AS day, type, simulated, count(*)::bigint AS n
        FROM "LiveEvent" WHERE "tenantId" = ${t} AND "receivedAt" >= ${since}
        GROUP BY 1, 2, 3 ORDER BY 1 ASC`,
    ]);
    return {
      sessions,
      activeSessions: active,
      rounds,
      viewers,
      events7d: eventsByType.map((e) => ({ type: e.type, simulated: e.simulated, count: e._count._all })),
      perDay: perDay.map((r) => ({ day: r.day.toISOString().slice(0, 10), type: r.type, simulated: r.simulated, count: Number(r.n) })),
    };
  }

  @Get('leaderboard')
  @RequirePerm('stats:read')
  async leaderboard(@Auth() auth: AuthContext, @Query(new ZodPipe(leaderboardQuery)) q: z.infer<typeof leaderboardQuery>) {
    const settings = await this.infra.prisma.leaderboard.findUnique({ where: { tenantId: auth.tenantId } });
    const rows = await this.infra.prisma.viewerScore.findMany({
      where: { tenantId: auth.tenantId, scope: q.scope },
      orderBy: [{ score: 'desc' }, { updatedAt: 'asc' }],
      take: q.limit,
      include: { viewer: { select: { username: true, nickname: true, avatarUrl: true, source: true } } },
    });
    const vis = settings?.visibility ?? 'PUBLIC_NAMES';
    return {
      settings: settings ?? { visibility: 'PUBLIC_NAMES', showAvatars: false, accumulateAcrossSessions: true },
      items: rows.map((r, i) => ({
        rank: i + 1,
        name: vis === 'ANONYMIZED' ? anonymize(r.viewer.nickname ?? r.viewer.username) : (r.viewer.nickname ?? r.viewer.username ?? 'Espectador'),
        // A dona/o dono da conta vê os nomes no painel; "visibility" controla o que vai para overlays públicos.
        realName: r.viewer.nickname ?? r.viewer.username,
        avatarUrl: settings?.showAvatars ? r.viewer.avatarUrl : null,
        simulated: r.viewer.source === 'simulator',
        score: r.score,
        wins: r.wins,
        participations: r.participations,
        giftsValue: r.giftsValue,
        likes: r.likes,
      })),
    };
  }

  @Put('leaderboard/settings')
  @RequirePerm('tenant:manage')
  async updateSettings(@Auth() auth: AuthContext, @Body(new ZodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    const r = await this.infra.prisma.leaderboard.upsert({ where: { tenantId: auth.tenantId }, create: { tenantId: auth.tenantId, ...body }, update: body });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'leaderboard.settings', metadata: body });
    return r;
  }

  @Get('tenant')
  @RequirePerm('session:read')
  async tenant(@Auth() auth: AuthContext) {
    return this.infra.prisma.tenant.findUnique({ where: { id: auth.tenantId }, include: { plan: true, memberships: { include: { user: { select: { id: true, name: true, email: true } } } } } });
  }

  @Put('tenant')
  @RequirePerm('tenant:manage')
  async updateTenant(@Auth() auth: AuthContext, @Body(new ZodPipe(tenantSchema)) body: z.infer<typeof tenantSchema>) {
    const t = await this.infra.prisma.tenant.update({ where: { id: auth.tenantId }, data: body });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'tenant.update', metadata: body });
    return t;
  }

  @Get('audit')
  @RequirePerm('tenant:manage')
  audit(@Auth() auth: AuthContext) {
    return this.infra.prisma.auditLog.findMany({ where: tenantScope(auth.tenantId), orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Get('alerts')
  @RequirePerm('session:read')
  alerts(@Auth() auth: AuthContext) {
    return this.infra.prisma.systemAlert.findMany({ where: { tenantId: auth.tenantId }, orderBy: { lastSeenAt: 'desc' }, take: 50 });
  }
}

@Module({ imports: [AuthModule], controllers: [StatsController] })
export class StatsModule {}
