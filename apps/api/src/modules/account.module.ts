import { Controller, Get, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { ACTIVE_SESSION_STATES, DEFAULT_PLANS, catalogEntry } from '@live-arena/shared';
import { Auth, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Infra } from '../common/infra';
import { PlanService } from '../common/plans';
import { AuthModule } from './auth.module';

const historyQuery = z.object({
  gameId: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

/**
 * Conta e assinatura: plano atual, uso x limites (validados no backend) e
 * histórico de partidas. Não há cobrança integrada: a troca de plano é feita
 * por um administrador até um meio de pagamento ser contratado.
 */
@Controller('account')
export class AccountController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  @Get('usage')
  @RequirePerm('session:read')
  async usage(@Auth() auth: AuthContext) {
    const t = auth.tenantId;
    const p = this.infra.prisma;
    const [plan, sessions, configs, automations, overlays, sounds, alerts, allPlans] = await Promise.all([
      this.plans.limits(t),
      p.liveSession.count({ where: { tenantId: t, state: { in: [...ACTIVE_SESSION_STATES] } } }),
      p.gameConfiguration.count({ where: { tenantId: t } }),
      p.automation.count({ where: { tenantId: t } }),
      p.overlay.count({ where: { tenantId: t, revokedAt: null } }),
      p.soundAsset.count({ where: { tenantId: t } }),
      p.alertRule.count({ where: { tenantId: t } }),
      p.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    const l = plan.limits;
    return {
      plan: { code: plan.code, name: plan.name },
      usage: [
        { key: 'sessions', label: 'LIVES simultâneas', used: sessions, limit: l.maxConcurrentSessions },
        { key: 'configs', label: 'Configurações de jogo', used: configs, limit: l.maxGameConfigs },
        { key: 'automations', label: 'Automações', used: automations, limit: l.maxAutomations },
        { key: 'overlays', label: 'Links de overlay ativos', used: overlays, limit: l.maxOverlays },
        { key: 'sounds', label: 'Sons no soundboard', used: sounds, limit: l.maxSounds },
        { key: 'alerts', label: 'Alertas', used: alerts, limit: l.maxAlerts },
      ],
      features: { streamOutput: l.streamOutput, liveConnector: l.liveConnector, allowedGames: l.allowedGames, maxSessionMinutes: l.maxSessionMinutes, statsRetentionDays: l.statsRetentionDays },
      plans: (allPlans.length ? allPlans : DEFAULT_PLANS.map((d, i) => ({ ...d, sortOrder: i, active: true }))).map((x) => ({ code: x.code, name: x.name, limits: x.limits })),
      billing: { available: false, message: 'Pagamento online ainda não disponível. Para mudar de plano, fale com o suporte.' },
    };
  }

  @Get('history')
  @RequirePerm('session:read')
  async history(@Auth() auth: AuthContext, @Query(new ZodPipe(historyQuery)) q: z.infer<typeof historyQuery>) {
    const where = { tenantId: auth.tenantId, ...(q.gameId ? { gameId: q.gameId } : {}) };
    const [total, rows] = await Promise.all([
      this.infra.prisma.gameSession.count({ where }),
      this.infra.prisma.gameSession.findMany({
        where, orderBy: { startedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { session: { select: { id: true, name: true, demo: true } } },
      }),
    ]);
    return {
      total, page: q.page, pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.id, gameId: r.gameId, gameName: catalogEntry(r.gameId)?.name ?? r.gameId, round: r.round, startedAt: r.startedAt, endedAt: r.endedAt,
        winnerName: r.winnerName, summary: r.summary, session: r.session,
      })),
    };
  }
}

@Module({ imports: [AuthModule], controllers: [AccountController] })
export class AccountModule {}
