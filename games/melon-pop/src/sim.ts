import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

export type Fruit = 'melancia' | 'abobora' | 'melao';

interface Band {
  id: number;
  color: string;
  owner: string;
  ownerId?: string;
  thick: boolean;
  /** posição vertical relativa na fruta (-1..1) */
  pos: number;
}

interface Pending {
  color: string;
  owner: string;
  ownerId?: string;
  thick: boolean;
  gift: boolean;
}

interface State {
  bands: Band[];
  queue: Pending[];
  strength: number;
  applyT: number;
  removeQueue: number;
  fruit: Fruit;
  freeUsed: string[];
  popped: boolean;
  popper?: { id?: string; name: string; by: 'band' | 'hammer' };
  chefAct: number;
  melons: number;
}

export interface MelonSnapshot extends BaseSnapshot {
  bands: Array<{ id: number; c: string; th?: 1; p: number }>;
  count: number;
  /** pressão visual 0..1 (não revela o número exato) */
  pressure: number;
  queue: number;
  fruit: Fruit;
  popped: boolean;
  popper?: { name: string; by: 'band' | 'hammer'; id?: string };
  lastOwners: string[];
  chefAct: number;
  melons: number;
  safe: boolean;
  freeHint: string;
}

const COLORS = ['#f43f5e', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#84cc16'];
const RANGES: Record<string, [number, number]> = { short: [40, 90], medium: [90, 200], long: [200, 450], huge: [450, 1000] };
const FRUITS: Fruit[] = ['melancia', 'abobora', 'melao'];

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^!/, '').trim();
}

