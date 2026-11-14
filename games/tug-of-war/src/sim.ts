import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

interface Member {
  team: number;
  name: string;
  pull: number;
  lastChat: number;
}

interface State {
  members: Record<string, Member>;
  pos: number;
  vel: number;
  roundWins: [number, number];
  roundNo: number;
  freeze: [number, number];
  pointPause: number;
  lastPointTeam?: number;
  quiet: number;
  strain: [number, number];
  botT: number;
}

export interface TugSnapshot extends BaseSnapshot {
  pos: number;
  teams: Array<{ name: string; color: string; members: number; wins: number; frozen: boolean; top: Array<{ id: string; name: string; pull: number }>; strain: number }>;
  bestOf: number;
  roundNo: number;
  pointPause: boolean;
  lastPointTeam?: number;
  matchWinner?: number;
  hint: string;
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^!/, '').trim();
}

export class TugOfWar extends BaseGame<TugSnapshot, State> {
  protected st: State;
  private matchWinner?: number;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.st = { members: {}, pos: 0, vel: 0, roundWins: [0, 0], roundNo: 1, freeze: [0, 0], pointPause: 0, quiet: 0, strain: [0, 0], botT: 1 };
  }

  private teamName(i: number): string {
    return String(this.setting<string>(i === 0 ? 'teamAName' : 'teamBName') || (i === 0 ? 'Time 1' : 'Time 2')).slice(0, 16);
  }
  private teamColor(i: number): string {
    const c = String(this.setting<string>(i === 0 ? 'teamAColor' : 'teamBColor'));
    return /^#[0-9a-f]{6}$/i.test(c) ? c : i === 0 ? '#3b82f6' : '#ec4899';
  }
  private keywords(i: number): string[] {
    return String(this.setting<string>(i === 0 ? 'teamAKeywords' : 'teamBKeywords') ?? '').split(',').map(norm).filter(Boolean);
  }
  private count(team: number): number {
    let n = 0;
    for (const m of Object.values(this.st.members)) if (m.team === team) n++;
    return n;
  }

  private join(v: GameActionMessage['viewer'], team?: number): Member | undefined {
    if (!v?.id) return undefined;
    const t = team ?? (this.count(0) <= this.count(1) ? 0 : 1);
    let m = this.st.members[v.id];
    if (m) {
      m.team = t;
      return m;
    }
    if (Object.keys(this.st.members).length >= 5000) return undefined;
    m = { team: t, name: viewerName(v), pull: 0, lastChat: -10 };
    this.st.members[v.id] = m;
    return m;
  }

  /** Força positiva puxa a bandeira para o lado do time (time 0 = esquerda/negativo). */
  private pull(team: number, force: number, who?: { id: string; m?: Member }): void {
    if (this.b.phase !== 'playing' || this.st.pointPause > 0 || force <= 0) return;
    if (this.st.freeze[team]! > 0) return;
    const target = Math.max(10, this.num('pullsToWin') || 120);
    const dir = team === 0 ? -1 : 1;
    this.st.vel += (dir * force) / target * 2.2;
    this.st.strain[team] = Math.min(1, this.st.strain[team]! + force / 30);
    this.st.quiet = 0;
    if (who?.m) {
      who.m.pull += force;
      this.addScore({ id: who.id, nickname: who.m.name }, Math.max(1, Math.round(force)), 'pull');
    }
  }

  private scorePoint(team: number): void {
    const s = this.st;
    s.roundWins[team as 0 | 1]++;
    s.lastPointTeam = team;
    this.emitFx('point', team === 0 ? this.W * 0.2 : this.W * 0.8, this.H * 0.5, { color: this.teamColor(team) });
    const need = Math.ceil((this.num('bestOf') || 3) / 2);
    if (s.roundWins[team]! >= need) {
      this.matchWinner = team;
      // MVP = quem mais puxou no time vencedor
      let mvp: { id: string; name: string; score: number } | undefined;
      for (const [id, m] of Object.entries(s.members)) if (m.team === team && (!mvp || m.pull > mvp.score)) mvp = { id, name: m.name, score: Math.round(m.pull) };
      this.emitFx('victory', this.W / 2, this.H / 2, { color: this.teamColor(team) });
      this.endRound(mvp, { winnerTeam: this.teamName(team), score: `${s.roundWins[0]} x ${s.roundWins[1]}` }, this.num('intermission') || 10);
      this.notice(`🏆 ${this.teamName(team)} venceu a partida!`, this.teamColor(team), 8);
    } else {
      this.notice(`Ponto para ${this.teamName(team)}! (${s.roundWins[0]} x ${s.roundWins[1]})`, this.teamColor(team), 3);
      s.pointPause = 2.5;
    }
  }

  protected update(dt: number): void {
    const s = this.st;
    s.freeze = [Math.max(0, s.freeze[0] - dt), Math.max(0, s.freeze[1] - dt)];
    s.strain = [Math.max(0, s.strain[0] - dt * 1.5), Math.max(0, s.strain[1] - dt * 1.5)];
    if (s.pointPause > 0) {
      s.pointPause -= dt;
      s.pos *= 0.9;
      s.vel = 0;
      if (s.pointPause <= 0) {
        s.pos = 0;
        s.roundNo++;
      }
      return;
    }
    s.quiet += dt;
    // demonstração: bots puxam levemente quando não há público real
    if (this.ctx.simulated && Object.keys(s.members).length === 0) {
      s.botT -= dt;
      if (s.botT <= 0) {
        s.botT = this.rng.range(0.15, 0.5);
        this.pull(this.rng.int(0, 1), this.rng.range(1, 4));
      }
    }
    s.pos += s.vel * dt;
    s.vel *= Math.pow(0.08, dt);
    if (this.setting<boolean>('idleRecenter') !== false && s.quiet > 4) s.pos *= Math.pow(0.85, dt);
    if (s.pos <= -1) this.scorePoint(0);
    else if (s.pos >= 1) this.scorePoint(1);
    s.pos = Math.max(-1, Math.min(1, s.pos));
  }

  protected resetRound(): void {
    const s = this.st;
    s.pos = 0;
    s.vel = 0;
    s.roundWins = [0, 0];
    s.roundNo = 1;
    s.pointPause = 0;
    s.lastPointTeam = undefined;
    for (const m of Object.values(s.members)) m.pull = 0;
    this.matchWinner = undefined;
  }

  private resolveTeam(action: GameActionMessage): number {
    const t = action.params?.team;
    if (t === '0' || t === 0) return 0;
    if (t === '1' || t === 1) return 1;
    const m = action.viewer ? this.st.members[action.viewer.id] : undefined;
    if (m) return m.team;
    const joined = this.join(action.viewer);
    return joined ? joined.team : this.st.pos > 0 ? 0 : 1;
  }

  protected onAction(action: GameActionMessage, q: number): void {
    const v = action.viewer;
    switch (action.actionId) {
      case 'join': {
        const t = action.params?.team;
        this.join(v, t === '0' ? 0 : t === '1' ? 1 : undefined);
        break;
      }
      case 'pull': {
        const team = this.resolveTeam(action);
        const m = v ? this.st.members[v.id] : undefined;
        const force = Math.min(5000, this.param(action, 'force', 6) * q);
        this.pull(team, force, v && m ? { id: v.id, m } : undefined);
        if (force >= 30) this.emitFx('bigpull', team === 0 ? this.W * 0.3 : this.W * 0.7, this.H * 0.55, { color: this.teamColor(team), text: m?.name });
        break;
      }
      case 'point':
        if (this.b.phase === 'playing' && this.st.pointPause <= 0) this.scorePoint(this.resolveTeam(action));
        break;
      case 'freeze': {
        const team = this.resolveTeam(action);
        const other = team === 0 ? 1 : 0;
        this.st.freeze[other] = Math.min(30, this.st.freeze[other]! + this.param(action, 'seconds', 4));
        this.notice(`🧊 ${this.teamName(other)} congelado!`, '#7dd3fc', 3);
        break;
      }
    }
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    const v = sig.viewer;
    if (sig.type === 'GIFT') this.addScore(v, Math.max(1, Math.round(sig.value)), 'gift');
    if (!v?.id) return;
    if (sig.type === 'CHAT' && sig.text) {
      const w = norm(sig.text).split(/\s+/)[0] ?? '';
      if (this.keywords(0).includes(w)) {
        this.join(v, 0);
        return;
      }
      if (this.keywords(1).includes(w)) {
        this.join(v, 1);
        return;
      }
      const m = this.st.members[v.id];
      if (m && this.b.t - m.lastChat >= 1) {
        m.lastChat = this.b.t;
        this.pull(m.team, this.num('chatPull'), { id: v.id, m });
      }
      return;
    }
    if (sig.type === 'LIKE') {
      const m = this.st.members[v.id];
      if (m) this.pull(m.team, Math.min(30, sig.value * this.num('likePull')), { id: v.id, m });
    }
  }

  snapshot(): TugSnapshot {
    const s = this.st;
    const top = (team: number) =>
      Object.entries(s.members)
        .filter(([, m]) => m.team === team && m.pull > 0)
        .sort((a, b) => b[1].pull - a[1].pull)
        .slice(0, 3)
        .map(([id, m]) => ({ id, name: m.name, pull: Math.round(m.pull) }));
    const kw = (i: number) => this.keywords(i)[0] ?? (i === 0 ? '1' : '2');
    return {
      ...this.baseSnapshot(),
      pos: Math.round(s.pos * 1000) / 1000,
      teams: [0, 1].map((i) => ({ name: this.teamName(i), color: this.teamColor(i), members: this.count(i), wins: s.roundWins[i]!, frozen: s.freeze[i]! > 0, top: top(i), strain: Math.round(s.strain[i]! * 100) / 100 })),
      bestOf: this.num('bestOf') || 3,
      roundNo: s.roundNo,
      pointPause: s.pointPause > 0,
      lastPointTeam: s.lastPointTeam,
      matchWinner: this.b.phase === 'intermission' ? this.matchWinner : undefined,
      hint: `Digite "${kw(0)}" ou "${kw(1)}" para entrar`,
    };
  }

  override serialize(): unknown {
    return { ...(super.serialize() as object), mw: this.matchWinner ?? null };
  }
  override restore(data: unknown): void {
    super.restore(data);
    const mw = (data as { mw?: number | null }).mw;
    this.matchWinner = mw ?? undefined;
  }
}
