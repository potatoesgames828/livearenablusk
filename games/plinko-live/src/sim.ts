import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId?: string;
  ownerName?: string;
  value: number;
  golden: boolean;
  age: number;
}
interface Pin {
  x: number;
  y: number;
}

interface PlinkoState {
  balls: Ball[];
  lanes: Record<string, 'left' | 'mid' | 'right'>;
  autoTimer: number;
  roundTime: number;
  boostUntil: number;
  landed: number;
  lastHits: number[];
  bestDrop: { name: string; points: number } | null;
}

export interface PlinkoSnapshot extends BaseSnapshot {
  pins: Pin[];
  pinRadius: number;
  ballRadius: number;
  slots: Array<{ x: number; w: number; mult: number }>;
  slotY: number;
  balls: Array<{ id: number; x: number; y: number; golden: boolean; owner?: string }>;
  boost: boolean;
  timeLeft: number;
  lastHits: number[];
  bestDrop: { name: string; points: number } | null;
  board: { x: number; y: number; w: number; h: number };
}

const MULTS_BY_COUNT: Record<number, number[]> = {};
function multipliersFor(n: number): number[] {
  if (MULTS_BY_COUNT[n]) return MULTS_BY_COUNT[n]!;
  // Distribuição simétrica: bordas valem mais (menos prováveis), centro vale menos.
  const half = Math.ceil(n / 2);
  const scale = [0.3, 0.5, 1, 1.5, 2, 3, 5, 10, 25, 50];
  const left: number[] = [];
  for (let i = 0; i < half; i++) left.push(scale[Math.min(scale.length - 1, half - 1 - i)] ?? 1);
  const full = [...left, ...left.slice(0, Math.floor(n / 2)).reverse()];
  MULTS_BY_COUNT[n] = full;
  return full;
}

const PIN_R = 9;
const BALL_R = 16;
const G = 1800;

