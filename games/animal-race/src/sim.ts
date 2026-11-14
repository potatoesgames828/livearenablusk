import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { ANIMALS, MatchGame, type AnimalKind, type MatchBaseSnapshot, type Participant, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

interface Runner {
  pid: string;
  name: string;
  animal: AnimalKind;
  lane: number;
  x: number;
  v: number;
  stamina: number;
  boost: number;
  stun: number;
  mud: number;
  slip: number;
  jump: number;
  place: number;
  finishT: number;
  ph: number;
  nextObs: number;
}

interface State {
  runners: Runner[];
  obstacles: Array<{ x: number; k: 'hurdle' | 'mud' }>;
  length: number;
  cheer: number;
  finished: number;
  firstFinishAt: number;
  botT: number;
}

export interface AnimalSnapshot extends MatchBaseSnapshot {
  runners: Array<{ id: string; n: string; a: AnimalKind; lane: number; p: number; st: number; b?: 1; s?: 1; m?: 1; j?: number; pl?: number; ph: number; bot?: 1 }>;
  obstacles: Array<{ p: number; k: 'hurdle' | 'mud' }>;
  lanes: number;
  cheer: boolean;
}

const LENGTHS: Record<string, number> = { short: 1800, medium: 2800, long: 4000 };
const BASE_SPEED = 52;

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^!/, '').trim();
}

