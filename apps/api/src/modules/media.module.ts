import { createHash } from 'node:crypto';
import { Body, Controller, Delete, Get, Header, HttpCode, Module, Param, Post, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ACTIVE_SESSION_STATES, channels, ruleTriggerSchema, type LiveEvent } from '@live-arena/shared';
import { toAlertFx, type AlertConfig } from '@live-arena/event-engine';
import { audit } from '@live-arena/runtime';
import { tenantScope, toJson } from '@live-arena/database';
import { Auth, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { PlanService } from '../common/plans';
import { RateLimit } from '../common/rate-limit';
import { AuthModule } from './auth.module';

export const MAX_SOUND_BYTES = 1024 * 1024;
export const SOUND_SLOTS = ['game.join', 'game.roundStart', 'game.victory'] as const;

/**
 * Detecta o formato pelo conteúdo (magic bytes), nunca pela extensão ou
 * pelo Content-Type informado pelo cliente.
 */
export function detectAudio(buf: Buffer): 'audio/mpeg' | 'audio/ogg' | 'audio/wav' | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 4).toString('latin1') === 'OggS') return 'audio/ogg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return 'audio/wav';
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') return 'audio/mpeg';
  // quadro MPEG sem cabeçalho ID3: 11 bits de sincronismo + layer III/II
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0 && (buf[1]! & 0x06) !== 0) return 'audio/mpeg';
  return null;
}

const alertSchema = z.object({
  name: z.string().trim().min(1).max(60),
  enabled: z.boolean().default(true),
  trigger: ruleTriggerSchema,
  message: z.string().trim().min(1).max(140),
  emoji: z.string().max(8).default('🎉'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#a855f7'),
  soundId: z.string().max(64).nullable().optional(),
  volume: z.number().int().min(0).max(100).default(80),
  durationMs: z.number().int().min(1000).max(15000).default(4000),
  cooldownMs: z.number().int().min(0).max(600_000).default(0),
});
type AlertInput = z.infer<typeof alertSchema>;

const bindingSchema = z.object({
  slot: z.enum(SOUND_SLOTS),
  soundId: z.string().max(64).nullable(),
  volume: z.number().int().min(0).max(100).default(80),
});

/** Soundboard: upload, listagem, reprodução e associação de sons a momentos dos jogos. */
@Controller()
export class SoundsController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  @Get('sounds')
  @RequirePerm('game:read')
  async list(@Auth() auth: AuthContext) {
    const [items, bindings, plan] = await Promise.all([
      this.infra.prisma.soundAsset.findMany({ where: { tenantId: auth.tenantId }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, mime: true, size: true, createdAt: true } }),
      this.infra.prisma.soundBinding.findMany({ where: { tenantId: auth.tenantId } }),
      this.plans.limits(auth.tenantId),
    ]);
    return { items, bindings, slots: SOUND_SLOTS, limit: plan.limits.maxSounds, maxBytes: MAX_SOUND_BYTES };
  }

  /** Corpo binário (até 1 MB). Nome via query string. */
  @Post('sounds')
  @RequirePerm('game:configure')
  @RateLimit({ limit: 30, windowSec: 60 })
  async upload(@Auth() auth: AuthContext, @Req() req: Request, @Query('name') rawName?: string) {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw Errors.validation(undefined, 'Envie o arquivo de áudio no corpo da requisição.');
    if (body.length > MAX_SOUND_BYTES) throw Errors.validation(undefined, 'Arquivo maior que 1 MB.');
    const mime = detectAudio(body);
    if (!mime) throw Errors.validation(undefined, 'Formato não suportado. Use MP3, OGG ou WAV.');
    const name = (rawName ?? 'Som').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60) || 'Som';
    const count = await this.infra.prisma.soundAsset.count({ where: { tenantId: auth.tenantId } });
    const { limits } = await this.plans.limits(auth.tenantId);
    if (count >= limits.maxSounds) throw Errors.planLimit(`Seu plano permite até ${limits.maxSounds} sons.`);
    const s = await this.infra.prisma.soundAsset.create({
      data: { tenantId: auth.tenantId, name, mime, size: body.length, sha256: createHash('sha256').update(body).digest('hex'), data: new Uint8Array(body) },
      select: { id: true, name: true, mime: true, size: true, createdAt: true },
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'sound.upload', targetType: 'SoundAsset', targetId: s.id });
    return s;
  }

  @Get('sounds/:id/file')
  @RequirePerm('game:read')
  @Header('Cache-Control', 'private, max-age=3600')
  async file(@Auth() auth: AuthContext, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const s = await this.infra.prisma.soundAsset.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!s) throw Errors.notFound();
    res.setHeader('Content-Type', s.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(s.data));
  }

  @Delete('sounds/:id')
  @RequirePerm('game:configure')
  async remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    const s = await this.infra.prisma.soundAsset.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!s) throw Errors.notFound();
    await this.infra.prisma.$transaction([
      this.infra.prisma.soundBinding.deleteMany({ where: { tenantId: auth.tenantId, soundId: id } }),
      this.infra.prisma.alertRule.updateMany({ where: { tenantId: auth.tenantId, soundId: id }, data: { soundId: null } }),
      this.infra.prisma.soundAsset.delete({ where: { id } }),
    ]);
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'sound.delete', targetType: 'SoundAsset', targetId: id });
    return { ok: true };
  }

  @Put('sound-bindings')
  @RequirePerm('game:configure')
  async bind(@Auth() auth: AuthContext, @Body(new ZodPipe(bindingSchema)) body: z.infer<typeof bindingSchema>) {
    if (!body.soundId) {
      await this.infra.prisma.soundBinding.deleteMany({ where: { tenantId: auth.tenantId, slot: body.slot } });
      return { ok: true };
    }
    const s = await this.infra.prisma.soundAsset.findFirst({ where: tenantScope(auth.tenantId, { id: body.soundId }), select: { id: true } });
    if (!s) throw Errors.notFound('Som não encontrado.');
    return this.infra.prisma.soundBinding.upsert({
      where: { tenantId_slot: { tenantId: auth.tenantId, slot: body.slot } },
      create: { tenantId: auth.tenantId, slot: body.slot, soundId: s.id, volume: body.volume },
      update: { soundId: s.id, volume: body.volume },
    });
  }
}

