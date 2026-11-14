import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { generateOpaqueToken, sha256, signRealtimeTicket } from '@live-arena/security';
import { audit, keys } from '@live-arena/runtime';
import { tenantScope } from '@live-arena/database';
import { Auth, Public, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { PlanService } from '../common/plans';
import { RateLimit } from '../common/rate-limit';
import { env } from '../common/env';
import { AuthModule } from './auth.module';

const createSchema = z.object({
  sessionId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60).default('OBS'),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

/**
 * Overlays: URLs para "Browser Source" (OBS/TikTok LIVE Studio).
 * O token é exibido UMA vez, armazenado apenas como hash, tem escopo de uma
 * única sessão, só permite LEITURA do estado do jogo e pode ser revogado.
 */
@Controller('overlays')
export class OverlaysController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  @Get()
  @RequirePerm('session:read')
  async list(@Auth() auth: AuthContext, @Query('sessionId') sessionId?: string) {
    const items = await this.infra.prisma.overlay.findMany({
      where: tenantScope(auth.tenantId, sessionId ? { sessionId } : {}),
      orderBy: { createdAt: 'desc' },
      select: { id: true, sessionId: true, name: true, tokenPrefix: true, revokedAt: true, expiresAt: true, lastUsedAt: true, createdAt: true },
    });
    return items;
  }

  @Post()
  @RequirePerm('overlay:manage')
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    const s = await this.infra.prisma.liveSession.findFirst({ where: tenantScope(auth.tenantId, { id: body.sessionId }) });
    if (!s) throw Errors.notFound('Sessão não encontrada.');
    await this.plans.assertCount(auth.tenantId, 'maxOverlays', await this.infra.prisma.overlay.count({ where: { tenantId: auth.tenantId, revokedAt: null } }));
    const t = generateOpaqueToken('ovl', 32);
    const o = await this.infra.prisma.overlay.create({
      data: {
        tenantId: auth.tenantId,
        sessionId: s.id,
        name: body.name,
        tokenHash: t.hash,
        tokenPrefix: t.prefix,
        expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86400_000) : null,
      },
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'overlay.create', targetType: 'Overlay', targetId: o.id });
    const url = `${env().PUBLIC_WEB_URL}/overlay/${s.id}?token=${encodeURIComponent(t.token)}`;
    return { id: o.id, name: o.name, token: t.token, url, warning: 'Copie agora: por segurança este link não será exibido novamente.' };
  }

  @Delete(':id')
  @RequirePerm('overlay:manage')
  async revoke(@Auth() auth: AuthContext, @Param('id') id: string) {
    const o = await this.infra.prisma.overlay.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!o) throw Errors.notFound();
    await this.infra.prisma.overlay.update({ where: { id }, data: { revokedAt: new Date() } });
    // Avisa o realtime para derrubar sockets já conectados com esse overlay.
    await this.infra.redis.publish('la:overlay:revoked', JSON.stringify({ overlayId: id, tenantId: auth.tenantId, sessionId: o.sessionId }));
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'overlay.revoke', targetType: 'Overlay', targetId: id });
    return { ok: true };
  }
}

/** Endpoint público usado pela página de overlay. Não expõe dados administrativos. */
@Controller('public/overlay')
export class PublicOverlayController {
  constructor(private readonly infra: Infra) {}

  @Public()
  @Post(':sessionId/bootstrap')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  async bootstrap(@Param('sessionId') sessionId: string, @Body(new ZodPipe(z.object({ token: z.string().min(10).max(200) }))) body: { token: string }) {
    const o = await this.infra.prisma.overlay.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!o || o.sessionId !== sessionId || o.revokedAt || (o.expiresAt && o.expiresAt < new Date())) {
      throw Errors.unauthorized('AUTH_REQUIRED', 'Link de overlay inválido ou revogado.');
    }
    await this.infra.prisma.overlay.update({ where: { id: o.id }, data: { lastUsedAt: new Date() } });
    const last = await this.infra.redis.get(keys.lastState(sessionId));
    // Ticket com escopo restrito: sub "overlay:<id>" só pode assinar esta sessão.
    const ticket = signRealtimeTicket({ sub: `overlay:${o.id}:${sessionId}`, tid: o.tenantId }, 3600);
    return { ticket, realtimeUrl: env().PUBLIC_REALTIME_URL, lastState: last ? (JSON.parse(last) as unknown) : null };
  }
}

@Module({ imports: [AuthModule], controllers: [OverlaysController, PublicOverlayController] })
export class OverlaysModule {}
