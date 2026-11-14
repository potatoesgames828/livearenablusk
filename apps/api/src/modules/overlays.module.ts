import { Body, Controller, Delete, Get, Header, HttpCode, Module, Param, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ACTIVE_SESSION_STATES } from '@live-arena/shared';
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
      select: { id: true, sessionId: true, kind: true, name: true, tokenPrefix: true, revokedAt: true, expiresAt: true, lastUsedAt: true, createdAt: true },
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

export const overlaySettingsSchema = z.object({
  showGame: z.boolean().default(true),
  showAlerts: z.boolean().default(true),
  playSounds: z.boolean().default(true),
  volume: z.number().int().min(0).max(100).default(80),
  alertPosition: z.enum(['top', 'center', 'bottom']).default('top'),
  /** Mostra um cartão discreto quando não há LIVE ativa (senão fica transparente). */
  idleCard: z.boolean().default(false),
});
export type OverlaySettings = z.infer<typeof overlaySettingsSchema>;

/**
 * Overlay do usuário: UM link permanente por conta. Ele acompanha a LIVE ativa
 * e troca de jogo sozinho, sem reconfigurar o OBS. O token é mostrado uma vez,
 * fica salvo só como hash e pode ser trocado (o link antigo para de funcionar).
 */
@Controller('overlays/user')
export class UserOverlayController {
  constructor(private readonly infra: Infra) {}

  private find(tenantId: string) {
    return this.infra.prisma.overlay.findFirst({ where: { tenantId, kind: 'USER', revokedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  @Get()
  @RequirePerm('session:read')
  async get(@Auth() auth: AuthContext) {
    const o = await this.find(auth.tenantId);
    if (!o) return { exists: false, settings: overlaySettingsSchema.parse({}) };
    return { exists: true, id: o.id, tokenPrefix: o.tokenPrefix, createdAt: o.createdAt, lastUsedAt: o.lastUsedAt, settings: overlaySettingsSchema.parse(o.settings ?? {}) };
  }

  /** Cria o link (ou gera um novo, revogando o anterior). */
  @Post()
  @RequirePerm('overlay:manage')
  @RateLimit({ limit: 10, windowSec: 60 })
  async rotate(@Auth() auth: AuthContext) {
    const old = await this.find(auth.tenantId);
    const t = generateOpaqueToken('ovl', 32);
    const o = await this.infra.prisma.$transaction(async (tx) => {
      if (old) await tx.overlay.update({ where: { id: old.id }, data: { revokedAt: new Date() } });
      return tx.overlay.create({ data: { tenantId: auth.tenantId, kind: 'USER', name: 'Overlay do criador', tokenHash: t.hash, tokenPrefix: t.prefix, settings: (old?.settings ?? {}) as object } });
    });
    if (old) await this.infra.redis.publish('la:overlay:revoked', JSON.stringify({ overlayId: old.id, tenantId: auth.tenantId }));
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: old ? 'overlay.user.rotate' : 'overlay.user.create', targetType: 'Overlay', targetId: o.id });
    return { id: o.id, token: t.token, url: `${env().PUBLIC_WEB_URL}/overlay/${encodeURIComponent(t.token)}`, warning: 'Copie agora: por segurança este link não será exibido novamente.' };
  }

  @Put('settings')
  @RequirePerm('overlay:manage')
  async settings(@Auth() auth: AuthContext, @Body(new ZodPipe(overlaySettingsSchema)) body: OverlaySettings) {
    const o = await this.find(auth.tenantId);
    if (!o) throw Errors.notFound('Crie o link do overlay primeiro.');
    await this.infra.prisma.overlay.update({ where: { id: o.id }, data: { settings: body } });
    return { ok: true, settings: body };
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

/** Rotas públicas do overlay do usuário (token no corpo/consulta; nada administrativo). */
@Controller('public/overlay-user')
export class PublicUserOverlayController {
  constructor(private readonly infra: Infra) {}

  private async resolve(token: string) {
    const o = await this.infra.prisma.overlay.findUnique({ where: { tokenHash: sha256(token) } });
    if (!o || o.kind !== 'USER' || o.revokedAt || (o.expiresAt && o.expiresAt < new Date())) {
      throw Errors.unauthorized('AUTH_REQUIRED', 'Link de overlay inválido ou revogado.');
    }
    return o;
  }

  /** Descobre a LIVE ativa do criador. Chamado periodicamente pela página. */
  @Public()
  @Post('bootstrap')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  async bootstrap(@Body(new ZodPipe(z.object({ token: z.string().min(10).max(200) }))) body: { token: string }) {
    const o = await this.resolve(body.token);
    await this.infra.prisma.overlay.update({ where: { id: o.id }, data: { lastUsedAt: new Date() } });
    const session = await this.infra.prisma.liveSession.findFirst({
      where: { tenantId: o.tenantId, state: { in: [...ACTIVE_SESSION_STATES] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    const bindings = await this.infra.prisma.soundBinding.findMany({ where: { tenantId: o.tenantId }, select: { slot: true, soundId: true, volume: true } });
    const last = session ? await this.infra.redis.get(keys.lastState(session.id)) : null;
    // Ticket com escopo do tenant; o realtime só aceita sessões deste tenant.
    const ticket = signRealtimeTicket({ sub: `overlay:${o.id}:*`, tid: o.tenantId }, 3600);
    return {
      ticket, realtimeUrl: env().PUBLIC_REALTIME_URL, sessionId: session?.id ?? null,
      lastState: last ? (JSON.parse(last) as unknown) : null,
      settings: overlaySettingsSchema.parse(o.settings ?? {}), soundBindings: bindings,
    };
  }

  @Public()
  @Get('sound/:id')
  @RateLimit({ limit: 120, windowSec: 60 })
  @Header('Cache-Control', 'private, max-age=3600')
  async sound(@Param('id') id: string, @Query('token') token: string | undefined, @Res({ passthrough: true }) res: Response) {
    if (!token || token.length > 200) throw Errors.unauthorized('AUTH_REQUIRED');
    const o = await this.resolve(token);
    const s = await this.infra.prisma.soundAsset.findFirst({ where: { tenantId: o.tenantId, id } });
    if (!s) throw Errors.notFound();
    res.setHeader('Content-Type', s.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(s.data));
  }
}

@Module({ imports: [AuthModule], controllers: [OverlaysController, PublicOverlayController, UserOverlayController, PublicUserOverlayController] })
export class OverlaysModule {}
