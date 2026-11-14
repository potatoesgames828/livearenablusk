import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest, WEAPONS } from './manifest';

interface Fighter {
  id: string;
  name: string;
  bot: boolean;
  hp: number;
  maxHp: number;
  weapon: number;
  streak: number;
}

interface Bank {
  hp: number;
  weapon: number;
}

type DuelPhase = 'waiting' | 'intro' | 'windup' | 'hit' | 'ko' | 'finisher' | 'result';

interface State {
  queue: Array<{ id: string; name: string; bot: boolean }>;
  bank: Record<string, Bank>;
  left?: Fighter;
  right?: Fighter;
  phase: DuelPhase;
  timer: number;
  turn: 0 | 1;
  lastHit?: { side: 0 | 1; dmg: number; call: string; weapon: number };
  loserSide?: 0 | 1;
  duels: number;
  botSeq: number;
  wins: Record<string, number>;
}

export interface FighterView {
  id: string;
  name: string;
  bot: boolean;
  hp: number;
  maxHp: number;
  weapon: number;
  weaponName: string;
  streak: number;
}

export interface SlapSnapshot extends BaseSnapshot {
  left?: FighterView;
  right?: FighterView;
  duelPhase: DuelPhase;
  phaseT: number;
  turn: 0 | 1;
  lastHit?: { side: 0 | 1; dmg: number; call: string; weapon: number };
  loserSide?: 0 | 1;
  queue: Array<{ id: string; name: string; bot: boolean }>;
  queueSize: number;
  finishEvery: number;
  duels: number;
  joinHint: string;
  topWinners: Array<{ id: string; name: string; wins: number }>;
}

const BOT_NAMES = ['Bot Marujo', 'Bot Sardinha', 'Bot Caranguejo', 'Bot Gaivota', 'Bot Âncora', 'Bot Polvo', 'Bot Boia', 'Bot Pescador'];

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^!/, '').trim();
}

