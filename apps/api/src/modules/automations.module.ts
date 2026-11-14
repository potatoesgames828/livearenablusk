import { Body, Controller, Delete, Get, Module, Param, Post, Put } from '@nestjs/common';
import { automationInputSchema, type AutomationInput, AUTOMATION_ACTION_LABELS, AUTOMATION_TRIGGER_LABELS } from '@live-arena/automation';
import { audit } from '@live-arena/runtime';
import { tenantScope, toJson } from '@live-arena/database';
import { Auth, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { PlanService } from '../common/plans';
import { AuthModule } from './auth.module';

@Controller('automations')
export class AutomationsController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  @Get('catalog')
  @RequirePerm('session:read')
  catalog() {
    return { triggers: AUTOMATION_TRIGGER_LABELS, actions: AUTOMATION_ACTION_LABELS };
  }

  @Get()
  @RequirePerm('session:read')
  list(@Auth() auth: AuthContext) {
    return this.infra.prisma.automation.findMany({ where: tenantScope(auth.tenantId), include: { rules: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  }

  private async assertRefs(tenantId: string, input: AutomationInput) {
    if (input.sessionId) {
      const s = await this.infra.prisma.liveSession.findFirst({ where: tenantScope(tenantId, { id: input.sessionId }) });
      if (!s) throw Errors.validation(undefined, 'Sessão não encontrada.');
    }
    const ids = input.rules.flatMap((r) => (r.action.kind === 'SWITCH_GAME' ? [r.action.gameConfigId] : r.action.kind === 'ROTATE_GAMES' ? r.action.gameConfigIds : []));
    if (ids.length) {
      const found = await this.infra.prisma.gameConfiguration.count({ where: { tenantId, id: { in: ids } } });
      if (found !== new Set(ids).size) throw Errors.validation(undefined, 'Uma das configurações de jogo não foi encontrada.');
    }
  }

  @Post()
  @RequirePerm('automation:manage')
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(automationInputSchema)) body: AutomationInput) {
    await this.plans.assertCount(auth.tenantId, 'maxAutomations', await this.infra.prisma.automation.count({ where: { tenantId: auth.tenantId } }));
    await this.assertRefs(auth.tenantId, body);
    const a = await this.infra.prisma.automation.create({
      data: {
        tenantId: auth.tenantId,
        name: body.name,
        enabled: body.enabled,
        sessionId: body.sessionId ?? null,
        rules: { create: body.rules.map((r, i) => ({ tenantId: auth.tenantId, trigger: toJson(r.trigger), action: toJson(r.action), position: i })) },
      },
      include: { rules: true },
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'automation.create', targetType: 'Automation', targetId: a.id });
    return a;
  }

  @Put(':id')
  @RequirePerm('automation:manage')
  async update(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(automationInputSchema)) body: AutomationInput) {
    const existing = await this.infra.prisma.automation.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    await this.assertRefs(auth.tenantId, body);
    const a = await this.infra.prisma.$transaction(async (tx) => {
      await tx.automationRule.deleteMany({ where: { automationId: id, tenantId: auth.tenantId } });
      return tx.automation.update({
        where: { id },
        data: {
          name: body.name,
          enabled: body.enabled,
          sessionId: body.sessionId ?? null,
          rules: { create: body.rules.map((r, i) => ({ tenantId: auth.tenantId, trigger: toJson(r.trigger), action: toJson(r.action), position: i })) },
        },
        include: { rules: true },
      });
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'automation.update', targetType: 'Automation', targetId: id });
    return a;
  }

  @Delete(':id')
  @RequirePerm('automation:manage')
  async remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.infra.prisma.automation.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    await this.infra.prisma.automation.delete({ where: { id } });
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [AutomationsController] })
export class AutomationsModule {}