export class MelonPop extends BaseGame<MelonSnapshot, State> {
  protected st: State;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.st = this.fresh(0);
  }

  private fresh(melons: number): State {
    const r = RANGES[String(this.setting<string>('strength'))] ?? RANGES.short!;
    const f = String(this.setting<string>('fruit'));
    return {
      bands: [], queue: [], strength: this.rng.int(r[0], r[1]), applyT: 0, removeQueue: 0,
      fruit: (FRUITS as string[]).includes(f) ? (f as Fruit) : this.rng.pick(FRUITS), freeUsed: [], popped: false, chefAct: 0, melons,
    };
  }

  private weight(): number {
    let w = 0;
    for (const b of this.st.bands) w += b.thick ? 10 : 1;
    return w;
  }

  private enqueue(v: GameActionMessage['viewer'], n: number, thick: boolean, gift: boolean): void {
    if (this.st.popped || this.b.phase !== 'playing') return;
    const owner = v ? viewerName(v) : 'Público';
    const items: Pending[] = [];
    for (let i = 0; i < n; i++) items.push({ color: thick ? '#dc2626' : this.rng.pick(COLORS), owner, ownerId: v?.id, thick, gift });
    if (gift) {
      // presentes entram na frente dos elásticos grátis
      const firstFree = this.st.queue.findIndex((q) => !q.gift);
      if (firstFree < 0) this.st.queue.push(...items);
      else this.st.queue.splice(firstFree, 0, ...items);
    } else this.st.queue.push(...items);
    if (this.st.queue.length > 3000) this.st.queue.length = 3000;
  }

  private applyOne(p: Pending): void {
    const band: Band = { id: this.nextId(), color: p.color, owner: p.owner, ownerId: p.ownerId, thick: p.thick, pos: this.rng.range(-0.55, 0.55) };
    this.st.bands.push(band);
    if (this.st.bands.length > 600) this.st.bands.splice(0, 1);
    this.st.chefAct = 1;
    this.emitFx('snap', 0, 0, { color: p.color });
    if (p.ownerId) this.addScore({ id: p.ownerId, nickname: p.owner }, p.thick ? 10 : 1, 'band');
    if (this.weight() >= this.st.strength) this.pop({ id: p.ownerId, name: p.owner, by: 'band' });
  }

  private pop(who: { id?: string; name: string; by: 'band' | 'hammer' }): void {
    if (this.st.popped) return;
    this.st.popped = true;
    this.st.popper = who;
    this.st.queue = [];
    this.emitFx('pop', this.W / 2, this.H / 2, { color: this.setting<boolean>('safeMode') ? '#f9a8d4' : '#ef4444' });
    if (who.id) this.addScore({ id: who.id, nickname: who.name }, 100, 'pop');
    this.endRound(who.id ? { id: who.id, name: who.name } : undefined, { bands: this.st.bands.length, strength: this.st.strength, fruit: this.st.fruit, by: who.by }, this.num('intermission') || 8);
    this.notice(`💥 ${who.name} estourou a ${this.fruitName()}!`, '#facc15', 6);
  }

  private fruitName(): string {
    return this.st.fruit === 'abobora' ? 'abóbora' : this.st.fruit === 'melao' ? 'melão' : 'melancia';
  }

  protected update(dt: number): void {
    const s = this.st;
    s.chefAct = Math.max(0, s.chefAct - dt * 3);
    if (s.popped) return;
    const speed = String(this.setting<string>('bandSpeed'));
    const baseGap = speed === 'slow' ? 1.1 : speed === 'fast' ? 0.4 : 0.7;
    // o chef se apressa sozinho quando a fila cresce
    const gap = baseGap / Math.min(12, 1 + s.queue.length / 8);
    s.applyT -= dt;
    while (s.applyT <= 0 && (s.queue.length || s.removeQueue)) {
      s.applyT += gap;
      if (s.removeQueue > 0) {
        s.removeQueue--;
        const b = s.bands.pop();
        if (b) this.emitFx('remove', 0, 0, { color: b.color });
        continue;
      }
      const p = s.queue.shift();
      if (p) this.applyOne(p);
      if (s.popped) return;
    }
    if (s.applyT < 0) s.applyT = 0;
  }

  protected override idle(dt: number): void {
    this.st.chefAct = Math.max(0, this.st.chefAct - dt * 3);
  }

  protected resetRound(): void {
    this.st = this.fresh(this.st.melons + 1);
  }

  protected onAction(action: GameActionMessage, q: number): void {
    const v = action.viewer;
    switch (action.actionId) {
      case 'band':
        this.enqueue(v, Math.min(500, Math.round(this.param(action, 'count', 1) * q)), false, true);
        break;
      case 'free_band':
        this.freeBand(v);
        break;
      case 'thick_band':
        this.enqueue(v, Math.min(50, q), true, true);
        break;
      case 'band_rain': {
        const n = Math.min(300, Math.round(this.param(action, 'count', 25) * q));
        this.enqueue(v, n, false, true);
        this.notice(`🌧️ ${v ? viewerName(v) : 'Alguém'} mandou uma chuva de ${n} elásticos!`, '#38bdf8', 3);
        break;
      }
      case 'take_off':
        if (this.st.popped) return;
        this.st.removeQueue += Math.min(100, Math.round(this.param(action, 'count', 5) * q));
        this.notice(`🧑‍🍳 O chef vai tirar elásticos (${v ? viewerName(v) : 'público'})`, '#a3e635', 3);
        break;
      case 'scissors': {
        if (this.st.popped) return;
        const n = Math.min(this.st.bands.length, Math.round(this.param(action, 'count', 10) * q));
        this.st.bands.splice(this.st.bands.length - n, n);
        this.emitFx('scissors', this.W / 2, this.H / 2);
        this.notice(`✂️ ${v ? viewerName(v) : 'Alguém'} cortou ${n} elásticos!`, '#a3e635', 3);
        if (v) this.addScore(v, 5, 'scissors');
        break;
      }
      case 'hammer':
        if (this.st.popped || this.b.phase !== 'playing') return;
        this.emitFx('hammer', this.W / 2, this.H / 2);
        this.pop({ id: v?.id, name: v ? viewerName(v) : 'Martelo', by: 'hammer' });
        break;
    }
  }

  private freeBand(v: GameActionMessage['viewer']): void {
    if (!v?.id || this.st.freeUsed.includes(v.id)) return;
    this.st.freeUsed.push(v.id);
    if (this.st.freeUsed.length > 5000) this.st.freeUsed.splice(0, 1000);
    this.enqueue(v, 1, false, false);
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    if (sig.type === 'CHAT' && sig.text) {
      const words = String(this.setting<string>('freeKeyword') ?? '').split(',').map(norm).filter(Boolean);
      const w = norm(sig.text).split(/\s+/)[0] ?? '';
      if (words.includes(w)) this.freeBand(sig.viewer);
    }
    if (sig.type === 'GIFT') this.addScore(sig.viewer, Math.max(1, Math.round(sig.value)), 'gift');
  }

  snapshot(): MelonSnapshot {
    const s = this.st;
    const w = this.weight();
    const pressure = Math.min(1, w / s.strength);
    const lastOwners: string[] = [];
    for (let i = s.bands.length - 1; i >= 0 && lastOwners.length < 5; i--) {
      const o = s.bands[i]!.owner;
      if (!lastOwners.includes(o)) lastOwners.push(o);
    }
    return {
      ...this.baseSnapshot(),
      bands: s.bands.slice(-140).map((b) => (b.thick ? { id: b.id, c: b.color, th: 1 as const, p: Math.round(b.pos * 100) / 100 } : { id: b.id, c: b.color, p: Math.round(b.pos * 100) / 100 })),
      count: s.bands.length,
      pressure: Math.round(pressure * 1000) / 1000,
      queue: s.queue.length,
      fruit: s.fruit,
      popped: s.popped,
      popper: s.popper,
      lastOwners,
      chefAct: Math.round(s.chefAct * 100) / 100,
      melons: s.melons,
      safe: this.setting<boolean>('safeMode') === true,
      freeHint: String(this.setting<string>('freeKeyword') ?? 'elastico').split(',')[0]!.trim(),
    };
  }
}