export class SlapArena extends BaseGame<SlapSnapshot, State> {
  protected st: State;
  private names: Record<string, string> = {};

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.st = { queue: [], bank: {}, phase: 'waiting', timer: 1, turn: 0, duels: 0, botSeq: 0, wins: {} };
  }

  private pace(): number {
    const p = String(this.setting<string>('pace'));
    return p === 'slow' ? 0.7 : p === 'fast' ? 1.5 : 1;
  }

  private bankOf(id: string): Bank {
    return (this.st.bank[id] ??= { hp: 0, weapon: 0 });
  }

  private makeFighter(q: { id: string; name: string; bot: boolean }): Fighter {
    const base = this.num('startHp') || 100;
    const bank = q.bot ? { hp: 0, weapon: this.rng.chance(0.3) ? this.rng.int(1, 2) : 0 } : this.bankOf(q.id);
    const f: Fighter = { id: q.id, name: q.name, bot: q.bot, hp: base + bank.hp, maxHp: base + bank.hp, weapon: bank.weapon, streak: 0 };
    if (!q.bot) this.st.bank[q.id] = { hp: 0, weapon: bank.weapon };
    return f;
  }

  private join(v: GameActionMessage['viewer']): void {
    if (!v?.id) return;
    const s = this.st;
    if (s.left?.id === v.id || s.right?.id === v.id || s.queue.some((q) => q.id === v.id)) return;
    if (s.queue.length >= 200) return;
    // retira bots da fila quando gente real entra
    s.queue = s.queue.filter((q) => !q.bot);
    s.queue.push({ id: v.id, name: viewerName(v), bot: false });
    this.names[v.id] = viewerName(v);
    this.notice(`${viewerName(v)} entrou na fila (#${s.queue.length})`, '#7dd3fc', 2.5);
  }

  private nextFromQueue(): { id: string; name: string; bot: boolean } | undefined {
    const s = this.st;
    const q = s.queue.shift();
    if (q) return q;
    if (this.setting<boolean>('demoDuels') === false) return undefined;
    const n = s.botSeq++;
    return { id: `bot:${n}`, name: BOT_NAMES[n % BOT_NAMES.length]!, bot: true };
  }

  private fill(): boolean {
    const s = this.st;
    if (!s.left) {
      const q = this.nextFromQueue();
      if (q) s.left = this.makeFighter(q);
    }
    if (!s.right) {
      const q = this.nextFromQueue();
      if (q) s.right = this.makeFighter(q);
    }
    return !!(s.left && s.right);
  }

  private fighter(side: 0 | 1): Fighter | undefined {
    return side === 0 ? this.st.left : this.st.right;
  }

  protected update(dt: number): void {
    const s = this.st;
    s.timer -= dt;
    if (s.timer > 0) return;
    const pace = this.pace();
    switch (s.phase) {
      case 'waiting':
        if (this.fill()) {
          s.phase = 'intro';
          s.timer = 1.6;
          s.turn = this.rng.chance(0.5) ? 0 : 1;
          this.emitFx('bell', this.W / 2, this.H / 2);
        } else s.timer = 0.5;
        break;
      case 'intro':
      case 'hit':
        s.phase = 'windup';
        s.timer = 0.55 / pace;
        break;
      case 'windup': {
        const atk = this.fighter(s.turn)!;
        const def = this.fighter(s.turn === 0 ? 1 : 0)!;
        const w = WEAPONS[atk.weapon]!;
        const crit = this.rng.chance(0.12);
        const dmg = Math.round(w.dmg * this.rng.range(0.8, 1.2) * pace * (crit ? 1.8 : 1));
        def.hp = Math.max(0, def.hp - dmg);
        s.lastHit = { side: s.turn, dmg, call: crit ? `CRÍTICO! ${w.call}` : w.call, weapon: atk.weapon };
        this.emitFx('slap', s.turn === 0 ? this.W * 0.6 : this.W * 0.4, this.H * 0.5, { text: w.call, size: atk.weapon });
        if (!atk.bot) this.addScore({ id: atk.id, nickname: atk.name }, Math.max(1, Math.round(dmg / 5)), 'slap');
        if (def.hp <= 0) {
          const finish = atk.streak + 1 >= 1 && (atk.streak + 1) % Math.max(1, this.num('finishEvery') || 3) === 0;
          s.phase = finish ? 'finisher' : 'ko';
          s.timer = finish ? 3.2 : 1.8;
          s.loserSide = s.turn === 0 ? 1 : 0;
          this.emitFx(finish ? 'finisher' : 'ko', this.W / 2, this.H / 2);
        } else {
          s.phase = 'hit';
          s.timer = 0.7 / pace;
          s.turn = s.turn === 0 ? 1 : 0;
        }
        break;
      }
      case 'ko':
      case 'finisher': {
        const winSide = s.loserSide === 0 ? 1 : 0;
        const win = this.fighter(winSide as 0 | 1)!;
        const lose = this.fighter(s.loserSide!)!;
        win.streak++;
        s.duels++;
        if (!win.bot) {
          s.wins[win.id] = (s.wins[win.id] ?? 0) + 1;
          this.addScore({ id: win.id, nickname: win.name }, 20 + win.streak * 5, 'win');
        }
        this.emit({ type: 'roundEnd', round: s.duels, winner: win.bot ? undefined : { id: win.id, name: win.name, score: win.streak }, summary: { loser: lose.name, streak: win.streak, finisher: s.phase === 'finisher' } });
        this.notice(`🏆 ${win.name} venceu ${lose.name}${win.streak > 1 ? ` · ${win.streak} seguidas` : ''}`, '#facc15', 4);
        s.phase = 'result';
        s.timer = this.num('resultHold') || 3;
        break;
      }
      case 'result': {
        // o vencedor fica (vida recuperada) e vai para a esquerda
        const winSide = s.loserSide === 0 ? 1 : 0;
        const win = this.fighter(winSide as 0 | 1)!;
        win.hp = win.maxHp;
        s.left = win;
        s.right = undefined;
        s.loserSide = undefined;
        s.lastHit = undefined;
        // campeão bot cede lugar quando há gente real na fila
        if (win.bot && s.queue.some((q) => !q.bot)) s.left = undefined;
        s.phase = 'waiting';
        s.timer = 0.3;
        break;
      }
    }
  }

  protected resetRound(): void {
    const s = this.st;
    s.left = undefined;
    s.right = undefined;
    s.phase = 'waiting';
    s.timer = 1;
    s.lastHit = undefined;
  }

  protected onAction(action: GameActionMessage, q: number): void {
    const v = action.viewer;
    if (!v?.id) return;
    const s = this.st;
    const live = s.left?.id === v.id ? s.left : s.right?.id === v.id ? s.right : undefined;
    switch (action.actionId) {
      case 'join':
        this.join(v);
        break;
      case 'power_up': {
        const hp = Math.round(this.param(action, 'coins', 1) * q * (this.num('hpPerCoin') || 5));
        if (live) {
          live.maxHp += hp;
          live.hp += hp;
          this.emitFx('heal', live === s.left ? this.W * 0.3 : this.W * 0.7, this.H * 0.45);
        } else {
          this.join(v);
          this.bankOf(v.id).hp += hp;
        }
        this.addScore(v, Math.max(1, Math.round(hp / 10)), 'power');
        break;
      }
      case 'weapon': {
        const raw = action.params?.level;
        const lvl = Math.max(1, Math.min(WEAPONS.length - 1, Number(raw) || 1));
        if (live) {
          if (lvl > live.weapon) {
            live.weapon = lvl;
            this.notice(`🔧 ${live.name} pegou: ${WEAPONS[lvl]!.name}!`, '#f59e0b', 3);
            this.emitFx('weapon', live === s.left ? this.W * 0.3 : this.W * 0.7, this.H * 0.45);
          }
        } else {
          this.join(v);
          const b = this.bankOf(v.id);
          b.weapon = Math.max(b.weapon, lvl);
        }
        this.addScore(v, lvl * 5, 'weapon');
        break;
      }
    }
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    if (sig.type === 'GIFT') this.addScore(sig.viewer, Math.max(1, Math.round(sig.value)), 'gift');
    if (sig.type === 'CHAT' && sig.text) {
      const words = String(this.setting<string>('joinKeywords') ?? '').split(',').map(norm).filter(Boolean);
      if (words.includes(norm(sig.text).split(/\s+/)[0] ?? '')) this.join(sig.viewer);
    }
  }

  private view(f?: Fighter): FighterView | undefined {
    if (!f) return undefined;
    return { id: f.id, name: f.name, bot: f.bot, hp: Math.round(f.hp), maxHp: Math.round(f.maxHp), weapon: f.weapon, weaponName: WEAPONS[f.weapon]!.name, streak: f.streak };
  }

  snapshot(): SlapSnapshot {
    const s = this.st;
    const total = { waiting: 1, intro: 1.6, windup: 0.55 / this.pace(), hit: 0.7 / this.pace(), ko: 1.8, finisher: 3.2, result: this.num('resultHold') || 3 }[s.phase];
    return {
      ...this.baseSnapshot(),
      left: this.view(s.left),
      right: this.view(s.right),
      duelPhase: s.phase,
      phaseT: Math.round(Math.max(0, Math.min(1, 1 - s.timer / total)) * 100) / 100,
      turn: s.turn,
      lastHit: s.lastHit,
      loserSide: s.loserSide,
      queue: s.queue.slice(0, Math.max(0, this.num('queueShown'))),
      queueSize: s.queue.length,
      finishEvery: this.num('finishEvery') || 3,
      duels: s.duels,
      joinHint: `Digite "${String(this.setting<string>('joinKeywords') ?? 'tapa').split(',')[0]!.trim()}" para entrar na fila`,
      topWinners: Object.entries(s.wins).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, wins]) => ({ id, name: this.names[id] ?? id, wins })),
    };
  }

  override serialize(): unknown {
    return { ...(super.serialize() as object), names: this.names };
  }
  override restore(data: unknown): void {
    super.restore(data);
    this.names = (data as { names?: Record<string, string> }).names ?? {};
  }
}
