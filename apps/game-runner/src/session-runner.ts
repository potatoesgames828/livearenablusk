import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import { getGameModule } from '@live-arena/games';
import type { GameSimulation, GameDomainEvent } from '@live-arena/game-engine';
import { getPrisma, toJson } from '@live-arena/database';
import {
  getOrRebuildSessionMeta, keys, Lease, raiseAlert, readRunnerMessages, transitionSession, updateSessionStatus,
  compareStreamIds, resolveAlerts, type SessionMeta,
} from '@live-arena/runtime';
import { channels, type RunnerMessage, type RunnerState } from '@live-arena/shared';
import { metrics, type Logger } from '@live-arena/observability';

const TICK_HZ = Number(process.env.RUNNER_TICK_HZ ?? 30);
const PUBLISH_EVERY_TICKS = Number(process.env.RUNNER_PUBLISH_EVERY ?? 2); // 15 Hz
const CHECKPOINT_REDIS_MS = 2000;
const CHECKPOINT_DB_MS = 15_000;
const MAX_MSGS_PER_TICK = 200;

interface Checkpoint {
  gameId: string;
  gameConfigId: string;
  lastStreamId: string;
  sim: unknown;
  seed: number;
  savedAt: number;
}

/**
 * Executa UMA sessão: consome o stream de mensagens, avança a simulação em
 * passo fixo, publica snapshots, grava checkpoints e reporta saúde.
 * Toda falha é contida aqui — nunca derruba as outras sessões do processo.
 */
export class SessionRunner {
  private sim: GameSimulation | null = null;
  private meta: SessionMeta | null = null;
  private lastStreamId = '0-0';
  private timer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private reading = false;
  private lastCheckpointRedis = 0;
  private lastCheckpointDb = 0;
  private lastStatus = 0;
  private lastLastState = 0;
  private pendingEvents: GameDomainEvent[] = [];
  private lastEventsFlush = 0;
  private errors: number[] = [];
  private seed = 1;
  private runnerState: RunnerState = 'LOADING';
  private stopped = false;
  private tickTimes: number[] = [];
  private lastFaultCheck = 0;
  private started = false;

  constructor(
    readonly sessionId: string,
    private readonly redis: Redis,
    private readonly lease: Lease,
    private readonly gameEventsQueue: Queue,
    private readonly logger: Logger,
    private readonly onFinished: (id: string) => void,
  ) {}

  get tenantId(): string | undefined {
    return this.meta?.tenantId;
  }

  async start(): Promise<void> {
    const meta = await getOrRebuildSessionMeta(this.redis, this.sessionId);
    if (!meta) throw new Error('metadados da sessão ausentes');
    this.meta = meta;
    const recovered = await this.loadCheckpoint();
    if (!recovered) this.createSim(meta, Math.floor(Math.random() * 2 ** 31));
    this.lease.keepAlive(() => {
      this.logger.warn({ sessionId: this.sessionId }, 'lease perdido; outro runner assumiu');
      void this.halt(false);
    });
    await this.setRunnerState(recovered ? 'RECOVERING' : 'LOADING', recovered ? 'Estado do jogo recuperado do checkpoint' : undefined);
    if (recovered) {
      metrics.runnerRecoveries.inc({ reason: 'failover' });
      // A sessão já estava rodando: segue de onde parou.
      const s = await getPrisma().liveSession.findUnique({ where: { id: this.sessionId }, select: { state: true } });
      if (s?.state === 'RECOVERING' || s?.state === 'ERROR') {
        await transitionSession(this.redis, { tenantId: meta.tenantId, sessionId: this.sessionId, to: 'RUNNING', reason: 'Recuperada após falha' }).catch(() => undefined);
      }
      this.started = true;
      await this.setRunnerState(s?.state === 'PAUSED' ? 'PAUSED' : 'RUNNING');
      await resolveAlerts('RUNNER_MISSING', 'game-runner', this.sessionId);
    }
    const interval = 1000 / TICK_HZ;
    let next = Date.now() + interval;
    const loop = () => {
      if (this.stopped) return;
      this.tick(interval / 1000);
      next += interval;
      const delay = Math.max(0, next - Date.now());
      if (delay === 0 && Date.now() - next > 1000) next = Date.now() + interval; // atraso grande: ressincroniza
      this.timer = setTimeout(loop, delay);
    };
    this.timer = setTimeout(loop, interval);
  }

