import { Body, Controller, Delete, Get, Module, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { availableProviders } from '@live-arena/tiktok-adapter';
import { encryptSecret } from '@live-arena/security';
import { audit } from '@live-arena/runtime';
import { tenantScope, toJson, type LiveConnection } from '@live-arena/database';
import { Auth, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { PlanService } from '../common/plans';
import { AuthModule } from './auth.module';

const usernameSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@/, ''))
  .pipe(z.string().regex(/^[a-zA-Z0-9._]{2,24}$/, 'Usuário do TikTok inválido'));

const baseSchema = z.object({
  label: z.string().trim().min(1).max(60),
  provider: z.enum(['SIMULATOR', 'TIKTOK_TTLC', 'EULER_STREAM']),
  tiktokUsername: usernameSchema.optional(),
  /** Credenciais do provedor (ex.: API key do serviço gerenciado). Guardadas cifradas. */
  apiKey: z.string().min(8).max(300).optional(),
  /** Para o simulador: gera eventos fictícios automaticamente. */
  demoLoad: z.enum(['off', 'light', 'busy']).optional(),
});

function present(c: LiveConnection) {
  const { credentialsEnc, ...rest } = c;
  return { ...rest, hasCredentials: Boolean(credentialsEnc) };
}

@Controller('connections')
export class ConnectionsController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  @Get('providers')
  @RequirePerm('session:read')
  providers() {
    return availableProviders();
  }

  @Get()
  @RequirePerm('session:read')
  async list(@Auth() auth: AuthContext) {
    const items = await this.infra.prisma.liveConnection.findMany({ where: tenantScope(auth.tenantId), orderBy: { createdAt: 'desc' } });
    return items.map(present);
  }

  @Post()
  @RequirePerm('connection:manage')
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(baseSchema)) body: z.infer<typeof baseSchema>) {
    if (body.provider !== 'SIMULATOR') {
      if (!body.tiktokUsername) throw Errors.validation([{ path: 'tiktokUsername', message: 'Informe o @usuário do TikTok.' }], 'Informe o @usuário do TikTok.');
      const { limits } = await this.plans.limits(auth.tenantId);
      if (!limits.liveConnector) throw Errors.planLimit('Seu plano não inclui conexão com o TikTok.');
    }
    const created = await this.infra.prisma.liveConnection.create({
      data: {
        tenantId: auth.tenantId,
        label: body.label,
        provider: body.provider,
        tiktokUsername: body.tiktokUsername ?? null,
        credentialsEnc: body.apiKey ? encryptSecret(JSON.stringify({ apiKey: body.apiKey })) : null,
        config: toJson({ demoLoad: body.demoLoad ?? (body.provider === 'SIMULATOR' ? 'light' : 'off') }),
      },
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'connection.create', targetType: 'LiveConnection', targetId: created.id, metadata: { provider: body.provider } });
    return present(created);
  }

  @Put(':id')
  @RequirePerm('connection:manage')
  async update(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(baseSchema.partial())) body: Partial<z.infer<typeof baseSchema>>) {
    const existing = await this.infra.prisma.liveConnection.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    const config = { ...((existing.config as Record<string, unknown>) ?? {}), ...(body.demoLoad ? { demoLoad: body.demoLoad } : {}) };
    const updated = await this.infra.prisma.liveConnection.update({
      where: { id },
      data: {
        label: body.label,
        provider: body.provider,
        tiktokUsername: body.tiktokUsername,
        credentialsEnc: body.apiKey ? encryptSecret(JSON.stringify({ apiKey: body.apiKey })) : undefined,
        config: toJson(config),
      },
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'connection.update', targetType: 'LiveConnection', targetId: id });
    return present(updated);
  }

  @Delete(':id')
  @RequirePerm('connection:manage')
  async remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.infra.prisma.liveConnection.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    await this.infra.prisma.liveConnection.delete({ where: { id } });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'connection.delete', targetType: 'LiveConnection', targetId: id });
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [ConnectionsController] })
export class ConnectionsModule {}
