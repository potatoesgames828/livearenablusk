import { Body, Controller, Get, HttpCode, Module, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { planLimitsSchema, ACTIVE_SESSION_STATES } from '@live-arena/shared';
import { audit, listLiveServices, QUEUES } from '@live-arena/runtime';
import { toJson } from '@live-arena/database';
import { Auth, ClientIp, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { AuthModule } from './auth.module';

const pageSchema = z.object({ q: z.string().max(100).optional(), take: z.coerce.number().int().min(1).max(200).default(50) });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().max(300).optional() });
const planSchema = z.object({ name: z.string().min(1).max(60).optional(), limits: planLimitsSchema.optional(), active: z.boolean().optional() });
const tenantPlanSchema = z.object({ planCode: z.string().min(1).max(32) });

/**
 * Administração da plataforma. Acesso apenas para perfis OPERATOR/ADMIN
 * (RBAC de plataforma) e, se ADMIN_MFA_REQUIRED=true, com MFA verificado.
 * Toda ação que altera dados é registrada na auditoria.
 */
@Controller('admin')
export class AdminController {
  constructor(private readonly infra: Infra) {}

  @Get('overview')
  @RequirePerm('admin:read')
  async overview() {
    const [users, tenants, activeSessions, openAlerts, services] = await Promise.all([
      this.infra.prisma.user.count(),
      this.infra.prisma.tenant.count(),
      this.infra.prisma.liveSession.count({ where: { state: { in: [...ACTIVE_SESSION_STATES] } } }),
      this.infra.prisma.systemAlert.count({ where: { resolvedAt: null } }),
      listLiveServices(this.infra.redis).catch(() => []),
    ]);
    const queues = await Promise.all(
      Object.values(QUEUES).map(async (name) => ({ name, counts: await this.infra.queue(name).getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized').catch(() => ({})) })),
    );
    return { users, tenants, activeSessions, openAlerts, services, queues };
  }

  @Get('users')
  @RequirePerm('admin:read')
  users(@Query(new ZodPipe(pageSchema)) q: z.infer<typeof pageSchema>) {
    return this.infra.prisma.user.findMany({
      where: q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {},
      select: { id: true, email: true, name: true, platformRole: true, status: true, mfaEnabled: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: q.take,
    });
  }

  @Put('users/:id/status')
  @RequirePerm('admin:users')
  async setUserStatus(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(statusSchema)) body: z.infer<typeof statusSchema>, @ClientIp() ip: string) {
    if (id === auth.userId) throw Errors.validation(undefined, 'Você não pode alterar o status da própria conta.');
    const u = await this.infra.prisma.user.update({ where: { id }, data: { status: body.status } }).catch(() => null);
    if (!u) throw Errors.notFound();
    if (body.status === 'SUSPENDED') await this.infra.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ actorId: auth.userId, action: 'admin.user_status', targetType: 'User', targetId: id, metadata: body, ip });
    return { ok: true };
  }

  @Get('tenants')
  @RequirePerm('admin:read')
  tenants(@Query(new ZodPipe(pageSchema)) q: z.infer<typeof pageSchema>) {
    return this.infra.prisma.tenant.findMany({
      where: q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {},
      include: { _count: { select: { sessions: true, memberships: true } } },
      orderBy: { createdAt: 'desc' },
      take: q.take,
    });
  }

  @Put('tenants/:id/status')
  @RequirePerm('admin:users')
  async setTenantStatus(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(statusSchema)) body: z.infer<typeof statusSchema>, @ClientIp() ip: string) {
    const t = await this.infra.prisma.tenant.update({ where: { id }, data: { status: body.status } }).catch(() => null);
    if (!t) throw Errors.notFound();
    await audit({ actorId: auth.userId, action: 'admin.tenant_status', targetType: 'Tenant', targetId: id, metadata: body, ip });
    return { ok: true };
  }

  @Put('tenants/:id/plan')
  @RequirePerm('admin:plans')
  async setTenantPlan(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(tenantPlanSchema)) body: z.infer<typeof tenantPlanSchema>, @ClientIp() ip: string) {
    const plan = await this.infra.prisma.subscriptionPlan.findUnique({ where: { code: body.planCode } });
    if (!plan) throw Errors.validation(undefined, 'Plano inexistente.');
    await this.infra.prisma.tenant.update({ where: { id }, data: { planCode: plan.code } });
    await audit({ actorId: auth.userId, action: 'admin.tenant_plan', targetType: 'Tenant', targetId: id, metadata: body, ip });
    return { ok: true };
  }

  @Get('sessions')
  @RequirePerm('admin:read')
  sessions() {
    return this.infra.prisma.liveSession.findMany({
      where: { state: { in: [...ACTIVE_SESSION_STATES, 'ERROR'] } },
      select: { id: true, tenantId: true, name: true, state: true, connectorState: true, runnerState: true, streamState: true, demo: true, lastError: true, startedAt: true, lastHeartbeatAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  @Get('services')
  @RequirePerm('admin:read')
  async services() {
    const live = await listLiveServices(this.infra.redis).catch(() => []);
    const history = await this.infra.prisma.worker.findMany({ orderBy: { lastHeartbeatAt: 'desc' }, take: 100 });
    return { live, history };
  }

  @Get('alerts')
  @RequirePerm('admin:read')
  alerts(@Query('open') open?: string) {
    return this.infra.prisma.systemAlert.findMany({ where: open === 'true' ? { resolvedAt: null } : {}, orderBy: { lastSeenAt: 'desc' }, take: 200 });
  }

  @Post('alerts/:id/resolve')
  @HttpCode(200)
  @RequirePerm('admin:alerts')
  async resolve(@Auth() auth: AuthContext, @Param('id') id: string) {
    await this.infra.prisma.systemAlert.update({ where: { id }, data: { resolvedAt: new Date() } }).catch(() => {
      throw Errors.notFound();
    });
    await audit({ actorId: auth.userId, action: 'admin.alert_resolve', targetType: 'SystemAlert', targetId: id });
    return { ok: true };
  }

  @Get('audit')
  @RequirePerm('admin:read')
  audit(@Query(new ZodPipe(pageSchema)) q: z.infer<typeof pageSchema>) {
    return this.infra.prisma.auditLog.findMany({
      where: q.q ? { action: { contains: q.q } } : {},
      orderBy: { createdAt: 'desc' },
      take: q.take,
      include: { actor: { select: { email: true } } },
    });
  }

  @Get('plans')
  @RequirePerm('admin:read')
  plans() {
    return this.infra.prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @Put('plans/:code')
  @RequirePerm('admin:plans')
  async updatePlan(@Auth() auth: AuthContext, @Param('code') code: string, @Body(new ZodPipe(planSchema)) body: z.infer<typeof planSchema>, @ClientIp() ip: string) {
    const p = await this.infra.prisma.subscriptionPlan
      .update({ where: { code }, data: { name: body.name, active: body.active, limits: body.limits ? toJson(body.limits) : undefined } })
      .catch(() => null);
    if (!p) throw Errors.notFound();
    await audit({ actorId: auth.userId, action: 'admin.plan_update', targetType: 'SubscriptionPlan', targetId: code, metadata: body, ip });
    return p;
  }
}

@Module({ imports: [AuthModule], controllers: [AdminController] })
export class AdminModule {}