  private createSim(meta: SessionMeta, seed: number): void {
    const mod = getGameModule(meta.gameId);
    if (!mod) throw new Error(`jogo desconhecido: ${meta.gameId}`);
    this.seed = seed;
    this.sim = mod.create({ seed, config: meta.config, simulated: meta.demo });
    // Começa parado até receber o comando START (ou já rodando, se recuperado).
    this.sim.control('STOP');
  }

  private async loadCheckpoint(): Promise<boolean> {
    if (!this.meta) return false;
    let cp: Checkpoint | null = null;
    const raw = await this.redis.get(keys.checkpoint(this.sessionId));
    if (raw) cp = JSON.parse(raw) as Checkpoint;
    if (!cp) {
      const db = await getPrisma().sessionCheckpoint.findUnique({ where: { sessionId: this.sessionId } });
      if (db) cp = { ...(db.state as unknown as Omit<Checkpoint, 'lastStreamId'>), lastStreamId: db.lastStreamId ?? '0-0' } as Checkpoint;
    }
    if (!cp || cp.gameConfigId !== this.meta.gameConfigId) return false;
    try {
      this.createSim(this.meta, cp.seed);
      this.sim!.restore(cp.sim);
      this.lastStreamId = cp.lastStreamId;
      this.logger.info({ sessionId: this.sessionId, lastStreamId: cp.lastStreamId }, 'sessão recuperada do checkpoint');
      return true;
    } catch (err) {
      this.logger.error({ err: (err as Error).message, sessionId: this.sessionId }, 'checkpoint inválido; iniciando do zero');
      return false;
    }
  }

  private tick(dt: number): void {
    if (!this.sim || !this.meta) return;
    const t0 = performance.now();
    try {
      this.sim.tick(dt);
      this.tickCount++;
      if (this.tickCount % PUBLISH_EVERY_TICKS === 0) this.publish();
      const ev = this.sim.drainEvents();
      if (ev.length) this.pendingEvents.push(...ev);
    } catch (err) {
      this.onError(err as Error);
    }
    const dur = performance.now() - t0;
    metrics.runnerTickSeconds.observe({ game: this.meta.gameId }, dur / 1000);
    this.tickTimes.push(dur);
    if (this.tickTimes.length > 300) this.tickTimes.shift();
    if (!this.reading) void this.readMessages();
    void this.housekeeping();
  }

  private publish(): void {
    if (!this.sim || !this.meta) return;
    const snap = this.sim.snapshot();
    this.sim.consumeFx();
    const payload = JSON.stringify(snap);
    void this.redis.publish(channels.sessionState(this.meta.tenantId, this.sessionId), payload).catch(() => undefined);
    const now = Date.now();
    if (now - this.lastLastState > 1000) {
      this.lastLastState = now;
      void this.redis.set(keys.lastState(this.sessionId), payload, 'EX', 3600).catch(() => undefined);
    }
  }

  private async readMessages(): Promise<void> {
    this.reading = true;
    try {
      const entries = await readRunnerMessages(this.redis, this.sessionId, this.lastStreamId, MAX_MSGS_PER_TICK);
      for (const { id, msg } of entries) {
        // Idempotência: nunca reaplica mensagens anteriores ao checkpoint.
        if (compareStreamIds(id, this.lastStreamId) <= 0) continue;
        this.lastStreamId = id;
        await this.apply(msg);
        if (this.stopped) return;
      }
    } catch (err) {
      // Redis indisponível: o jogo continua rodando; tentaremos no próximo tick.
      if (!(err as Error).message?.includes('Connection')) this.logger.warn({ err: (err as Error).message }, 'falha ao ler mensagens');
    } finally {
      this.reading = false;
    }
  }

  private async apply(msg: RunnerMessage): Promise<void> {
    if (!this.sim || !this.meta) return;
    try {
      if (msg.kind === 'game') this.sim.applyAction(msg);
      else if (msg.kind === 'signal') this.sim.applySignal(msg);
      else await this.applyControl(msg.command, msg.args);
    } catch (err) {
      this.onError(err as Error);
    }
  }

