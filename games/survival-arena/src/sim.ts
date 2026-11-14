import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

type EnemyKind = 'grunt' | 'runner' | 'tank' | 'boss';
interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  lastHitBy?: string;
  lastHitName?: string;
}
interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  ally: boolean;
}
interface Ally {
  id: number;
  angle: number;
  until: number;
  cd: number;
  ownerId?: string;
  ownerName?: string;
}

interface SurvivalState {
  hp: number;
  maxHp: number;
  shield: number;
  wave: number;
  toSpawn: number;
  spawnTimer: number;
  waveCooldown: number;
  enemies: Enemy[];
  bullets: Bullet[];
  allies: Ally[];
  turretCd: number;
  turretBoostUntil: number;
  freezeUntil: number;
  kills: number;
  bestWave: number;
  aim: number;
}

export interface SurvivalSnapshot extends BaseSnapshot {
  core: { x: number; y: number; hp: number; maxHp: number; shield: number; aim: number; boosted: boolean };
  enemies: Array<{ id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number }>;
  bullets: Array<{ id: number; x: number; y: number; ally: boolean }>;
  allies: Array<{ id: number; x: number; y: number; owner?: string }>;
  wave: number;
  kills: number;
  bestWave: number;
  frozen: boolean;
  nextWaveIn: number;
}

const STATS: Record<EnemyKind, { hp: number; speed: number; dmg: number; points: number }> = {
  grunt: { hp: 40, speed: 70, dmg: 10, points: 2 },
  runner: { hp: 22, speed: 150, dmg: 6, points: 3 },
  tank: { hp: 180, speed: 40, dmg: 30, points: 8 },
  boss: { hp: 1800, speed: 28, dmg: 120, points: 80 },
};

