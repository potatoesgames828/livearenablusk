import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

interface Racer {
  lane: number;
  viewerId: string | null;
  name: string;
  color: string;
  pos: number;
  speed: number;
  boost: number;
  boostUntil: number;
  shieldUntil: number;
  stunUntil: number;
  finishedAt: number | null;
  place: number | null;
  checkpoint: number;
}
interface Obstacle {
  id: number;
  lane: number;
  pos: number;
}

interface RaceState {
  racers: Racer[];
  obstacles: Obstacle[];
  queue: Array<{ id: string; name: string }>;
  raceTime: number;
  firstFinishAt: number | null;
  finishers: number;
  lastWinner: string | null;
}

export interface RaceSnapshot extends BaseSnapshot {
  track: { length: number; lanes: number; x: number; y: number; w: number; h: number };
  racers: Array<{
    id: number; lane: number; name: string; color: string; pos: number; bot: boolean; boosting: boolean;
    shield: boolean; stunned: boolean; place: number | null; x: number; y: number;
  }>;
  obstacles: Array<{ id: number; lane: number; pos: number; x: number; y: number }>;
  queue: number;
  raceTime: number;
  lastWinner: string | null;
}

const PALETTE = ['#f43f5e', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#eab308', '#6366f1'];
const BOT_NAMES = ['Bot Faísca', 'Bot Turbo', 'Bot Cometa', 'Bot Raio', 'Bot Neon', 'Bot Pixel', 'Bot Foguete', 'Bot Nitro', 'Bot Vento', 'Bot Trovão', 'Bot Ágil', 'Bot Zap'];

export class AvatarRace extends BaseGame<RaceSnapshot, RaceState> {
  protected st: RaceState;
  private readonly track: RaceSnapshot['track'];

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    const vertical = this.aspect === 'vertical';
    const lanes = this.num('lanes');
    const x = vertical ? 60 : 120;
    const y = vertical ? 420 : 260;
    const w = this.W - x * 2;
    const h = vertical ? this.H - y - 460 : this.H - y - 140;
    this.track = { length: this.num('trackLength'), lanes, x, y, w, h };
    this.st = { racers: [], obstacles: [], queue: [], raceTime: 0, firstFinishAt: null, finishers: 0, lastWinner: null };
    this.resetRound();
  }

  protected resetRound(): void {
    const s = this.st;
    const humans = s.racers.filter((r) => r.viewerId).map((r) => ({ id: r.viewerId!, name: r.name }));
    // quem estava correndo vai para o fim da fila, dando a vez a quem esperava
    const pool = [...s.queue, ...humans];
    s.queue = [];
    s.racers = [];
    s.obstacles = [];
    s.raceTime = 0;
    s.firstFinishAt = null;
    s.finishers = 0;
    const seen = new Set<string>();
    for (let lane = 0; lane < this.track.lanes; lane++) {
      let next = pool.shift();
      while (next && seen.has(next.id)) next = pool.shift();
      if (next) seen.add(next.id);
      if (!next && !this.setting<boolean>('fillWithBots')) continue;
      s.racers.push(this.newRacer(lane, next ?? null));
    }
    s.queue = pool.filter((p) => !seen.has(p.id)).slice(0, 200);
    const density = this.num('obstacleDensity');
    for (let lane = 0; lane < this.track.lanes; lane++) {
      for (let i = 0; i < density; i++) {
        s.obstacles.push({ id: this.nextId(), lane, pos: this.rng.range(this.track.length * 0.12, this.track.length * 0.92) });
      }
    }
  }

  private newRacer(lane: number, who: { id: string; name: string } | null): Racer {
    return {
      lane,
      viewerId: who?.id ?? null,
      name: who?.name ?? BOT_NAMES[lane % BOT_NAMES.length]!,
      color: PALETTE[lane % PALETTE.length]!,
      pos: 0,
      speed: this.num('baseSpeed') * this.rng.range(0.85, 1.15),
      boost: 0, boostUntil: 0, shieldUntil: 0, stunUntil: 0, finishedAt: null, place: null, checkpoint: 0,
    };
  }

  private racerOf(viewerId: string): Racer | undefined {
    return this.st.racers.find((r) => r.viewerId === viewerId);
  }

  /** Coloca o espectador na corrida (substitui um bot) ou na fila. */
  private join(v: { id: string; username?: string; nickname?: string }): Racer | undefined {
    const existing = this.racerOf(v.id);
    if (existing) return existing;
    const name = viewerName(v);
    const bot = this.st.racers.find((r) => !r.viewerId && r.finishedAt === null);
    if (bot) {
      bot.viewerId = v.id;
      bot.name = name;
      this.emitFx('join', this.laneX(bot), this.laneY(bot.lane), { color: bot.color, text: name });
      this.notice(`🏎️ ${name} entrou na corrida!`, bot.color, 3);
      return bot;
    }
    if (!this.st.queue.some((q) => q.id === v.id) && this.st.queue.length < 200) {
      this.st.queue.push({ id: v.id, name });
      this.notice(`⏳ ${name} está na fila da próxima corrida`, '#94a3b8', 3);
    }
    return undefined;
  }

  private laneY(lane: number): number {
    const lh = this.track.h / this.track.lanes;
    return this.track.y + lh * lane + lh / 2;
  }
  private laneX(r: Racer): number {
    return this.track.x + 40 + (r.pos / this.track.length) * (this.track.w - 120);
  }

  protected update(dt: number): void {
    const s = this.st;
    s.raceTime += dt;
    const t = this.b.t;
    for (const r of s.racers) {
      if (r.finishedAt !== null) continue;
      if (r.boostUntil < t) r.boost = 0;
      const stunned = r.stunUntil > t;
      // bots variam o ritmo para a corrida ser imprevisível
      const wobble = r.viewerId ? 1 : 0.9 + Math.sin(t * 0.7 + r.lane * 1.3) * 0.15;
      const v = stunned ? r.speed * 0.15 : r.speed * wobble * (1 + r.boost);
      const prev = r.pos;
      r.pos = Math.min(this.track.length, r.pos + v * dt);
      // obstáculos
      for (const o of s.obstacles) {
        if (o.lane !== r.lane || o.pos <= prev || o.pos > r.pos) continue;
        if (r.shieldUntil > t) {
          this.emitFx('shield-hit', this.laneX(r), this.laneY(r.lane), { color: '#38bdf8' });
        } else {
          r.stunUntil = t + 1.2;
          r.pos = o.pos;
          this.emitFx('crash', this.laneX(r), this.laneY(r.lane), { color: '#f87171' });
        }
        o.pos = -1000; // consumido
      }
      const cp = Math.floor((r.pos / this.track.length) * 4);
      if (cp > r.checkpoint && cp < 4) {
        r.checkpoint = cp;
        if (r.viewerId) this.addScore({ id: r.viewerId, nickname: r.name }, 2, 'race-checkpoint');
      }
      if (r.pos >= this.track.length) {
        r.finishedAt = s.raceTime;
        r.place = ++s.finishers;
        if (r.place === 1) s.firstFinishAt = s.raceTime;
        const pts = [50, 30, 20, 10][r.place - 1] ?? 5;
        if (r.viewerId) this.addScore({ id: r.viewerId, nickname: r.name }, pts, 'race-finish');
        this.emitFx(r.place === 1 ? 'win' : 'finish', this.laneX(r), this.laneY(r.lane), { color: r.color, text: `${r.place}º ${r.name}` });
      }
    }
    s.obstacles = s.obstacles.filter((o) => o.pos >= 0);
    const allDone = s.racers.every((r) => r.finishedAt !== null);
    if (allDone || (s.firstFinishAt !== null && s.raceTime - s.firstFinishAt > this.num('finishGrace'))) {
      const winner = s.racers.find((r) => r.place === 1);
      s.lastWinner = winner?.name ?? null;
      this.endRound(
        winner ? { id: winner.viewerId ?? `bot-${winner.lane}`, name: winner.name } : undefined,
        { time: Math.round((winner?.finishedAt ?? s.raceTime) * 10) / 10, racers: s.racers.length, humans: s.racers.filter((r) => r.viewerId).length },
        8,
      );
    }
  }

  protected onAction(a: GameActionMessage, q: number): void {
    const s = this.st;
    const t = this.b.t;
    switch (a.actionId) {
      case 'join':
        if (a.viewer) {
          this.join(a.viewer);
          this.addScore(a.viewer, 1, 'race-join');
        }
        break;
      case 'boost': {
        const r = a.viewer ? this.join(a.viewer) : undefined;
        if (!r || r.finishedAt !== null) break;
        r.boost = Math.min(10, Math.max(r.boost, this.param(a, 'power', 2)));
        r.boostUntil = Math.max(r.boostUntil, t) + this.param(a, 'duration', 2) * Math.min(q, 5);
        r.stunUntil = 0;
        this.emitFx('boost', this.laneX(r), this.laneY(r.lane), { color: r.color });
        break;
      }
      case 'crowd_energy': {
        const p = this.param(a, 'power', 0.6);
        for (const r of s.racers) {
          if (!r.viewerId || r.finishedAt !== null) continue;
          r.boost = Math.max(r.boost, p);
          r.boostUntil = Math.max(r.boostUntil, t) + 1.5;
        }
        this.notice('💛 Energia das curtidas para o público!', '#fde047', 2);
        break;
      }
      case 'turbo_all': {
        const p = this.param(a, 'power', 1.5);
        for (const r of s.racers) {
          if (r.finishedAt !== null) continue;
          r.boost = Math.max(r.boost, p);
          r.boostUntil = Math.max(r.boostUntil, t) + 3;
        }
        this.emitFx('turbo-all', this.W / 2, this.track.y + this.track.h / 2, { color: '#fde047' });
        break;
      }
      case 'shield': {
        const r = a.viewer ? this.join(a.viewer) : undefined;
        if (!r) break;
        r.shieldUntil = Math.max(r.shieldUntil, t) + this.param(a, 'duration', 4);
        this.emitFx('shield', this.laneX(r), this.laneY(r.lane), { color: '#38bdf8' });
        break;
      }
      case 'obstacles': {
        const leader = [...s.racers].filter((r) => r.finishedAt === null).sort((x, y) => y.pos - x.pos)[0];
        if (!leader) break;
        for (let i = 0; i < this.param(a, 'count', 2); i++) {
          const pos = Math.min(this.track.length - 5, leader.pos + 40 + i * 60);
          s.obstacles.push({ id: this.nextId(), lane: leader.lane, pos });
        }
        this.notice(`🚧 Obstáculos na frente de ${leader.name}!`, '#f87171', 3);
        break;
      }
    }
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    if (sig.type === 'GIFT') this.addScore(sig.viewer, Math.max(1, Math.round(sig.value)), 'gift');
  }

  snapshot(): RaceSnapshot {
    const s = this.st;
    const t = this.b.t;
    return {
      ...this.baseSnapshot(),
      track: this.track,
      racers: s.racers.map((r) => ({
        id: r.lane, lane: r.lane, name: r.name, color: r.color, pos: Math.round(r.pos), bot: !r.viewerId,
        boosting: r.boostUntil > t, shield: r.shieldUntil > t, stunned: r.stunUntil > t, place: r.place,
        x: Math.round(this.laneX(r)), y: Math.round(this.laneY(r.lane)),
      })),
      obstacles: s.obstacles.map((o) => ({
        id: o.id, lane: o.lane, pos: Math.round(o.pos),
        x: Math.round(this.track.x + 40 + (o.pos / this.track.length) * (this.track.w - 120)), y: Math.round(this.laneY(o.lane)),
      })),
      queue: s.queue.length,
      raceTime: Math.round(s.raceTime * 10) / 10,
      lastWinner: s.lastWinner,
    };
  }
}
