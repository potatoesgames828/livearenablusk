import type { ControlCommand, GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { Rng } from './rng';
import type {
  Aspect,
  BaseSnapshot,
  FxMarker,
  GameDomainEvent,
  GameManifest,
  GameSimulation,
  LeaderEntry,
  Notice,
  SimContext,
  ViewerRef,
} from './types';

export interface ViewerStats extends ViewerRef {
  score: number;
  roundScore: number;
  lastSeen: number;
}

interface BaseState {
  t: number;
  round: number;
  phase: BaseSnapshot['phase'];
  prePausePhase: BaseSnapshot['phase'];
  phaseTimer: number;
  viewers: Record<string, ViewerStats>;
  notices: Notice[];
  seq: number;
  rng: number;
}

export const WORLD = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
} as const;

export function viewerName(v?: { username?: string; nickname?: string; id?: string }): string {
  return (v?.nickname || v?.username || 'Espectador').slice(0, 24);
}

const MAX_VIEWERS_TRACKED = 2000;

/**
 * Base comum dos jogos: rodadas, pausa, ranking, avisos, efeitos e
 * serialização. Cada jogo implementa apenas sua lógica específica.
 */
export abstract class BaseGame<S extends BaseSnapshot, St extends object> implements GameSimulation<S> {
  protected rng: Rng;
  protected b: BaseState;
  protected abstract st: St;
  protected readonly aspect: Aspect;
  protected readonly W: number;
  protected readonly H: number;
  private fx: FxMarker[] = [];
  private events: GameDomainEvent[] = [];

  constructor(
    readonly manifest: GameManifest,
    protected readonly ctx: SimContext,
  ) {
    this.rng = new Rng(ctx.seed);
    this.aspect = ctx.config.aspect ?? 'vertical';
    this.W = WORLD[this.aspect].width;
    this.H = WORLD[this.aspect].height;
    this.b = {
      t: 0,
      round: 1,
      phase: 'playing',
      prePausePhase: 'playing',
      phaseTimer: 0,
      viewers: {},
      notices: [],
      seq: 1,
      rng: this.rng.state,
    };
  }

  // ---------- utilidades para subclasses ----------

  protected setting<T extends number | boolean | string>(key: string): T {
    const v = this.ctx.config.settings?.[key];
    if (v !== undefined) return v as T;
    const def = this.manifest.settings.find((s) => s.key === key);
    return def?.default as T;
  }

  protected num(key: string): number {
    return Number(this.setting<number>(key));
  }

  protected param(action: GameActionMessage, key: string, fallback: number): number {
    const v = action.params?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const def = this.manifest.actions.find((a) => a.id === action.actionId)?.params.find((p) => p.key === key);
    return typeof def?.default === 'number' ? def.default : fallback;
  }

  protected nextId(): number {
    return this.b.seq++;
  }

  protected notice(text: string, color = '#93c5fd', seconds = 4): void {
    this.b.notices.push({ id: this.nextId(), text: text.slice(0, 80), color, until: this.b.t + seconds });
    if (this.b.notices.length > 6) this.b.notices.shift();
  }

  protected emitFx(kind: string, x: number, y: number, extra: Partial<FxMarker> = {}): void {
    if (this.fx.length > 60) return;
    this.fx.push({ id: this.nextId(), kind, x: Math.round(x), y: Math.round(y), ...extra });
  }

  protected emit(e: GameDomainEvent): void {
    if (this.events.length > 500) this.events.shift();
    this.events.push(e);
  }

  protected touchViewer(v?: { id: string; username?: string; nickname?: string; avatarUrl?: string }): ViewerStats | undefined {
    if (!v?.id) return undefined;
    let s = this.b.viewers[v.id];
    if (!s) {
      if (Object.keys(this.b.viewers).length >= MAX_VIEWERS_TRACKED) this.evictViewers();
      s = { id: v.id, name: viewerName(v), score: 0, roundScore: 0, lastSeen: this.b.t };
      if (v.avatarUrl) s.avatarUrl = v.avatarUrl;
      this.b.viewers[v.id] = s;
      this.emit({ type: 'participation', viewer: { id: s.id, name: s.name } });
    }
    s.lastSeen = this.b.t;
    return s;
  }

  private evictViewers(): void {
    const arr = Object.values(this.b.viewers).sort((a, z) => a.score - z.score || a.lastSeen - z.lastSeen);
    for (const v of arr.slice(0, Math.floor(arr.length / 4))) delete this.b.viewers[v.id];
  }

  protected addScore(v: { id: string; username?: string; nickname?: string } | undefined, points: number, reason: string): void {
    const s = this.touchViewer(v);
    if (!s || points === 0) return;
    s.score += points;
    s.roundScore += points;
    this.emit({ type: 'score', viewer: { id: s.id, name: s.name }, points, reason });
  }

  protected leaderboard(n = 5, byRound = false): LeaderEntry[] {
    return Object.values(this.b.viewers)
      .filter((v) => (byRound ? v.roundScore : v.score) > 0)
      .sort((a, z) => (byRound ? z.roundScore - a.roundScore : z.score - a.score))
      .slice(0, n)
      .map((v) => ({ id: v.id, name: v.name, score: byRound ? v.roundScore : v.score }));
  }