export class SurvivalArena extends BaseGame<SurvivalSnapshot, SurvivalState> {
  protected st: SurvivalState;
  private readonly cx: number;
  private readonly cy: number;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.cx = this.W / 2;
    this.cy = this.aspect === 'vertical' ? this.H * 0.52 : this.H * 0.55;
    this.st = this.fresh(0);
    this.startWave();
  }

  private fresh(bestWave: number): SurvivalState {
    const hp = this.num('coreHp');
    return {
      hp, maxHp: hp, shield: 0, wave: 0, toSpawn: 0, spawnTimer: 0, waveCooldown: 0, enemies: [], bullets: [], allies: [],
      turretCd: 0, turretBoostUntil: 0, freezeUntil: 0, kills: 0, bestWave, aim: 0,
    };
  }

  private diff(): number {
    const d = this.setting<string>('difficulty');
    return d === 'easy' ? 0.7 : d === 'hard' ? 1.4 : 1;
  }

  protected resetRound(): void {
    this.st = this.fresh(this.st.bestWave);
    this.startWave();
  }

  private startWave(): void {
    const s = this.st;
    s.wave++;
    s.bestWave = Math.max(s.bestWave, s.wave);
    s.toSpawn = Math.floor((6 + s.wave * 3) * this.diff());
    s.spawnTimer = 0;
    if (s.wave % this.num('bossEvery') === 0) {
      this.spawn('boss');
      this.notice(`👹 CHEFE na onda ${s.wave}!`, '#f87171', 4);
    } else if (s.wave > 1) {
      this.notice(`🌊 Onda ${s.wave}`, '#67e8f9', 3);
    }
  }

  private spawn(kind: EnemyKind): void {
    const s = this.st;
    if (s.enemies.length >= this.num('maxEnemies')) return;
    const a = this.rng.range(0, Math.PI * 2);
    const r = Math.max(this.W, this.H) * 0.62;
    const scale = 1 + (s.wave - 1) * 0.12;
    const base = STATS[kind];
    const hp = base.hp * scale * this.diff();
    s.enemies.push({
      id: this.nextId(), kind,
      x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r,
      hp, maxHp: hp, speed: base.speed * (1 + (s.wave - 1) * 0.03), dmg: base.dmg * this.diff(),
    });
  }

  private hurt(e: Enemy, dmg: number, by?: { id: string; name: string }): void {
    e.hp -= dmg;
    if (by) {
      e.lastHitBy = by.id;
      e.lastHitName = by.name;
    }
  }

  private damageCore(dmg: number): void {
    const s = this.st;
    const absorbed = Math.min(s.shield, dmg);
    s.shield -= absorbed;
    s.hp = Math.max(0, s.hp - (dmg - absorbed));
    this.emitFx('core-hit', this.cx, this.cy, { color: absorbed > 0 ? '#38bdf8' : '#f87171' });
    if (s.hp <= 0) {
      this.emitFx('core-destroyed', this.cx, this.cy, { color: '#f87171' });
      this.notice(`💀 O núcleo caiu na onda ${s.wave}!`, '#f87171', 6);
      const top = this.leaderboard(1, true)[0];
      this.endRound(top ? { id: top.id, name: top.name, score: top.score } : undefined, { wave: s.wave, kills: s.kills }, 7);
    }
  }

  protected update(dt: number): void {
    const s = this.st;
    const frozen = s.freezeUntil > this.b.t;
    // spawns
    if (s.toSpawn > 0) {
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0) {
        s.spawnTimer = Math.max(0.15, 1.1 - s.wave * 0.05);
        const roll = this.rng.next();
        const kind: EnemyKind = s.wave >= 3 && roll < 0.12 ? 'tank' : s.wave >= 2 && roll < 0.4 ? 'runner' : 'grunt';
        this.spawn(kind);
        s.toSpawn--;
      }
    } else if (s.enemies.length === 0) {
      if (s.waveCooldown <= 0) s.waveCooldown = 3;
      s.waveCooldown -= dt;
      if (s.waveCooldown <= 0) {
        s.waveCooldown = 0;
        this.startWave();
      }
    }
    // inimigos
    for (const e of s.enemies) {
      const dx = this.cx - e.x;
      const dy = this.cy - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 90) {
        this.damageCore(e.dmg);
        e.hp = 0;
        e.lastHitBy = undefined;
        if (this.b.phase !== 'playing') return;
        continue;
      }
      const sp = e.speed * (frozen ? 0.25 : 1);
      e.x += (dx / d) * sp * dt;
      e.y += (dy / d) * sp * dt;
    }
    // torre
    s.turretCd -= dt;
    const rate = this.num('turretFireRate') * (s.turretBoostUntil > this.b.t ? 3 : 1);
    if (s.turretCd <= 0) {
      const target = this.nearest(this.cx, this.cy);
      if (target) {
        s.turretCd = 1 / rate;
        s.aim = Math.atan2(target.y - this.cy, target.x - this.cx);
        this.shoot(this.cx, this.cy, target, 14 + s.wave, false);
      }
    }
    // aliados
    s.allies = s.allies.filter((a) => a.until > this.b.t);
    for (const a of s.allies) {
      a.angle += dt * 1.6;
      a.cd -= dt;
      const ax = this.cx + Math.cos(a.angle) * 180;
      const ay = this.cy + Math.sin(a.angle) * 180;
      if (a.cd <= 0) {
        const t = this.nearest(ax, ay);
        if (t) {
          a.cd = 0.45;
          const b = this.shoot(ax, ay, t, 18, true);
          if (b && a.ownerId) (b as Bullet & { ownerId?: string; ownerName?: string }).ownerId = a.ownerId;
          if (b && a.ownerName) (b as Bullet & { ownerId?: string; ownerName?: string }).ownerName = a.ownerName;
        }
      }
    }
    // projéteis
    const keep: Bullet[] = [];
    for (const b of s.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let hit = false;
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        const r = e.kind === 'boss' ? 70 : e.kind === 'tank' ? 36 : 24;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < r * r) {
          const owner = b as Bullet & { ownerId?: string; ownerName?: string };
          this.hurt(e, b.dmg, owner.ownerId ? { id: owner.ownerId, name: owner.ownerName ?? '' } : undefined);
          hit = true;
          break;
        }
      }
      if (!hit && b.x > -50 && b.x < this.W + 50 && b.y > -50 && b.y < this.H + 50) keep.push(b);
    }
    s.bullets = keep;
    // remoção dos derrotados
    s.enemies = s.enemies.filter((e) => {
      if (e.hp > 0) return true;
      if (e.lastHitBy !== undefined || e.hp <= 0) {
        const pts = STATS[e.kind].points;
        s.kills++;
        this.emitFx(e.kind === 'boss' ? 'boss-down' : 'enemy-down', e.x, e.y, { color: e.kind === 'boss' ? '#f87171' : '#fbbf24' });
        if (e.lastHitBy) this.addScore({ id: e.lastHitBy, nickname: e.lastHitName }, pts, 'survival-kill');
        if (e.kind === 'boss') this.notice(`🏆 Chefe derrotado${e.lastHitName ? ` por ${e.lastHitName}` : ''}!`, '#facc15', 4);
      }
      return false;
    });
  }

  private nearest(x: number, y: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bd = Infinity;
    for (const e of this.st.enemies) {
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private shoot(x: number, y: number, t: Enemy, dmg: number, ally: boolean): Bullet | undefined {
    if (this.st.bullets.length > 200) return undefined;
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const b: Bullet = { id: this.nextId(), x, y, vx: (dx / d) * 1400, vy: (dy / d) * 1400, dmg, ally };
    this.st.bullets.push(b);
    return b;
  }

  protected onAction(a: GameActionMessage, q: number): void {
    const s = this.st;
    const who = a.viewer ? { id: a.viewer.id, name: viewerName(a.viewer) } : undefined;
    switch (a.actionId) {
      case 'special_attack': {
        const dmg = this.param(a, 'damage', 120) * Math.min(q, 10);
        const r = this.param(a, 'radius', 380);
        for (const e of s.enemies) if ((e.x - this.cx) ** 2 + (e.y - this.cy) ** 2 < r * r) this.hurt(e, dmg, who);
        this.emitFx('nova', this.cx, this.cy, { color: '#22d3ee', size: r });
        break;
      }
      case 'airstrike': {
        const targets = [...s.enemies].sort((x, y) => y.maxHp - x.maxHp).slice(0, this.param(a, 'bombs', 4));
        for (const t of targets) {
          for (const e of s.enemies) if ((e.x - t.x) ** 2 + (e.y - t.y) ** 2 < 150 ** 2) this.hurt(e, this.param(a, 'damage', 150), who);
          this.emitFx('bomb', t.x, t.y, { color: '#fb923c' });
        }
        if (who) this.notice(`✈️ ${who.name} pediu um bombardeio!`, '#fb923c', 3);
        break;
      }
      case 'reinforce':
        s.shield = Math.min(s.maxHp, s.shield + this.param(a, 'amount', 40) * q);
        this.emitFx('shield', this.cx, this.cy, { color: '#38bdf8' });
        break;
      case 'heal':
        s.hp = Math.min(s.maxHp, s.hp + this.param(a, 'amount', 100) * Math.min(q, 10));
        this.emitFx('heal', this.cx, this.cy, { color: '#4ade80' });
        if (who) this.addScore(a.viewer, 3, 'survival-heal');
        break;
      case 'turret_upgrade':
        s.turretBoostUntil = Math.max(s.turretBoostUntil, this.b.t) + this.param(a, 'duration', 8);
        this.notice('🔥 Torre turbinada!', '#fb923c', 3);
        break;
      case 'spawn_ally': {
        if (s.allies.length >= 8) break;
        const ally: Ally = { id: this.nextId(), angle: this.rng.range(0, Math.PI * 2), until: this.b.t + this.param(a, 'duration', 30), cd: 0.5 };
        if (who) {
          ally.ownerId = who.id;
          ally.ownerName = who.name;
        }
        s.allies.push(ally);
        if (who) this.notice(`🤖 ${who.name} convocou um drone!`, '#67e8f9', 3);
        break;
      }
      case 'freeze':
        s.freezeUntil = Math.max(s.freezeUntil, this.b.t) + this.param(a, 'duration', 3);
        this.emitFx('freeze', this.cx, this.cy, { color: '#bae6fd' });
        break;
    }
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    if (sig.type === 'GIFT') this.addScore(sig.viewer, Math.max(1, Math.round(sig.value)), 'gift');
  }

  snapshot(): SurvivalSnapshot {
    const s = this.st;
    return {
      ...this.baseSnapshot(),
      core: { x: this.cx, y: this.cy, hp: Math.round(s.hp), maxHp: s.maxHp, shield: Math.round(s.shield), aim: Math.round(s.aim * 100) / 100, boosted: s.turretBoostUntil > this.b.t },
      enemies: s.enemies.map((e) => ({ id: e.id, kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp), maxHp: Math.round(e.maxHp) })),
      bullets: s.bullets.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), ally: b.ally })),
      allies: s.allies.map((a) => ({ id: a.id, x: Math.round(this.cx + Math.cos(a.angle) * 180), y: Math.round(this.cy + Math.sin(a.angle) * 180), owner: a.ownerName })),
      wave: s.wave,
      kills: s.kills,
      bestWave: s.bestWave,
      frozen: s.freezeUntil > this.b.t,
      nextWaveIn: Math.ceil(s.waveCooldown),
    };
  }
}
