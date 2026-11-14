import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { availableActions } from '@live-arena/automation';
import { normalizeEvent, EventValidationError, type RawSourceEvent } from '@live-arena/event-engine';
import { DEMO_GIFTS, DEMO_VIEWERS } from '@live-arena/tiktok-adapter';
import {
  ACTIVE_SESSION_STATES, CONTROL_COMMANDS, LIVE_EVENT_TYPES, isGameAllowed, shortId,
  type GameConfigBody, type LiveEvent, type SessionState,
} from '@live-arena/shared';
import {
  activateSession, audit, deactivateSession, enqueueEvents, keys, QUEUES, readSessionMeta, sendControl,
  transitionSession, TransitionError, writeSessionMeta, IngestOverloadedError,
} from '@live-arena/runtime';
import { tenantScope } from '@live-arena/database';
import { Auth, RequirePerm, type AuthContext } from '../common/auth';
import { ZodPipe } from '../common/http';
import { Errors } from '../common/errors';
import { Infra } from '../common/infra';
import { PlanService } from '../common/plans';
import { RateLimit } from '../common/rate-limit';
import { env } from '../common/env';
import { AuthModule } from './auth.module';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  gameConfigId: z.string().min(1).max(64),
  connectionId: z.string().min(1).max(64).nullable().optional(),
  streamConfigId: z.string().min(1).max(64).nullable().optional(),
  autoMode: z.boolean().optional(),
});
const updateSchema = createSchema.partial();
const controlSchema = z.object({
  command: z.enum(CONTROL_COMMANDS),
  args: z.record(z.unknown()).optional(),
});
const simulateSchema = z.object({
  type: z.enum(['GIFT', 'LIKE', 'CHAT', 'FOLLOW', 'SHARE', 'MEMBER', 'SUBSCRIPTION', 'ROOM_USER']),
  count: z.number().int().min(1).max(5000).default(1),
  username: z.string().trim().max(40).optional(),
  giftId: z.string().max(64).optional(),
  giftName: z.string().max(64).optional(),
  diamondValue: z.number().int().min(0).max(100000).optional(),
  /** Simula uma sequência (streak) de presentes com atualizações intermediárias. */
  streak: z.boolean().optional(),
  comment: z.string().max(200).optional(),
  /** Espalha os eventos ao longo de N ms. */
  spreadMs: z.number().int().min(0).max(60_000).optional(),
});
const scenarioSchema = z.object({ scenario: z.enum(['basic', 'storm', 'connector-drop', 'runner-crash', 'gift-streak']) });
const listEventsSchema = z.object({
  type: z.enum(LIVE_EVENT_TYPES).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly infra: Infra,
    private readonly plans: PlanService,
  ) {}

  private async load(tenantId: string, id: string) {
    const s = await this.infra.prisma.liveSession.findFirst({
      where: tenantScope(tenantId, { id }),
      include: { gameConfig: { select: { id: true, name: true, gameId: true } }, connection: { select: { id: true, label: true, provider: true, tiktokUsername: true, config: true } } },
    });
    if (!s) throw Errors.notFound();
    return s;
  }

  private async decorate<T extends { id: string; state: string }>(s: T) {
    const counters = await this.infra.redis.hgetall(keys.counters(s.id)).catch(() => ({}));
    const stream = await this.infra.redis.get(keys.streamStats(s.id)).catch(() => null);
    return {
      ...s,
      counters: Object.fromEntries(Object.entries(counters).map(([k, v]) => [k, Number(v)])),
      streamStats: stream ? (JSON.parse(stream) as unknown) : null,
      availableActions: availableActions(s.state as SessionState),
    };
  }

  @Get()
  @RequirePerm('session:read')
  async list(@Auth() auth: AuthContext) {
    const items = await this.infra.prisma.liveSession.findMany({
      where: tenantScope(auth.tenantId),
      orderBy: { updatedAt: 'desc' },
      include: { gameConfig: { select: { id: true, name: true, gameId: true } }, connection: { select: { id: true, label: true, provider: true, tiktokUsername: true } } },
      take: 100,
    });
    return Promise.all(items.map((s) => this.decorate(s)));
  }

  @Get(':id')
  @RequirePerm('session:read')
  async get(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.decorate(await this.load(auth.tenantId, id));
  }

  private async assertRefs(tenantId: string, input: { gameConfigId?: string; connectionId?: string | null; streamConfigId?: string | null }) {
    if (input.gameConfigId) {
      const gc = await this.infra.prisma.gameConfiguration.findFirst({ where: tenantScope(tenantId, { id: input.gameConfigId }) });
      if (!gc) throw Errors.validation([{ path: 'gameConfigId', message: 'Configuração de jogo não encontrada.' }], 'Configuração de jogo não encontrada.');
      await this.plans.assertGameAllowed(tenantId, gc.gameId);
    }
    if (input.connectionId) {
      const c = await this.infra.prisma.liveConnection.findFirst({ where: tenantScope(tenantId, { id: input.connectionId }) });
      if (!c) throw Errors.validation([{ path: 'connectionId', message: 'Conexão não encontrada.' }], 'Conexão não encontrada.');
    }
    if (input.streamConfigId) {
      const sc = await this.infra.prisma.streamConfiguration.findFirst({ where: tenantScope(tenantId, { id: input.streamConfigId }) });
      if (!sc) throw Errors.validation([{ path: 'streamConfigId', message: 'Saída de vídeo não encontrada.' }], 'Saída de vídeo não encontrada.');
    }
  }

  @Post()
  @RequirePerm('session:manage')
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    await this.assertRefs(auth.tenantId, body);
    const connection = body.connectionId ? await this.infra.prisma.liveConnection.findUnique({ where: { id: body.connectionId } }) : null;
    const s = await this.infra.prisma.liveSession.create({
      data: {
        tenantId: auth.tenantId,
        name: body.name,
        gameConfigId: body.gameConfigId,
        connectionId: body.connectionId ?? null,
        streamConfigId: body.streamConfigId ?? null,
        autoMode: body.autoMode ?? true,
        demo: !connection || connection.provider === 'SIMULATOR',
        connectorState: connection ? 'IDLE' : 'DISABLED',
        streamState: body.streamConfigId ? 'IDLE' : 'NOT_CONFIGURED',
      },
    });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'session.create', targetType: 'LiveSession', targetId: s.id });
    return this.get(auth, s.id);
  }

  @Put(':id')
  @RequirePerm('session:manage')
  async update(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(updateSchema)) body: z.infer<typeof updateSchema>) {
    const s = await this.load(auth.tenantId, id);
    if (ACTIVE_SESSION_STATES.has(s.state as SessionState) && (body.connectionId !== undefined || body.streamConfigId !== undefined)) {
      throw Errors.conflict('SESSION_INVALID_TRANSITION', 'Encerre a sessão antes de trocar a fonte de eventos ou a saída de vídeo.');
    }
    await this.assertRefs(auth.tenantId, body);
    const connection = body.connectionId ? await this.infra.prisma.liveConnection.findUnique({ where: { id: body.connectionId } }) : undefined;
    await this.infra.prisma.liveSession.update({
      where: { id },
      data: {
        name: body.name,
        autoMode: body.autoMode,
        connectionId: body.connectionId,
        streamConfigId: body.streamConfigId,
        demo: body.connectionId !== undefined ? !connection || connection.provider === 'SIMULATOR' : undefined,
        connectorState: body.connectionId !== undefined ? (body.connectionId ? 'IDLE' : 'DISABLED') : undefined,
        streamState: body.streamConfigId !== undefined ? (body.streamConfigId ? 'IDLE' : 'NOT_CONFIGURED') : undefined,
      },
    });
    if (body.gameConfigId && body.gameConfigId !== s.gameConfigId) await this.switchGame(auth, id, body.gameConfigId);
    return this.get(auth, id);
  }

  @Delete(':id')
  @RequirePerm('session:manage')
  async remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    const s = await this.load(auth.tenantId, id);
    if (ACTIVE_SESSION_STATES.has(s.state as SessionState)) throw Errors.conflict('SESSION_INVALID_TRANSITION', 'Encerre a sessão antes de excluí-la.');
    await this.infra.prisma.liveSession.delete({ where: { id } });
    await this.infra.redis.del(keys.sessionMeta(id), keys.checkpoint(id), keys.lastState(id), keys.counters(id), keys.actions(id));
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'session.delete', targetType: 'LiveSession', targetId: id });
    return { ok: true };
  }

  // ---------------- ciclo de vida ----------------

  private async transition(auth: AuthContext, id: string, to: SessionState, reason: string) {
    try {
      return await transitionSession(this.infra.redis, { tenantId: auth.tenantId, sessionId: id, to, reason, actorId: auth.userId });
    } catch (err) {
      if (err instanceof TransitionError) throw Errors.conflict('SESSION_INVALID_TRANSITION', undefined, { from: err.from, to: err.to });
      throw err;
    }
  }

  @Post(':id/start')
  @HttpCode(200)
  @RequirePerm('session:control')
  @RateLimit({ limit: 20, windowSec: 60, by: 'user' })
  async start(@Auth() auth: AuthContext, @Param('id') id: string) {
    const s = await this.load(auth.tenantId, id);
    const limits = await this.plans.assertCanStartSession(auth.tenantId);
    if (!isGameAllowed(limits, s.gameConfig.gameId)) throw Errors.planLimit('Este jogo não está disponível no seu plano.');
    // Impede duas sessões simultâneas usando a mesma fonte de eventos.
    if (s.connectionId) {
      const clash = await this.infra.prisma.liveSession.findFirst({
        where: { tenantId: auth.tenantId, connectionId: s.connectionId, id: { not: id }, state: { in: [...ACTIVE_SESSION_STATES] } },
      });
      if (clash) throw Errors.conflict('SESSION_ALREADY_ACTIVE', undefined, { sessionId: clash.id });
    }
    await this.transition(auth, id, 'STARTING', 'Iniciada pelo painel');
    // Nova execução: zera contadores, fila de ações e checkpoint da execução anterior.
    await this.infra.redis.del(keys.counters(id), keys.actions(id), keys.checkpoint(id), keys.faultInjection(id));
    await this.infra.prisma.sessionCheckpoint.deleteMany({ where: { sessionId: id, tenantId: auth.tenantId } });
    const withConnector = !!s.connection && (s.connection.provider !== 'SIMULATOR' || (s.connection.config as { demoLoad?: string })?.demoLoad !== 'off');
    await activateSession(this.infra.redis, id, withConnector);
    await sendControl(this.infra.redis, id, 'START', undefined, auth.userId);
    await this.infra.prisma.liveSession.update({ where: { id }, data: { runnerState: 'LOADING', connectorState: withConnector ? 'CONNECTING' : s.connectionId ? 'IDLE' : 'DISABLED' } });
    await this.infra.queue(QUEUES.automation).add('session-started', { tenantId: auth.tenantId, sessionId: id, trigger: 'SESSION_STARTED' }, { jobId: `started_${id}_${Date.now()}` });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'session.start', targetType: 'LiveSession', targetId: id });
    return this.get(auth, id);
  }

  @Post(':id/pause')
  @HttpCode(200)
  @RequirePerm('session:control')
  async pause(@Auth() auth: AuthContext, @Param('id') id: string) {
    await this.load(auth.tenantId, id);
    await this.transition(auth, id, 'PAUSED', 'Pausada pelo painel');
    await sendControl(this.infra.redis, id, 'PAUSE', undefined, auth.userId);
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'session.pause', targetType: 'LiveSession', targetId: id });
    return this.get(auth, id);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @RequirePerm('session:control')
  async resume(@Auth() auth: AuthContext, @Param('id') id: string) {
    await this.load(auth.tenantId, id);
    await this.transition(auth, id, 'RUNNING', 'Retomada pelo painel');
    await sendControl(this.infra.redis, id, 'RESUME', undefined, auth.userId);
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'session.resume', targetType: 'LiveSession', targetId: id });
    return this.get(auth, id);
  }

  @Post(':id/stop')
  @HttpCode(200)
  @RequirePerm('session:control')
  async stop(@Auth() auth: AuthContext, @Param('id') id: string) {
    await this.load(auth.tenantId, id);
    await this.transition(auth, id, 'STOPPING', 'Encerrada pelo painel');
    await sendControl(this.infra.redis, id, 'STOP', undefined, auth.userId);
    await deactivateSession(this.infra.redis, id);
    await this.infra.queue(QUEUES.streamControl).add('stop', { tenantId: auth.tenantId, sessionId: id, action: 'stop' }, { jobId: `stream_stop_${id}_${Date.now()}` });
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'session.stop', targetType: 'LiveSession', targetId: id });
    return this.get(auth, id);
  }

  /** Comandos de jogo: reiniciar rodada, zerar pontuação, anunciar, trocar jogo. */
  @Post(':id/control')
  @HttpCode(200)
  @RequirePerm('session:control')
  @RateLimit({ limit: 60, windowSec: 60, by: 'user' })
  async control(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(controlSchema)) body: z.infer<typeof controlSchema>) {
    const s = await this.load(auth.tenantId, id);
    if (['START', 'PAUSE', 'RESUME', 'STOP'].includes(body.command)) {
      throw Errors.validation(undefined, 'Use os botões de iniciar, pausar, retomar ou encerrar.');
    }
    if (body.command === 'SWITCH_GAME') {
      const target = String(body.args?.gameConfigId ?? '');
      await this.switchGame(auth, id, target);
      return this.get(auth, id);
    }
    if (!ACTIVE_SESSION_STATES.has(s.state as SessionState)) throw Errors.conflict('SESSION_INVALID_TRANSITION', 'A sessão precisa estar em execução.');
    const args = body.command === 'ANNOUNCE' ? { text: String(body.args?.text ?? '').slice(0, 120) } : undefined;
    await sendControl(this.infra.redis, id, body.command, args, auth.userId);
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: `session.control.${body.command.toLowerCase()}`, targetType: 'LiveSession', targetId: id });
    return { ok: true };
  }

  private async switchGame(auth: AuthContext, id: string, gameConfigId: string) {
    const gc = await this.infra.prisma.gameConfiguration.findFirst({ where: tenantScope(auth.tenantId, { id: gameConfigId }) });
    if (!gc) throw Errors.validation(undefined, 'Configuração de jogo não encontrada.');
    await this.plans.assertGameAllowed(auth.tenantId, gc.gameId);
    await this.infra.prisma.liveSession.update({ where: { id }, data: { gameConfigId } });
    const meta = await readSessionMeta(this.infra.redis, id);
    if (meta) {
      await writeSessionMeta(this.infra.redis, { ...meta, gameId: gc.gameId, gameConfigId: gc.id, config: gc.body as unknown as GameConfigBody, version: Date.now() });
      await sendControl(this.infra.redis, id, 'SWITCH_GAME', { gameConfigId: gc.id }, auth.userId);
    }
    await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'session.switch_game', targetType: 'LiveSession', targetId: id, metadata: { gameConfigId } });
  }

  @Get(':id/transitions')
  @RequirePerm('session:read')
  async transitions(@Auth() auth: AuthContext, @Param('id') id: string) {
    await this.load(auth.tenantId, id);
    return this.infra.prisma.sessionTransition.findMany({ where: { tenantId: auth.tenantId, sessionId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Get(':id/rounds')
  @RequirePerm('session:read')
  async rounds(@Auth() auth: AuthContext, @Param('id') id: string) {
    await this.load(auth.tenantId, id);
    return this.infra.prisma.gameSession.findMany({ where: { tenantId: auth.tenantId, sessionId: id }, orderBy: { startedAt: 'desc' }, take: 50 });
  }

  @Get(':id/events')
  @RequirePerm('event:read')
  async events(@Auth() auth: AuthContext, @Param('id') id: string, @Query(new ZodPipe(listEventsSchema)) q: z.infer<typeof listEventsSchema>) {
    await this.load(auth.tenantId, id);
    const items = await this.infra.prisma.liveEvent.findMany({
      where: { tenantId: auth.tenantId, sessionId: id, type: q.type },
      orderBy: { receivedAt: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > q.limit;
    return { items: items.slice(0, q.limit), nextCursor: hasMore ? items[q.limit - 1]?.id : null };
  }

  // ---------------- simulador ----------------

  private async assertSimulatable(auth: AuthContext, id: string) {
    const s = await this.load(auth.tenantId, id);
    if (!ACTIVE_SESSION_STATES.has(s.state as SessionState)) throw Errors.conflict('SESSION_INVALID_TRANSITION', 'Inicie a sessão para usar o simulador.');
    return s;
  }

  private buildSimEvents(auth: AuthContext, sessionId: string, body: z.infer<typeof simulateSchema>): LiveEvent[] {
    const out: LiveEvent[] = [];
    const run = shortId(8);
    const pickUser = (i: number) => {
      const name = body.username?.replace(/^@/, '') || DEMO_VIEWERS[(i * 7 + run.charCodeAt(0)) % DEMO_VIEWERS.length]!;
      return { id: `sim-${name}`, username: name, nickname: name };
    };
    const push = (raw: Omit<RawSourceEvent, 'source' | 'simulated'>) => {
      out.push(normalizeEvent(auth.tenantId, sessionId, { ...raw, source: 'simulator', simulated: true }));
    };
    const gift = DEMO_GIFTS.find((g) => g.giftId === body.giftId) ?? { giftId: body.giftId ?? '5655', giftName: body.giftName ?? 'Rose', diamondValue: body.diamondValue ?? 1 };
    if (body.type === 'GIFT' && body.streak) {
      const user = pickUser(0);
      const group = shortId(6);
      for (let n = 1; n <= body.count; n++) {
        push({ sourceEventId: `${run}-${n}`, type: 'GIFT', user, payload: { ...gift, diamondValue: body.diamondValue ?? gift.diamondValue, repeatCount: n, repeatEnd: false, streakable: true, groupId: group } });
      }
      push({ sourceEventId: `${run}-end`, type: 'GIFT', user, payload: { ...gift, diamondValue: body.diamondValue ?? gift.diamondValue, repeatCount: body.count, repeatEnd: true, streakable: true, groupId: group } });
      return out;
    }
    if (body.type === 'LIKE') {
      // Curtidas chegam agregadas em lotes (como o conector faz), nunca uma tarefa por curtida.
      const batches = Math.min(20, Math.max(1, Math.ceil(body.count / 100)));
      const per = Math.floor(body.count / batches);
      for (let b = 0; b < batches; b++) {
        const count = b === batches - 1 ? body.count - per * (batches - 1) : per;
        const u = pickUser(b);
        push({ sourceEventId: `${run}-l${b}`, type: 'LIKE', user: u, payload: { count, aggregated: true, contributors: [{ id: u.id, username: u.username, count }] } });
      }
      return out;
    }
    const n = Math.min(body.count, 500);
    for (let i = 0; i < n; i++) {
      const user = pickUser(i);
      switch (body.type) {
        case 'GIFT':
          push({ sourceEventId: `${run}-${i}`, type: 'GIFT', user, payload: { ...gift, diamondValue: body.diamondValue ?? gift.diamondValue, repeatCount: 1, repeatEnd: true, streakable: false } });
          break;
        case 'CHAT':
          push({ sourceEventId: `${run}-${i}`, type: 'CHAT', user, payload: { comment: body.comment ?? '!join' } });
          break;
        case 'ROOM_USER':
          push({ sourceEventId: `${run}-${i}`, type: 'ROOM_USER', payload: { viewerCount: 100 + i } });
          break;
        default:
          push({ sourceEventId: `${run}-${i}`, type: body.type, user, payload: {} });
      }
    }
    return out;
  }

  @Post(':id/simulate')
  @HttpCode(200)
  @RequirePerm('event:simulate')
  @RateLimit({ limit: 120, windowSec: 60, by: 'user' })
  async simulate(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(simulateSchema)) body: z.infer<typeof simulateSchema>) {
    await this.assertSimulatable(auth, id);
    let events: LiveEvent[];
    try {
      events = this.buildSimEvents(auth, id, body);
    } catch (err) {
      if (err instanceof EventValidationError) throw Errors.validation(undefined, err.message);
      throw err;
    }
    try {
      const spread = body.spreadMs ?? 0;
      const r = await enqueueEvents(this.infra.queue(QUEUES.ingest), events, spread ? { delayMs: (i) => Math.floor((i / events.length) * spread) } : {});
      return { ...r, simulated: true };
    } catch (err) {
      if (err instanceof IngestOverloadedError) throw Errors.rateLimited('O sistema está processando muitos eventos agora. Tente em instantes.');
      throw err;
    }
  }

  /** Cenários predefinidos de simulação, incluindo falhas controladas. */
  @Post(':id/scenario')
  @HttpCode(200)
  @RequirePerm('event:simulate')
  @RateLimit({ limit: 10, windowSec: 60, by: 'user' })
  async scenario(@Auth() auth: AuthContext, @Param('id') id: string, @Body(new ZodPipe(scenarioSchema)) body: z.infer<typeof scenarioSchema>) {
    const s = await this.assertSimulatable(auth, id);
    const q = this.infra.queue(QUEUES.ingest);
    const sim = (b: Partial<z.infer<typeof simulateSchema>> & { type: z.infer<typeof simulateSchema>['type'] }) =>
      this.buildSimEvents(auth, id, simulateSchema.parse(b));
    const fault = async (kind: string, seconds: number) => {
      if (!s.demo && env().FAULT_INJECTION_ENABLED !== 'true') throw Errors.forbidden('Injeção de falhas disponível apenas em sessões de demonstração.');
      await this.infra.redis.set(keys.faultInjection(id), JSON.stringify({ kind, until: Date.now() + seconds * 1000 }), 'EX', seconds + 30);
      await audit({ tenantId: auth.tenantId, actorId: auth.userId, action: 'session.fault_injection', targetType: 'LiveSession', targetId: id, metadata: { kind } });
    };
    switch (body.scenario) {
      case 'basic': {
        const ev = [...sim({ type: 'LIKE', count: 500 }), ...sim({ type: 'GIFT', count: 5 }), ...sim({ type: 'CHAT', count: 3, comment: '!join' }), ...sim({ type: 'MEMBER', count: 10 })];
        return { scenario: body.scenario, ...(await enqueueEvents(q, ev, { delayMs: (i) => i * 120 })) };
      }
      case 'storm': {
        const ev = [...sim({ type: 'LIKE', count: 1000 }), ...sim({ type: 'GIFT', count: 20 }), ...sim({ type: 'CHAT', count: 50, comment: '!join' })];
        return { scenario: body.scenario, ...(await enqueueEvents(q, ev, { delayMs: (i) => Math.floor((i / ev.length) * 3000) })) };
      }
      case 'gift-streak': {
        const ev = sim({ type: 'GIFT', count: 10, streak: true, giftId: '5655' });
        return { scenario: body.scenario, ...(await enqueueEvents(q, ev, { delayMs: (i) => i * 200 })) };
      }
      case 'connector-drop':
        await fault('connector-drop', 8);
        return { scenario: body.scenario, message: 'A fonte de eventos será desconectada e deve reconectar automaticamente em alguns segundos.' };
      case 'runner-crash':
        await fault('runner-crash', 5);
        return { scenario: body.scenario, message: 'O processo do jogo será derrubado; o estado deve ser recuperado do último checkpoint.' };
    }
  }
}

@Module({ imports: [AuthModule], controllers: [SessionsController] })
export class SessionsModule {}