  /** Encerra a rodada e agenda a próxima após um intervalo. */
  protected endRound(winner: (ViewerRef & { score?: number }) | undefined, summary: Record<string, unknown>, intermission = 6): void {
    if (this.b.phase !== 'playing') return;
    this.emit({ type: 'roundEnd', round: this.b.round, winner, summary });
    this.b.phase = 'intermission';
    this.b.phaseTimer = intermission;
    if (winner) this.notice(`🏆 ${winner.name} venceu a rodada ${this.b.round}!`, '#facc15', intermission);
  }

  private beginNextRound(): void {
    this.b.round += 1;
    for (const v of Object.values(this.b.viewers)) v.roundScore = 0;
    this.b.phase = 'playing';
    this.resetRound();
    this.emit({ type: 'roundStart', round: this.b.round });
    this.notice(`Rodada ${this.b.round} começou!`, '#a78bfa');
  }

  // ---------- contrato GameSimulation ----------

  tick(dt: number): void {
    const step = Math.min(dt, 0.1);
    this.b.t += step;
    if (this.b.notices.length) this.b.notices = this.b.notices.filter((n) => n.until > this.b.t);
    if (this.b.phase === 'paused' || this.b.phase === 'stopped') return;
    if (this.b.phase === 'intermission') {
      this.b.phaseTimer -= step;
      this.idle(step);
      if (this.b.phaseTimer <= 0 && this.ctx.config.autoMode !== false) this.beginNextRound();
      return;
    }
    this.update(step);
  }

  applyAction(action: GameActionMessage): void {
    if (this.b.phase === 'stopped') return;
    if (action.viewer) this.touchViewer(action.viewer);
    const q = Math.max(1, Math.min(action.quantity || 1, 200));
    this.onAction(action, q);
  }

  applySignal(signal: ViewerSignalMessage): void {
    if (this.b.phase === 'stopped') return;
    this.touchViewer(signal.viewer);
    this.onSignal(signal);
  }

  control(command: ControlCommand, args?: Record<string, unknown>): void {
    switch (command) {
      case 'PAUSE':
        if (this.b.phase !== 'paused' && this.b.phase !== 'stopped') {
          this.b.prePausePhase = this.b.phase;
          this.b.phase = 'paused';
        }
        break;
      case 'RESUME':
      case 'START':
        if (this.b.phase === 'paused') this.b.phase = this.b.prePausePhase;
        else if (this.b.phase === 'stopped') {
          this.b.phase = 'playing';
          this.resetRound();
        }
        break;
      case 'STOP':
        this.b.phase = 'stopped';
        break;
      case 'RESET_ROUND':
        for (const v of Object.values(this.b.viewers)) v.roundScore = 0;
        this.b.phase = 'playing';
        this.resetRound();
        this.notice('Rodada reiniciada', '#93c5fd');
        break;
      case 'RESET_SCORES':
        for (const v of Object.values(this.b.viewers)) {
          v.score = 0;
          v.roundScore = 0;
        }
        this.notice('Pontuação zerada', '#93c5fd');
        break;
      case 'ANNOUNCE': {
        const text = typeof args?.text === 'string' ? args.text : '';
        if (text) {
          this.notice(`📣 ${text}`, '#f9a8d4', 6);
          this.emit({ type: 'announce', text });
        }
        break;
      }
      case 'SWITCH_GAME':
        // Tratado pelo runner (troca a simulação inteira).
        break;
    }
  }

  consumeFx(): void {
    this.fx = [];
  }

  drainEvents(): GameDomainEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  serialize(): unknown {
    this.b.rng = this.rng.state;
    return { v: 1, b: this.b, st: this.st };
  }

  restore(data: unknown): void {
    const d = data as { v: number; b: BaseState; st: St } | undefined;
    if (!d || d.v !== 1 || !d.b || !d.st) throw new Error('checkpoint incompatível');
    this.b = d.b;
    this.st = d.st;
    this.rng = new Rng(d.b.rng);
    if (this.b.phase === 'stopped') this.b.phase = 'playing';
  }

  protected baseSnapshot(): BaseSnapshot {
    const theme = this.ctx.config.theme ?? { primary: '#3b82f6', secondary: '#8b5cf6', background: '#070b17' };
    return {
      gameId: this.manifest.id,
      aspect: this.aspect,
      width: this.W,
      height: this.H,
      t: Math.round(this.b.t * 1000) / 1000,
      round: this.b.round,
      phase: this.b.phase,
      phaseEndsIn: this.b.phase === 'intermission' ? Math.max(0, Math.ceil(this.b.phaseTimer)) : undefined,
      leaderboard: this.leaderboard(5),
      notices: this.b.notices.map(({ id, text, color }) => ({ id, text, color })),
      fx: this.fx,
      theme: {
        primary: theme.primary ?? '#3b82f6',
        secondary: theme.secondary ?? '#8b5cf6',
        background: theme.background ?? '#070b17',
      },
      simulated: this.ctx.simulated,
    };
  }

  // ---------- pontos de extensão ----------

  protected abstract update(dt: number): void;
  protected abstract onAction(action: GameActionMessage, quantity: number): void;
  protected abstract resetRound(): void;
  abstract snapshot(): S;
  /** Executado durante o intervalo entre rodadas (animações ociosas). */
  protected idle(_dt: number): void {}
  protected onSignal(_signal: ViewerSignalMessage): void {}
}