  private async applyControl(command: string, args?: Record<string, unknown>): Promise<void> {
    const meta = this.meta!;
    switch (command) {
      case 'START':
        this.sim!.control('START');
        if (!this.started) {
          this.started = true;
          await transitionSession(this.redis, { tenantId: meta.tenantId, sessionId: this.sessionId, to: 'RUNNING', reason: 'Jogo em execução' }).catch(() => undefined);
        }
        await this.setRunnerState('RUNNING');
        break;
      case 'PAUSE':
        this.sim!.control('PAUSE');
        await this.setRunnerState('PAUSED');
        break;
      case 'RESUME':
        this.sim!.control('RESUME');
        await this.setRunnerState('RUNNING');
        break;
      case 'STOP':
        await this.halt(true);
        break;
      case 'SWITCH_GAME': {
        const fresh = await getOrRebuildSessionMeta(this.redis, this.sessionId);
        if (!fresh) break;
        const wasPaused = this.runnerState === 'PAUSED';
        this.meta = fresh;
        this.createSim(fresh, Math.floor(Math.random() * 2 ** 31));
        this.sim!.control('START');
        if (wasPaused) this.sim!.control('PAUSE');
        await this.checkpoint(true);
        await updateSessionStatus(this.redis, fresh.tenantId, this.sessionId, { message: args?.reload ? 'Configuração do jogo atualizada' : `Jogo trocado para ${fresh.gameId}` });
        break;
      }
      default:
        this.sim!.control(command as never, args);
    }
  }

