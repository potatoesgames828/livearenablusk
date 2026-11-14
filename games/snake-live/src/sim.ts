import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

type Dir = 'up' | 'down' | 'left' | 'right';
interface Cell {
  x: number;
  y: number;
}
interface Food extends Cell {
  id: number;
  kind: 'normal' | 'special' | 'golden';
  value: number;
  ownerId?: string;
  ownerName?: string;
  born: number;
}

interface SnakeState {
  cols: number;
  rows: number;
  body: Cell[];
  dir: Dir;
  grow: number;
  stepAcc: number;
  boostMult: number;
  boostUntil: number;
  manualUntil: number;
  manualDir: Dir | null;
  foods: Food[];
  obstacles: Cell[];
  eaten: number;
  best: number;
  deaths: number;
  alive: boolean;
}

export interface SnakeSnapshot extends BaseSnapshot {
  board: { x: number; y: number; cell: number; cols: number; rows: number };
  body: Cell[];
  dir: Dir;
  foods: Array<{ id: number; x: number; y: number; kind: Food['kind']; owner?: string; value: number }>;
  obstacles: Cell[];
  length: number;
  best: number;
  boost: number;
  manual: boolean;
  alive: boolean;
}

const DIRS: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const CELL = 54;

export class SnakeLive extends BaseGame<SnakeSnapshot, SnakeState> {
  protected st: SnakeState;
  private readonly boardX: number;
  private readonly boardY: number;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    const top = this.aspect === 'vertical' ? 420 : 170;
    const bottom = this.aspect === 'vertical' ? 520 : 120;
    const side = this.aspect === 'vertical' ? 54 : 480;
    const cols = Math.floor((this.W - side * 2) / CELL);
    const rows = Math.floor((this.H - top - bottom) / CELL);
    this.boardX = Math.floor((this.W - cols * CELL) / 2);
    this.boardY = top;
    this.st = {
      cols, rows, body: [], dir: 'right', grow: 0, stepAcc: 0, boostMult: 1, boostUntil: 0,
      manualUntil: 0, manualDir: null, foods: [], obstacles: [], eaten: 0, best: 0, deaths: 0, alive: true,
    };
    this.resetRound();
  }

  protected resetRound(): void {
    const s = this.st;
    const cy = Math.floor(s.rows / 2);
    const cx = Math.floor(s.cols / 3);
    s.body = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    s.dir = 'right';
    s.grow = 0;
    s.eaten = 0;
    s.alive = true;
    s.boostUntil = 0;
    s.foods = [];
    s.obstacles = [];
    for (let i = 0; i < this.num('startObstacles'); i++) this.placeObstacle();
    this.refillFood();
  }

  // ----- grade -----
  private key(c: Cell): number {
    return c.y * this.st.cols + c.x;
  }
  private occupied(): Set<number> {
    const set = new Set<number>();
    for (const c of this.st.body) set.add(this.key(c));
    for (const c of this.st.obstacles) set.add(this.key(c));
    for (const f of this.st.foods) set.add(this.key(f));
    return set;
  }
  private freeCell(minDistFromHead = 0): Cell | null {
    const occ = this.occupied();
    const head = this.st.body[0];
    for (let tries = 0; tries < 200; tries++) {
      const c = { x: this.rng.int(0, this.st.cols - 1), y: this.rng.int(0, this.st.rows - 1) };
      if (occ.has(this.key(c))) continue;
      if (head && Math.abs(head.x - c.x) + Math.abs(head.y - c.y) < minDistFromHead) continue;
      return c;
    }
    return null;
  }
  private placeObstacle(): void {
    const c = this.freeCell(5);
    if (c && this.st.obstacles.length < 60) this.st.obstacles.push(c);
  }
  private addFood(kind: Food['kind'], value: number, owner?: { id: string; name: string }): void {
    if (this.st.foods.length >= 40) {
      // remove a comida normal mais antiga para dar espaço
      const idx = this.st.foods.findIndex((f) => f.kind === 'normal');
      if (idx < 0) return;
      this.st.foods.splice(idx, 1);
    }
    const c = this.freeCell(3);
    if (!c) return;
    const food: Food = { ...c, id: this.nextId(), kind, value, born: this.b.t };
    if (owner) {
      food.ownerId = owner.id;
      food.ownerName = owner.name;
    }
    this.st.foods.push(food);
    this.emitFx(kind === 'golden' ? 'spawn-golden' : 'spawn', this.cx(c.x), this.cy(c.y), { color: kind === 'golden' ? '#facc15' : '#f472b6' });
  }
  private refillFood(): void {
    const target = this.num('foodCount');
    let normals = this.st.foods.filter((f) => f.kind === 'normal').length;
    while (normals < target) {
      const before = this.st.foods.length;
      this.addFood('normal', 1);
      if (this.st.foods.length === before) break;
      normals++;
    }
  }
  private cx(x: number): number {
    return this.boardX + x * CELL + CELL / 2;
  }
  private cy(y: number): number {
    return this.boardY + y * CELL + CELL / 2;
  }

  // ----- piloto automático (BFS até a comida mais valiosa/próxima) -----
  private blocked(c: Cell, occ: Set<number>): boolean {
    if (c.x < 0 || c.y < 0 || c.x >= this.st.cols || c.y >= this.st.rows) return true;
    return occ.has(this.key(c));
  }
  private wrap(c: Cell): Cell {
    if (!this.setting<boolean>('wrapWalls')) return c;
    return { x: (c.x + this.st.cols) % this.st.cols, y: (c.y + this.st.rows) % this.st.rows };
  }
  private autopilot(): Dir {
    const s = this.st;
    const head = s.body[0]!;
    const occ = new Set<number>();
    // a cauda se move no próximo passo, então não é obstáculo (exceto se crescendo)
    s.body.slice(0, s.grow > 0 ? s.body.length : s.body.length - 1).forEach((c) => occ.add(this.key(c)));
    s.obstacles.forEach((c) => occ.add(this.key(c)));
    const targets = new Map<number, Food>();
    for (const f of s.foods) targets.set(this.key(f), f);
    const prev = new Map<number, { from: number; dir: Dir }>();
    const start = this.key(head);
    const queue: Cell[] = [head];
    const seen = new Set<number>([start]);
    let found: number | null = null;
    while (queue.length && found === null) {
      const cur = queue.shift()!;
      for (const d of ['up', 'right', 'down', 'left'] as Dir[]) {
        const n = this.wrap({ x: cur.x + DIRS[d].x, y: cur.y + DIRS[d].y });
        const k = this.key(n);
        if (seen.has(k) || this.blocked(n, occ)) continue;
        seen.add(k);
        prev.set(k, { from: this.key(cur), dir: d });
        if (targets.has(k)) {
          found = k;
          break;
        }
        queue.push(n);
      }
    }
    if (found !== null) {
      let k = found;
      let step = prev.get(k)!;
      while (step.from !== start) {
        k = step.from;
        step = prev.get(k)!;
      }
      return step.dir;
    }
    // Sem caminho: escolhe a direção com mais espaço livre (evita morte imediata).
    let best: Dir = s.dir;
    let bestSpace = -1;
    for (const d of ['up', 'right', 'down', 'left'] as Dir[]) {
      if (d === OPPOSITE[s.dir]) continue;
      const n = this.wrap({ x: head.x + DIRS[d].x, y: head.y + DIRS[d].y });
      if (this.blocked(n, occ)) continue;
      const space = this.floodSize(n, occ, 80);
      if (space > bestSpace) {
        bestSpace = space;
        best = d;
      }
    }
    return best;
  }
  private floodSize(from: Cell, occ: Set<number>, cap: number): number {
    const seen = new Set<number>([this.key(from)]);
    const q = [from];
    while (q.length && seen.size < cap) {
      const c = q.shift()!;
      for (const d of Object.values(DIRS)) {
        const n = this.wrap({ x: c.x + d.x, y: c.y + d.y });
        const k = this.key(n);
        if (seen.has(k) || this.blocked(n, occ)) continue;
        seen.add(k);
        q.push(n);
      }
    }
    return seen.size;
  }

  // ----- simulação -----
  protected update(dt: number): void {
    const s = this.st;
    if (!s.alive) return;
    if (s.boostUntil && this.b.t > s.boostUntil) {
      s.boostUntil = 0;
      s.boostMult = 1;
    }
    const speed = this.num('baseSpeed') * (s.boostUntil ? s.boostMult : 1) * (1 + Math.min(0.6, s.body.length / 120));
    s.stepAcc += dt * speed;
    while (s.stepAcc >= 1 && s.alive) {
      s.stepAcc -= 1;
      this.step();
    }
  }

  private step(): void {
    const s = this.st;
    const manual = s.manualDir && this.b.t < s.manualUntil;
    let dir = manual ? s.manualDir! : this.autopilot();
    if (dir === OPPOSITE[s.dir]) dir = s.dir;
    // Segurança: o comando do público nunca leva a uma colisão imediata.
    if (manual && this.wouldCollide(dir)) dir = this.autopilot();
    s.dir = dir;
    const head = s.body[0]!;
    const next = this.wrap({ x: head.x + DIRS[dir].x, y: head.y + DIRS[dir].y });
    const tailMoves = s.grow === 0;
    const bodyToCheck = tailMoves ? s.body.slice(0, -1) : s.body;
    const hitWall = next.x < 0 || next.y < 0 || next.x >= s.cols || next.y >= s.rows;
    const hitSelf = bodyToCheck.some((c) => c.x === next.x && c.y === next.y);
    const hitObstacle = s.obstacles.some((c) => c.x === next.x && c.y === next.y);
    if (hitWall || hitSelf || hitObstacle) {
      this.die(hitWall ? 'na parede' : hitSelf ? 'no próprio corpo' : 'em um obstáculo');
      return;
    }
    s.body.unshift(next);
    if (s.grow > 0) s.grow--;
    else s.body.pop();
    const fi = s.foods.findIndex((f) => f.x === next.x && f.y === next.y);
    if (fi >= 0) {
      const f = s.foods[fi]!;
      s.foods.splice(fi, 1);
      s.eaten++;
      s.grow += f.kind === 'golden' ? 5 : f.kind === 'special' ? 2 : 1;
      this.emitFx(f.kind === 'normal' ? 'eat' : 'eat-special', this.cx(next.x), this.cy(next.y), {
        color: f.kind === 'golden' ? '#facc15' : f.kind === 'special' ? '#f472b6' : '#4ade80',
        text: f.ownerName ? `+${f.value} ${f.ownerName}` : undefined,
      });
      if (f.ownerId) {
        this.addScore({ id: f.ownerId, nickname: f.ownerName }, f.value, 'snake-food');
        if (f.kind === 'golden') this.notice(`✨ ${f.ownerName} alimentou a cobra com ouro!`, '#facc15');
      }
      this.refillFood();
    }
    s.best = Math.max(s.best, s.body.length);
  }

  private wouldCollide(dir: Dir): boolean {
    const s = this.st;
    const head = s.body[0]!;
    const n = this.wrap({ x: head.x + DIRS[dir].x, y: head.y + DIRS[dir].y });
    if (n.x < 0 || n.y < 0 || n.x >= s.cols || n.y >= s.rows) return true;
    const body = s.grow === 0 ? s.body.slice(0, -1) : s.body;
    return body.some((c) => c.x === n.x && c.y === n.y) || s.obstacles.some((c) => c.x === n.x && c.y === n.y);
  }

  private die(reason: string): void {
    const s = this.st;
    s.alive = false;
    s.deaths++;
    const head = s.body[0]!;
    this.emitFx('death', this.cx(head.x), this.cy(head.y), { color: '#ef4444' });
    this.notice(`💥 A cobra bateu ${reason}! Tamanho: ${s.body.length}`, '#f87171');
    const top = this.leaderboard(1, true)[0];
    this.endRound(top ? { id: top.id, name: top.name, score: top.score } : undefined, { length: s.body.length, eaten: s.eaten, reason }, 5);
  }

  protected onAction(a: GameActionMessage, q: number): void {
    const s = this.st;
    const who = a.viewer ? { id: a.viewer.id, name: viewerName(a.viewer) } : undefined;
    switch (a.actionId) {
      case 'speed_boost': {
        s.boostMult = Math.min(3, Math.max(s.boostMult, this.param(a, 'multiplier', 1.5)));
        s.boostUntil = Math.max(s.boostUntil, this.b.t) + this.param(a, 'duration', 5) * Math.min(q, 3);
        this.notice('⚡ Turbo ativado pelas curtidas!', '#fde047', 3);
        this.emitFx('boost', this.cx(s.body[0]?.x ?? 0), this.cy(s.body[0]?.y ?? 0), { color: '#fde047' });
        break;
      }
      case 'special_food':
        for (let i = 0; i < Math.min(q, 10); i++) this.addFood('special', this.param(a, 'value', 10), who);
        if (who) this.notice(`🍬 ${who.name} criou ${q > 1 ? q + ' comidas' : 'uma comida'}!`, '#f472b6', 3);
        break;
      case 'golden_food':
        this.addFood('golden', this.param(a, 'value', 100), who);
        break;
      case 'shuffle_obstacles': {
        const n = this.param(a, 'count', 8);
        s.obstacles = [];
        for (let i = 0; i < n; i++) this.placeObstacle();
        this.notice('🧱 Obstáculos embaralhados!', '#93c5fd', 3);
        break;
      }
      case 'add_obstacles':
        for (let i = 0; i < this.param(a, 'count', 2) * Math.min(q, 3); i++) this.placeObstacle();
        break;
      case 'clear_obstacles':
        s.obstacles = [];
        break;
      case 'steer': {
        if (!this.setting<boolean>('chatControl')) break;
        const d = String(a.params.dir ?? '') as Dir;
        if (!(d in DIRS)) break;
        s.manualDir = d;
        s.manualUntil = this.b.t + this.num('chatControlSeconds');
        if (who) this.addScore(a.viewer, 1, 'snake-steer');
        break;
      }
    }
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    if (sig.type === 'GIFT') this.addScore(sig.viewer, Math.max(1, Math.round(sig.value)), 'gift');
  }

  snapshot(): SnakeSnapshot {
    const s = this.st;
    return {
      ...this.baseSnapshot(),
      board: { x: this.boardX, y: this.boardY, cell: CELL, cols: s.cols, rows: s.rows },
      body: s.body,
      dir: s.dir,
      foods: s.foods.map((f) => ({ id: f.id, x: f.x, y: f.y, kind: f.kind, owner: f.ownerName, value: f.value })),
      obstacles: s.obstacles,
      length: s.body.length,
      best: s.best,
      boost: s.boostUntil ? Math.max(0, Math.round((s.boostUntil - this.b.t) * 10) / 10) : 0,
      manual: !!s.manualDir && this.b.t < s.manualUntil,
      alive: s.alive,
    };
  }
}