export class PlinkoLive extends BaseGame<PlinkoSnapshot, PlinkoState> {
  protected st: PlinkoState;
  private pins: Pin[] = [];
  private grid = new Map<number, Pin[]>();
  private board: PlinkoSnapshot['board'];
  private slots: PlinkoSnapshot['slots'] = [];
  private slotY = 0;
  private readonly cellSize = 80;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    const vertical = this.aspect === 'vertical';
    const bw = vertical ? this.W - 80 : Math.min(1100, this.W - 900);
    const bx = (this.W - bw) / 2;
    const by = vertical ? 420 : 150;
    const bh = vertical ? this.H - by - 600 : this.H - by - 90;
    this.board = { x: bx, y: by, w: bw, h: bh };
    this.buildBoard();
    this.st = { balls: [], lanes: {}, autoTimer: 1, roundTime: 0, boostUntil: 0, landed: 0, lastHits: [], bestDrop: null };
  }

  private buildBoard(): void {
    const rows = this.num('rows');
    const { x, y, w, h } = this.board;
    const top = y + 80;
    const slotH = 90;
    const spacingY = (h - 80 - slotH - 40) / rows;
    const spacingX = w / (rows + 2);
    this.pins = [];
    for (let r = 0; r < rows; r++) {
      const count = r + 3;
      const rowW = (count - 1) * spacingX;
      for (let i = 0; i < count; i++) {
        this.pins.push({ x: x + w / 2 - rowW / 2 + i * spacingX, y: top + r * spacingY });
      }
    }
    const lastCount = rows + 2;
    const lastRowW = (lastCount - 1) * spacingX;
    const left = x + w / 2 - lastRowW / 2;
    const mults = multipliersFor(lastCount - 1);
    this.slots = mults.map((mult, i) => ({ x: left + i * spacingX, w: spacingX, mult }));
    this.slotY = top + rows * spacingY + 10;
    this.grid.clear();
    for (const p of this.pins) {
      const k = this.cellKey(p.x, p.y);
      const arr = this.grid.get(k) ?? [];
      arr.push(p);
      this.grid.set(k, arr);
    }
  }

  private cellKey(x: number, y: number): number {
    return Math.floor(x / this.cellSize) * 100000 + Math.floor(y / this.cellSize);
  }

  protected resetRound(): void {
    this.st.balls = [];
    this.st.roundTime = 0;
    this.st.landed = 0;
    this.st.lastHits = [];
  }

  private drop(owner: { id: string; name: string } | undefined, value: number, golden = false): void {
    const s = this.st;
    if (s.balls.length >= this.num('maxBalls')) {
      // descarta a bola mais antiga sem dono para abrir espaço
      const idx = s.balls.findIndex((b) => !b.ownerId);
      if (idx >= 0) s.balls.splice(idx, 1);
      else return;
    }
    const lane = owner ? s.lanes[owner.id] ?? 'mid' : this.rng.pick(['left', 'mid', 'right'] as const);
    const cx = this.board.x + this.board.w / 2;
    const off = lane === 'left' ? -this.board.w * 0.16 : lane === 'right' ? this.board.w * 0.16 : 0;
    const b: Ball = {
      id: this.nextId(), x: cx + off + this.rng.range(-18, 18), y: this.board.y + 20,
      vx: this.rng.range(-40, 40), vy: 0, value, golden, age: 0,
    };
    if (owner) {
      b.ownerId = owner.id;
      b.ownerName = owner.name;
    }
    s.balls.push(b);
  }

  protected update(dt: number): void {
    const s = this.st;
    s.roundTime += dt;
    const every = this.num('autoDropEvery');
    if (every > 0) {
      s.autoTimer -= dt;
      if (s.autoTimer <= 0) {
        s.autoTimer = every;
        this.drop(undefined, 1);
      }
    }
    const steps = 4;
    const h = dt / steps;
    const e = this.num('bounciness');
    const minX = this.board.x + BALL_R;
    const maxX = this.board.x + this.board.w - BALL_R;
    const rr = (PIN_R + BALL_R) ** 2;
    for (let k = 0; k < steps; k++) {
      for (const b of s.balls) {
        b.vy += G * h;
        b.x += b.vx * h;
        b.y += b.vy * h;
        if (b.x < minX) {
          b.x = minX;
          b.vx = Math.abs(b.vx) * e;
        } else if (b.x > maxX) {
          b.x = maxX;
          b.vx = -Math.abs(b.vx) * e;
        }
        // colisão com pinos próximos (grade espacial)
        const gx = Math.floor(b.x / this.cellSize);
        const gy = Math.floor(b.y / this.cellSize);
        for (let ix = gx - 1; ix <= gx + 1; ix++) {
          for (let iy = gy - 1; iy <= gy + 1; iy++) {
            const cell = this.grid.get(ix * 100000 + iy);
            if (!cell) continue;
            for (const p of cell) {
              const dx = b.x - p.x;
              const dy = b.y - p.y;
              const d2 = dx * dx + dy * dy;
              if (d2 >= rr || d2 === 0) continue;
              const d = Math.sqrt(d2);
              const nx = dx / d;
              const ny = dy / d;
              b.x = p.x + nx * (PIN_R + BALL_R);
              b.y = p.y + ny * (PIN_R + BALL_R);
              const vn = b.vx * nx + b.vy * ny;
              if (vn < 0) {
                b.vx -= (1 + e) * vn * nx;
                b.vy -= (1 + e) * vn * ny;
                // pequena aleatoriedade determinística evita equilíbrio sobre o pino
                b.vx += this.rng.range(-25, 25);
              }
            }
          }
        }
      }
    }
    // chegada aos slots
    const keep: Ball[] = [];
    for (const b of s.balls) {
      b.age += dt;
      if (b.y < this.slotY && b.age < 25) {
        keep.push(b);
        continue;
      }
      const slot = this.slots.find((sl) => b.x >= sl.x && b.x < sl.x + sl.w) ?? this.slots[b.x < this.board.x + this.board.w / 2 ? 0 : this.slots.length - 1]!;
      const mult = slot.mult * (s.boostUntil > this.b.t ? 2 : 1) * (b.golden ? 5 : 1);
      const pts = Math.round(b.value * mult);
      s.landed++;
      s.lastHits = [...s.lastHits, slot.mult].slice(-8);
      this.emitFx(mult >= 10 ? 'jackpot' : 'land', b.x, this.slotY + 40, {
        color: mult >= 10 ? '#facc15' : mult >= 2 ? '#a855f7' : '#64748b',
        text: b.ownerName ? `${b.ownerName} +${pts}` : `x${slot.mult}`,
      });
      if (b.ownerId) {
        this.addScore({ id: b.ownerId, nickname: b.ownerName }, pts, 'plinko');
        if (!s.bestDrop || pts > s.bestDrop.points) s.bestDrop = { name: b.ownerName ?? '', points: pts };
        if (mult >= 10) this.notice(`🎯 ${b.ownerName} acertou x${mult}! +${pts} pontos`, '#facc15');
      }
    }
    s.balls = keep;
    if (s.roundTime >= this.num('roundSeconds')) {
      const top = this.leaderboard(1, true)[0];
      this.endRound(top ? { id: top.id, name: top.name, score: top.score } : undefined, { landed: s.landed, best: s.bestDrop }, 6);
    }
  }

  protected onAction(a: GameActionMessage, q: number): void {
    const who = a.viewer ? { id: a.viewer.id, name: viewerName(a.viewer) } : undefined;
    switch (a.actionId) {
      case 'drop_ball':
        for (let i = 0; i < Math.min(q, 15); i++) this.drop(who, this.param(a, 'value', 10));
        break;
      case 'drop_golden':
        this.drop(who, this.param(a, 'value', 100), true);
        if (who) this.notice(`🌟 ${who.name} soltou uma bola dourada!`, '#facc15', 3);
        break;
      case 'community_drop':
        for (let i = 0; i < Math.min(this.param(a, 'count', 3) * q, 20); i++) this.drop(undefined, 1);
        break;
      case 'choose_lane': {
        if (!a.viewer) break;
        const lane = String(a.params.lane ?? 'mid');
        if (lane === 'left' || lane === 'mid' || lane === 'right') this.st.lanes[a.viewer.id] = lane;
        const keys = Object.keys(this.st.lanes);
        if (keys.length > 3000) for (const k of keys.slice(0, 500)) delete this.st.lanes[k];
        break;
      }
      case 'multiplier_boost':
        this.st.boostUntil = Math.max(this.st.boostUntil, this.b.t) + this.param(a, 'duration', 10);
        this.notice('✨ Multiplicadores em DOBRO!', '#a855f7', 3);
        this.emitFx('boost', this.W / 2, this.slotY, { color: '#a855f7' });
        break;
    }
  }

  protected override onSignal(_sig: ViewerSignalMessage): void {}

  snapshot(): PlinkoSnapshot {
    const s = this.st;
    return {
      ...this.baseSnapshot(),
      pins: this.pins,
      pinRadius: PIN_R,
      ballRadius: BALL_R,
      slots: this.slots,
      slotY: this.slotY,
      balls: s.balls.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), golden: b.golden, owner: b.ownerName })),
      boost: s.boostUntil > this.b.t,
      timeLeft: Math.max(0, Math.ceil(this.num('roundSeconds') - s.roundTime)),
      lastHits: s.lastHits,
      bestDrop: s.bestDrop,
      board: this.board,
    };
  }
}
