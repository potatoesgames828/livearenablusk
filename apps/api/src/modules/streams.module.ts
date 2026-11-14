import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { decryptSecret, encryptSecret, fingerprintSecret, maskSecret } from '@live-arena/security';
import { QUALITY_PROFILES } from '@live-arena/stream-engine';
import { audit, keys, QUEUES } from '@live-arena/runtime';
import { tenantScope, type StreamConfiguration } from '@live-arena/database';
import { ACTIVE_SESSION_STATES, type SessionState } from '@live-arena/shared';
import { Auth, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { PlanService } from '../common/plans';
import { AuthModule } from './auth.module';

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  mode: z.enum(['OBS', 'RTMP', 'RECORD']),
  rtmpUrl: z
    .string()
    .trim()
    .regex(/^rtmps?:\/\/[^\s/]+\/\S*$/i, 'URL RTMP inválida (ex.: rtmps://servidor/app)')
    .max(500)
    .optional(),
  streamKey: z.string().trim().min(4).max(500).optional(),
  width: z.number().int().min(320).max(3840).default(1080),
  height: z.number().int().min(320).max(3840).default(1920),
  fps: z.number().int().refine((v) => [24, 25, 30, 50, 60].includes(v), 'FPS deve ser 24, 25, 30, 50 ou 60').default(30),
  videoBitrateKbps: z.number().int().min(500).max(20000).default(4500),
  audioBitrateKbps: z.number().int().min(64).max(320).default(128),
});

function present(c: StreamConfiguration) {
  let masked: string | null = null;
  if (c.streamKeyEnc) {
    try {
      masked = maskSecret(decryptSecret(c.streamKeyEnc));
    } catch {
      masked = '••••';
    }
  }
  const { streamKeyEnc: _e, streamKeyHash: _h, ...rest } = c;
  return { ...rest, streamKeyMasked: masked };
}

/**
 * Configurações de saída de vídeo. A chave de transmissão é cifrada
 * (AES-256-GCM), nunca retornada em claro e identificada por impressão
 * digital para impedir uso simultâneo da mesma chave.
 */