/** Alertas na tela com som opcional. */
@Controller('alerts')
export class AlertsController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  private async assertSound(tenantId: string, soundId?: string | null) {
    if (!soundId) return;
    const s = await this.infra.prisma.soundAsset.findFirst({ where: tenantScope(tenantId, { id: soundId }), select: { id: true } });
    if (!s) throw Errors.validation(undefined, 'Som não encontrado.');
  }

  @Get()
  @RequirePerm('game:read')
  list(@Auth() auth: AuthContext) {
    return this.infra.prisma.alertRule.findMany({ where: { tenantId: auth.tenantId }, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  @RequirePerm('game:configure')
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(alertSchema)) body: AlertInput) {
    const { limits } = await this.plans.limits(auth.tenantId);
    if ((await this.infra.prisma.alertRule.count({ where: { tenantId: auth.tenantId } })) >= limits.maxAlerts) throw Errors.planLimit(`Seu plano permite até ${limits.maxAlerts} alertas.`);
    await this.assertSound(auth.tenantId, body.soundId);
    const a = await this.infra.prisma.alertRule.create({ data: { ...body, trigger: toJson(body.trigger), soundId: body.soundId ?? null, tenantId: auth.tenantId } });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'alert.create', targetType: 'AlertRule', targetId: a.id });
    return a;
  }

  @Put(':id')
  @RequirePerm('game:configure')
  async update(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(alertSchema)) body: AlertInput) {
    const a = await this.infra.prisma.alertRule.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!a) throw Errors.notFound();
    await this.assertSound(auth.tenantId, body.soundId);
    return this.infra.prisma.alertRule.update({ where: { id }, data: { ...body, trigger: toJson(body.trigger), soundId: body.soundId ?? null } });
  }

  @Delete(':id')
  @RequirePerm('game:configure')
  async remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    const r = await this.infra.prisma.alertRule.deleteMany({ where: { tenantId: auth.tenantId, id } });
    if (!r.count) throw Errors.notFound();
    return { ok: true };
  }

  /** Mostra o alerta nas LIVES ativas (marcado como teste/simulado). */
  @Post(':id/test')
  @HttpCode(200)
  @RequirePerm('game:configure')
  @RateLimit({ limit: 20, windowSec: 60 })
  async test(@Auth() auth: AuthContext, @Param('id') id: string) {
    const a = await this.infra.prisma.alertRule.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!a) throw Errors.notFound();
    const sessions = await this.infra.prisma.liveSession.findMany({ where: { tenantId: auth.tenantId, state: { in: [...ACTIVE_SESSION_STATES] } }, select: { id: true }, take: 10 });
    const fake: LiveEvent = {
      eventId: `alert-test-${Date.now()}`, tenantId: auth.tenantId, sessionId: sessions[0]?.id ?? 'none', source: 'manual', type: 'GIFT',
      user: { id: 'teste', nickname: 'Espectador de teste' }, payload: { giftId: 'teste', giftName: 'Rosa', diamondValue: 1, repeatCount: 1, comment: 'olá!', count: 100, viewerCount: 100 },
      timestamp: new Date().toISOString(), simulated: true,
    };
    const cfg: AlertConfig = { ...a, trigger: a.trigger };
    for (const s of sessions) await this.infra.redis.publish(channels.sessionFx(auth.tenantId, s.id), JSON.stringify(toAlertFx(cfg, { ...fake, sessionId: s.id }, 1)));
    return { ok: true, deliveredTo: sessions.length };
  }
}

@Module({ imports: [AuthModule], controllers: [SoundsController, AlertsController] })
export class MediaModule {}