  private async housekeeping(): Promise<void> {
    const now = Date.now();
    if (!this.meta) return;
    if (now - this.lastCheckpointRedis > CHECKPOINT_REDIS_MS) {
      this.lastCheckpointRedis = now;
      await this.checkpoint(now - this.lastCheckpointDb > CHECKPOINT_DB_MS);
    }
    if (this.pendingEvents.length && (now - this.lastEventsFlush > 1000 || this.pendingEvents.length > 500)) {
      this.lastEventsFlush = now;
      const events = this.pendingEvents.splice(0, 2000);
      await this.gameEventsQueue
        .add('batch', { tenantId: this.meta.tenantId, sessionId: this.sessionId, gameId: this.meta.gameId, simulated: this.meta.demo, events }, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } })
        .catch(() => {
          // Fila indisponível: devolve os eventos para a próxima tentativa (com limite de memória).
          if (this.pendingEvents.length < 5000) this.pendingEvents.unshift(...events);
        });
    }
    if (now - this.lastStatus > 5000) {
      this.lastStatus = now;
      const avg = this.tickTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.tickTimes.length);
      await updateSessionStatus(this.redis, this.meta.tenantId, this.sessionId, { runnerState: this.runnerState }).catch(() => undefined);
      if (avg > (1000 / TICK_HZ) * 0.6) {
        await raiseAlert({ tenantId: this.meta.tenantId, sessionId: this.sessionId, severity: 'WARNING', component: 'game-runner', code: 'SLOW_TICK', message: `Tick médio de ${avg.toFixed(1)}ms — servidor sobrecarregado.` });
      }
    }
    if (now - this.lastFaultCheck > 1000) {
      this.lastFaultCheck = now;
      await this.checkFault();
    }
  }

  async checkpoint(toDb: boolean): Promise<void> {
    if (!this.sim || !this.meta || this.stopped) return;
    const cp: Checkpoint = {
      gameId: this.meta.gameId,
      gameConfigId: this.meta.gameConfigId,
      lastStreamId: this.lastStreamId,
      sim: this.sim.serialize(),
      seed: this.seed,
      savedAt: Date.now(),
    };
    const raw = JSON.stringify(cp);
    await this.redis.set(keys.checkpoint(this.sessionId), raw, 'EX', 86400).catch(() => undefined);
    if (toDb) {
      this.lastCheckpointDb = Date.now();
      const { lastStreamId, ...state } = cp;
      await getPrisma()
        .sessionCheckpoint.upsert({
          where: { sessionId: this.sessionId },
          create: { sessionId: this.sessionId, tenantId: this.meta.tenantId, gameId: cp.gameId, state: toJson(state), lastStreamId },
          update: { gameId: cp.gameId, state: toJson(state), lastStreamId, version: { increment: 1 } },
        })
        .catch((err: unknown) => this.logger.warn({ err: (err as Error).message }, 'falha ao salvar checkpoint no banco'));
    }
  }

  /** Injeção de falhas (somente sessões de demonstração/teste). */
  private async checkFault(): Promise<void> {
    const raw = await this.redis.get(keys.faultInjection(this.sessionId)).catch(() => null);
    if (!raw) return;
    const f = JSON.parse(raw) as { kind: string; until: number; handled?: boolean };
    if (f.kind !== 'runner-crash' || f.handled) return;
    await this.redis.set(keys.faultInjection(this.sessionId), JSON.stringify({ ...f, handled: true }), 'EX', 60);
    this.logger.warn({ sessionId: this.sessionId }, 'FALHA INJETADA: derrubando o runner da sessão sem salvar estado');
    await raiseAlert({ tenantId: this.meta?.tenantId, sessionId: this.sessionId, severity: 'WARNING', component: 'game-runner', code: 'FAULT_INJECTED', message: 'Falha simulada no processo do jogo (teste de recuperação).' });
    if (this.meta) await transitionSession(this.redis, { tenantId: this.meta.tenantId, sessionId: this.sessionId, to: 'RECOVERING', reason: 'Falha simulada: recuperando' }).catch(() => undefined);
    // "Crash": descarta tudo em memória e libera a posse para failover.
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.lease.release();
    this.onFinished(this.sessionId);
  }

  private onError(err: Error): void {
    const now = Date.now();
    this.errors = this.errors.filter((t) => now - t < 10_000);
    this.errors.push(now);
    metrics.errors.inc({ component: 'game-runner', code: 'sim_error' });
    this.logger.error({ err: err.message, stack: err.stack, sessionId: this.sessionId }, 'erro na simulação');
    if (this.errors.length >= 5) {
      this.errors = [];
      void this.recover(err);
    }
  }

  /** Recuperação local: restaura o último checkpoint bom; se falhar de novo, marca ERRO. */
  private async recover(err: Error): Promise<void> {
    if (!this.meta) return;
    await this.setRunnerState('RECOVERING', 'Erros repetidos no jogo; restaurando último checkpoint');
    const ok = await this.loadCheckpoint();
    if (ok) {
      metrics.runnerRecoveries.inc({ reason: 'sim_errors' });
      this.sim!.control('START');
      await this.setRunnerState('RUNNING');
      return;
    }
    await this.setRunnerState('ERROR', err.message);
    await transitionSession(this.redis, { tenantId: this.meta.tenantId, sessionId: this.sessionId, to: 'ERROR', reason: `Erro no jogo: ${err.message}` }).catch(() => undefined);
    await raiseAlert({ tenantId: this.meta.tenantId, sessionId: this.sessionId, severity: 'CRITICAL', component: 'game-runner', code: 'SIM_CRASH', message: err.message });
  }

  private async setRunnerState(state: RunnerState, message?: string): Promise<void> {
    this.runnerState = state;
    if (this.meta) await updateSessionStatus(this.redis, this.meta.tenantId, this.sessionId, { runnerState: state, message }).catch(() => undefined);
  }

  /** Para a sessão. `graceful` = comando STOP (finaliza e marca STOPPED). */
  async halt(graceful: boolean): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (graceful && this.meta) {
      this.sim?.control('STOP');
      this.publish();
      this.pendingEvents.push(...(this.sim?.drainEvents() ?? []));
      if (this.pendingEvents.length) {
        await this.gameEventsQueue
          .add('batch', { tenantId: this.meta.tenantId, sessionId: this.sessionId, gameId: this.meta.gameId, simulated: this.meta.demo, events: this.pendingEvents.splice(0) })
          .catch(() => undefined);
      }
      await this.setRunnerState('STOPPED');
      await transitionSession(this.redis, { tenantId: this.meta.tenantId, sessionId: this.sessionId, to: 'STOPPED', reason: 'Sessão encerrada' }).catch(() => undefined);
      await getPrisma().liveSession.update({ where: { id: this.sessionId }, data: { connectorState: 'IDLE' } }).catch(() => undefined);
      await this.redis.del(keys.checkpoint(this.sessionId), keys.actions(this.sessionId)).catch(() => undefined);
    }
    await this.lease.release();
    this.onFinished(this.sessionId);
  }

  /** Encerramento do processo (SIGTERM): salva checkpoint e libera posse para outro runner. */
  async handoff(): Promise<void> {
    if (this.stopped) return;
    await this.checkpoint(true);
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.lease.release();
  }

  stats() {
    const avg = this.tickTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.tickTimes.length);
    return { sessionId: this.sessionId, gameId: this.meta?.gameId, state: this.runnerState, avgTickMs: Math.round(avg * 100) / 100 };
  }
}
