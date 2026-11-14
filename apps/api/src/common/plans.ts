import { Injectable } from '@nestjs/common';
import { ACTIVE_SESSION_STATES, DEFAULT_PLANS, isGameAllowed, planLimitsSchema, type PlanLimits } from '@live-arena/shared';
import { Infra } from './infra';
import { Errors } from './errors';

/** Limites do plano SEMPRE verificados no backend. */
@Injectable()
export class PlanService {
  constructor(private readonly infra: Infra) {}

  async limits(tenantId: string): Promise<{ code: string; name: string; limits: PlanLimits }> {
    const t = await this.infra.prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    if (!t) throw Errors.notFound();
    const parsed = planLimitsSchema.safeParse(t.plan.limits);
    const fallback = planLimitsSchema.parse(DEFAULT_PLANS.find((p) => p.code === 'free')!.limits);
    return { code: t.plan.code, name: t.plan.name, limits: parsed.success ? parsed.data : fallback };
  }

  async assertGameAllowed(tenantId: string, gameId: string): Promise<void> {
    const { limits } = await this.limits(tenantId);
    if (!isGameAllowed(limits, gameId)) throw Errors.planLimit('Este jogo não está disponível no seu plano.');
  }

  async assertCanStartSession(tenantId: string): Promise<PlanLimits> {
    const { limits } = await this.limits(tenantId);
    const active = await this.infra.prisma.liveSession.count({ where: { tenantId, state: { in: [...ACTIVE_SESSION_STATES] } } });
    if (active >= limits.maxConcurrentSessions) {
      throw Errors.planLimit(`Seu plano permite ${limits.maxConcurrentSessions} sessão(ões) ativa(s) ao mesmo tempo.`);
    }
    return limits;
  }

  async assertCount(tenantId: string, key: 'maxGameConfigs' | 'maxAutomations' | 'maxOverlays', current: number): Promise<void> {
    const { limits } = await this.limits(tenantId);
    if (current >= limits[key]) throw Errors.planLimit('Você atingiu o limite do seu plano para este recurso.');
  }
}