@Controller('streams')
export class StreamsController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  @Get('profiles')
  @RequirePerm('session:read')
  profiles() {
    return QUALITY_PROFILES;
  }

  @Get()
  @RequirePerm('session:read')
  async list(@Auth() auth: AuthContext) {
    return (await this.infra.prisma.streamConfiguration.findMany({ where: tenantScope(auth.tenantId), orderBy: { createdAt: 'desc' } })).map(present);
  }

  private validateMode(body: Partial<z.infer<typeof schema>>, existing?: StreamConfiguration) {
    if (body.mode === 'RTMP') {
      if (!body.rtmpUrl && !existing?.rtmpUrl) throw Errors.validation(undefined, 'Informe a URL do servidor RTMP fornecida pela plataforma.');
      if (!body.streamKey && !existing?.streamKeyEnc) throw Errors.validation(undefined, 'Informe a chave de transmissão fornecida pela plataforma.');
    }
  }

  @Post()
  @RequirePerm('stream:manage')
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(schema)) body: z.infer<typeof schema>) {
    if (body.mode !== 'OBS') {
      const { limits } = await this.plans.limits(auth.tenantId);
      if (!limits.streamOutput) throw Errors.planLimit('Saída de vídeo gerenciada pelo servidor não está disponível no seu plano. Use o modo OBS.');
    }
    this.validateMode(body);
    const c = await this.infra.prisma.streamConfiguration.create({
      data: {
        tenantId: auth.tenantId,
        name: body.name,
        mode: body.mode,
        rtmpUrl: body.rtmpUrl ?? null,
        streamKeyEnc: body.streamKey ? encryptSecret(body.streamKey) : null,
        streamKeyHash: body.streamKey ? fingerprintSecret(body.streamKey) : null,
        width: body.width,
        height: body.height,
        fps: body.fps,
        videoBitrateKbps: body.videoBitrateKbps,
        audioBitrateKbps: body.audioBitrateKbps,
      },
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'stream_config.create', targetType: 'StreamConfiguration', targetId: c.id, metadata: { mode: body.mode } });
    return present(c);
  }

  @Put(':id')
  @RequirePerm('stream:manage')
  async update(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(schema.partial())) body: Partial<z.infer<typeof schema>>) {
    const existing = await this.infra.prisma.streamConfiguration.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    this.validateMode({ ...body, mode: body.mode ?? existing.mode }, existing);
    const c = await this.infra.prisma.streamConfiguration.update({
      where: { id },
      data: {
        ...body,
        streamKey: undefined,
        streamKeyEnc: body.streamKey ? encryptSecret(body.streamKey) : undefined,
        streamKeyHash: body.streamKey ? fingerprintSecret(body.streamKey) : undefined,
      } as never,
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'stream_config.update', targetType: 'StreamConfiguration', targetId: id });
    return present(c);
  }

  @Delete(':id')
  @RequirePerm('stream:manage')
  async remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    const existing = await this.infra.prisma.streamConfiguration.findFirst({ where: tenantScope(auth.tenantId, { id }) });
    if (!existing) throw Errors.notFound();
    await this.infra.prisma.streamConfiguration.delete({ where: { id } });
    return { ok: true };
  }

  /** Inicia a saída de vídeo gerenciada (renderer + encoder) para uma sessão ativa. */
  @Post('sessions/:sessionId/start')
  @HttpCode(200)
  @RequirePerm('stream:manage')
  async startOutput(@Auth() auth: AuthContext, @Param('sessionId') sessionId: string) {
    const s = await this.infra.prisma.liveSession.findFirst({ where: tenantScope(auth.tenantId, { id: sessionId }), include: { streamConfig: true } });
    if (!s) throw Errors.notFound();
    if (!s.streamConfig) throw Errors.validation(undefined, 'Esta sessão não tem uma saída de vídeo configurada.');
    if (s.streamConfig.mode === 'OBS') throw Errors.validation(undefined, 'No modo OBS a transmissão é iniciada no próprio OBS (use o link de overlay).');
    if (!ACTIVE_SESSION_STATES.has(s.state as SessionState)) throw Errors.conflict('SESSION_INVALID_TRANSITION', 'Inicie a sessão antes de iniciar a transmissão.');
    await this.infra.queue(QUEUES.streamControl).add('start', { tenantId: auth.tenantId, sessionId, action: 'start' }, { jobId: `stream_start_${sessionId}_${Date.now()}` });
    await this.infra.prisma.liveSession.update({ where: { id: sessionId }, data: { streamState: 'STARTING' } });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'stream.start', targetType: 'LiveSession', targetId: sessionId });
    return { ok: true };
  }

  @Post('sessions/:sessionId/stop')
  @HttpCode(200)
  @RequirePerm('stream:manage')
  async stopOutput(@Auth() auth: AuthContext, @Param('sessionId') sessionId: string) {
    const s = await this.infra.prisma.liveSession.findFirst({ where: tenantScope(auth.tenantId, { id: sessionId }) });
    if (!s) throw Errors.notFound();
    await this.infra.queue(QUEUES.streamControl).add('stop', { tenantId: auth.tenantId, sessionId, action: 'stop' }, { jobId: `stream_stop_${sessionId}_${Date.now()}` });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'stream.stop', targetType: 'LiveSession', targetId: sessionId });
    return { ok: true };
  }

  @Get('sessions/:sessionId/status')
  @RequirePerm('session:read')
  async status(@Auth() auth: AuthContext, @Param('sessionId') sessionId: string) {
    const s = await this.infra.prisma.liveSession.findFirst({ where: tenantScope(auth.tenantId, { id: sessionId }), select: { streamState: true } });
    if (!s) throw Errors.notFound();
    const raw = await this.infra.redis.get(keys.streamStats(sessionId));
    const processes = await this.infra.prisma.streamProcess.findMany({ where: { tenantId: auth.tenantId, sessionId }, orderBy: { startedAt: 'desc' }, take: 10 });
    return { state: s.streamState, stats: raw ? (JSON.parse(raw) as unknown) : null, processes };
  }
}

@Module({ imports: [AuthModule], controllers: [StreamsController] })
export class StreamsModule {}