export class AnimalRace extends MatchGame<AnimalSnapshot, State> {
  protected st: State;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.st = { runners: [], obstacles: [], length: LENGTHS.medium!, cheer: 0, finished: 0, firstFinishAt: -1, botT: 3 };
    this.initMatch();
  }

  private spec(a: AnimalKind) {
    return ANIMALS.find((x) => x.kind === a)!;
  }

  private leastUsedAnimal(): AnimalKind {
    const counts = new Map<AnimalKind, number>();
    for (const a of ANIMALS) counts.set(a.kind, 0);
    for (const r of this.st.runners) counts.set(r.animal, (counts.get(r.animal) ?? 0) + 1);
    const min = Math.min(...counts.values());
    const opts = ANIMALS.filter((a) => counts.get(a.kind) === min);
    return this.rng.pick(opts).kind;
  }

  private runnerOf(pid?: string): Runner | undefined {
    return pid ? this.st.runners.find((r) => r.pid === pid) : undefined;
  }

  protected override onJoin(p: Participant): void {
    if (this.runnerOf(p.id)) return;
    this.st.runners.push({ pid: p.id, name: p.name, animal: this.leastUsedAnimal(), lane: 0, x: 0, v: 0, stamina: 1, boost: 0, stun: 0, mud: 0, slip: 0, jump: 0, place: 0, finishT: 0, ph: this.rng.range(0, 6), nextObs: 0 });
    this.relane();
  }

  protected override onLeave(p: Participant): void {
    this.st.runners = this.st.runners.filter((r) => r.pid !== p.id);
    this.relane();
  }

  private relane(): void {
    this.st.runners.forEach((r, i) => (r.lane = i));
  }

  protected override keepRosterBetweenMatches(): boolean {
    return false;
  }

  protected override onLobby(): void {
    const len = LENGTHS[String(this.setting<string>('trackLength'))] ?? LENGTHS.medium!;
    this.st.length = len;
    this.st.finished = 0;
    this.st.firstFinishAt = -1;
    const n = Math.max(0, this.num('obstacles'));
    this.st.obstacles = [];
    for (let i = 0; i < n; i++) {
      this.st.obstacles.push({ x: Math.round(len * (0.12 + (0.78 * (i + this.rng.range(0.2, 0.8))) / Math.max(1, n))), k: this.rng.chance(0.55) ? 'hurdle' : 'mud' });
    }
    for (const r of this.st.runners) Object.assign(r, { x: 0, v: 0, stamina: 1, boost: 0, stun: 0, mud: 0, slip: 0, jump: 0, place: 0, finishT: 0, nextObs: 0 });
    this.relane();
  }

  protected override lobbyTick(dt: number): void {
    for (const r of this.st.runners) r.ph += dt * 2;
  }

  protected onMatchStart(): void {
    this.emitFx('start', this.W / 2, this.H / 2);
    this.notice('🏁 Valendo!', '#84cc16', 2);
  }

  protected matchTick(dt: number): void {
    const s = this.st;
    s.cheer = Math.max(0, s.cheer - dt);
    const t = this.m.elapsed;
    for (const r of s.runners) {
      if (r.place) {
        r.v *= 0.9;
        r.ph += dt * 3;
        continue;
      }
      const sp = this.spec(r.animal);
      r.boost = Math.max(0, r.boost - dt);
      r.stun = Math.max(0, r.stun - dt);
      r.mud = Math.max(0, r.mud - dt);
      r.slip = Math.max(0, r.slip - dt);
      r.jump = Math.max(0, r.jump - dt);
      let target = BASE_SPEED * sp.speed;
      if (r.stamina < 0.15) target *= 0.6;
      if (r.boost > 0) target *= r.animal === 'galinha' ? 1.9 : 1.6;
      if (s.cheer > 0) target *= 1.1;
      if (r.mud > 0) target *= 0.45;
      if (r.animal === 'raposa' && t < 10) target *= 1.12;
      if (r.animal === 'pinguim' && r.x > s.length * 0.8) target *= 1.15;
      if (r.animal === 'sapo' && Math.sin(t * 2 + r.ph) > 0.7) target *= 1.25;
      target *= 0.92 + 0.16 * Math.sin(t * 0.7 + r.lane * 1.7); // ritmo natural
      if (r.stun > 0 || r.slip > 0) target = 0;
      const accel = 60 * sp.accel;
      r.v += Math.max(-accel * 2, Math.min(accel, (target - r.v) * 3)) * dt;
      r.v = Math.max(0, r.v);
      r.x += r.v * dt;
      r.ph += dt * (4 + r.v / 8);
      r.stamina = Math.max(0, Math.min(1, r.stamina - dt * (r.boost > 0 ? 0.09 : 0.022) / sp.stamina + (r.v < 10 ? dt * 0.05 : 0)));
      // obstáculos
      while (r.nextObs < s.obstacles.length && r.x >= s.obstacles[r.nextObs]!.x) {
        const o = s.obstacles[r.nextObs++]!;
        if (o.k === 'hurdle') {
          if (r.animal === 'coelho' || r.animal === 'sapo' || r.animal === 'cavalo') r.jump = 0.6;
          else if (r.animal !== 'tartaruga') {
            r.stun = 0.9;
            this.emitFx('trip', 0, 0, { text: r.name });
          } else r.jump = 0.3;
        } else if (r.animal !== 'porco' && r.animal !== 'tartaruga') r.mud = 1.3;
      }
      if (r.x >= s.length) {
        r.x = s.length;
        r.place = ++s.finished;
        r.finishT = t;
        if (s.firstFinishAt < 0) s.firstFinishAt = t;
        const p = this.participant(r.pid);
        this.credit(p, Math.max(10, 110 - r.place * 15), 'finish');
        if (r.place <= 3) {
          this.emitFx('finish', 0, 0, { text: r.name, size: r.place });
          this.notice(`${['🥇', '🥈', '🥉'][r.place - 1]} ${r.name} (${this.spec(r.animal).name}) cruzou a chegada!`, '#facc15', 4);
        }
      }
    }
    // bots dão turbo de vez em quando
    s.botT -= dt;
    if (s.botT <= 0) {
      s.botT = this.rng.range(2, 5);
      const bots = s.runners.filter((r) => !r.place && this.participant(r.pid)?.bot);
      if (bots.length) this.rng.pick(bots).boost = 2;
    }
    const allDone = s.runners.length > 0 && s.runners.every((r) => r.place);
    if (allDone || (s.firstFinishAt >= 0 && t - s.firstFinishAt > 12)) this.endRace();
  }

  private ranking(): Runner[] {
    return [...this.st.runners].sort((a, b) => (a.place && b.place ? a.place - b.place : a.place ? -1 : b.place ? 1 : b.x - a.x));
  }

  private endRace(): void {
    const ranked = this.ranking();
    const parts = ranked.map((r) => this.participant(r.pid)).filter((p): p is Participant => !!p);
    const w = ranked[0];
    this.emitFx('victory', this.W / 2, this.H / 2);
    this.finishMatch({
      ranking: parts,
      title: w ? `${w.name} venceu!` : 'Fim da corrida',
      subtitle: w ? `Correndo de ${this.spec(w.animal).name} · ${w.finishT ? `${w.finishT.toFixed(1)} s` : 'liderando no fim do tempo'}` : undefined,
      scoreOf: (p) => p.score,
    });
  }

  protected onTimeUp(): void {
    this.endRace();
  }

  private target(v: GameActionMessage['viewer']): Runner | undefined {
    const own = this.runnerOf(v?.id);
    if (own && !own.place) return own;
    // quem não está correndo ajuda o último colocado, em seu nome
    const alive = this.st.runners.filter((r) => !r.place);
    return alive.sort((a, b) => a.x - b.x)[0];
  }

  protected onGameAction(action: GameActionMessage, q: number): void {
    if (this.stage !== 'playing') {
      if (action.actionId === 'boost' || action.actionId === 'carrot') this.join(action.viewer);
      return;
    }
    const v = action.viewer;
    const s = this.st;
    switch (action.actionId) {
      case 'boost': {
        const r = this.target(v);
        if (!r) return;
        r.boost = Math.min(10, r.boost + this.param(action, 'seconds', 2.5) * Math.min(4, q));
        this.emitFx('boost', 0, 0, { text: r.name });
        this.addScore(v, 5 * q, 'boost');
        break;
      }
      case 'carrot': {
        const r = this.target(v);
        if (!r) return;
        r.stamina = 1;
        this.emitFx('carrot', 0, 0, { text: r.name });
        this.addScore(v, 8, 'carrot');
        break;
      }
      case 'banana': {
        const leader = s.runners.filter((r) => !r.place).sort((a, b) => b.x - a.x)[0];
        if (!leader) return;
        if (leader.animal === 'tartaruga') {
          this.notice(`🐢 ${leader.name} nem sentiu a banana (casco!)`, '#4ade80', 3);
          return;
        }
        leader.slip = 1.4;
        this.notice(`🍌 ${leader.name} escorregou na banana!`, '#fde047', 3);
        this.addScore(v, 10, 'banana');
        break;
      }
      case 'lightning': {
        const top = s.runners.filter((r) => !r.place).sort((a, b) => b.x - a.x).slice(0, 3);
        for (const r of top) r.stun = 1.6;
        this.emitFx('lightning', this.W / 2, this.H / 2);
        this.notice('⚡ Raio nos três primeiros!', '#facc15', 3);
        this.addScore(v, 20, 'lightning');
        break;
      }
      case 'cheer':
        s.cheer = 6;
        for (const r of s.runners) r.stamina = Math.min(1, r.stamina + 0.25);
        this.notice('📣 A torcida empurra todo mundo!', '#a3e635', 3);
        break;
    }
  }

  protected override onGameSignal(sig: ViewerSignalMessage): void {
    if (sig.type !== 'CHAT' || !sig.text) return;
    const w = norm(sig.text).split(/\s+/)[0] ?? '';
    const a = ANIMALS.find((x) => norm(x.name) === w || x.kind === w);
    if (!a) return;
    const p = this.join(sig.viewer);
    const r = this.runnerOf(p?.id);
    if (r && this.stage === 'lobby') r.animal = a.kind;
  }

  snapshot(): AnimalSnapshot {
    const s = this.st;
    return {
      ...this.baseSnapshot(),
      leaderboard: this.leaderboard(5),
      match: this.matchSnapshot(),
      runners: s.runners.map((r) => {
        const o: AnimalSnapshot['runners'][number] = { id: r.pid, n: r.name, a: r.animal, lane: r.lane, p: Math.round((r.x / s.length) * 10000) / 10000, st: Math.round(r.stamina * 100) / 100, ph: Math.round(r.ph * 100) / 100 };
        if (r.boost > 0) o.b = 1;
        if (r.stun > 0 || r.slip > 0) o.s = 1;
        if (r.mud > 0) o.m = 1;
        if (r.jump > 0) o.j = Math.round(r.jump * 100) / 100;
        if (r.place) o.pl = r.place;
        if (this.participant(r.pid)?.bot) o.bot = 1;
        return o;
      }),
      obstacles: s.obstacles.map((o) => ({ p: Math.round((o.x / s.length) * 1000) / 1000, k: o.k })),
      lanes: Math.max(4, s.runners.length),
      cheer: s.cheer > 0,
    };
  }
}
