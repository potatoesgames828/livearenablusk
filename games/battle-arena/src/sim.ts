import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

export type Team = 'red' | 'blue';

interface Champion {
  team: Team;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shieldUntil: number;
  energy: number;
  anim: number; // tempo restante da animação de ataque
  hitAnim: number;
  autoTimer: number;
}
interface Minion {
  id: number;
  team: Team;
  x: number;
  y: number;
  hp: number;
  cd: number;
  owner?: string;
}
interface Projectile {
  id: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  kind: 'bolt' | 'special' | 'minion' | 'super';
  ownerId?: string;
  ownerName?: string;
}

interface BattleState {
  champs: Record<Team, Champion>;
  minions: Minion[];
  projectiles: Projectile[];
  teams: Record<string, Team>;
  members: Record<Team, number>;
  damage: Record<string, number>;
  roundTime: number;
  wins: Record<Team, number>;
}

export interface BattleSnapshot extends BaseSnapshot {
  champs: Array<{ team: Team; x: number; y: number; hp: number; maxHp: number; shield: boolean; energy: number; anim: number; hit: number }>;
  minions: Array<{ id: number; team: Team; x: number; y: number; hp: number }>;
  projectiles: Array<{ id: number; team: Team; x: number; y: number; kind: Projectile['kind'] }>;
  members: Record<Team, number>;
  wins: Record<Team, number>;
  timeLeft: number;
  mvp?: { name: string; damage: number };
}

const MINION_HP = 120;

export class BattleArena extends BaseGame<BattleSnapshot, BattleState> {
  protected st: BattleState;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.st = {
      champs: { red: this.newChamp('red'), blue: this.newChamp('blue') },
      minions: [],
      projectiles: [],
      teams: {},
      members: { red: 0, blue: 0 },
      damage: {},
      roundTime: 0,
      wins: { red: 0, blue: 0 },
    };
  }

  private newChamp(team: Team): Champion {
    const vertical = this.aspect === 'vertical';
    const hp = this.num('championHp');
    return {
      team,
      x: vertical ? this.W / 2 : team === 'red' ? this.W * 0.2 : this.W * 0.8,
      y: vertical ? (team === 'red' ? this.H * 0.72 : this.H * 0.32) : this.H * 0.56,
      hp, maxHp: hp, shieldUntil: 0, energy: 0, anim: 0, hitAnim: 0,
      autoTimer: team === 'red' ? 0 : this.num('autoAttackEvery') / 2,
    };
  }

  protected resetRound(): void {
    const s = this.st;
    s.champs = { red: this.newChamp('red'), blue: this.newChamp('blue') };
    s.minions = [];
    s.projectiles = [];
    s.damage = {};
    s.roundTime = 0;
  }

  private other(t: Team): Team {
    return t === 'red' ? 'blue' : 'red';
  }

  private teamOf(viewer?: { id: string }): Team {
    const s = this.st;
    if (viewer?.id && s.teams[viewer.id]) return s.teams[viewer.id]!;
    const team: Team = s.members.red <= s.members.blue ? 'red' : 'blue';
    if (viewer?.id) this.assign(viewer.id, team);
    return team;
  }

  private assign(id: string, team: Team): void {
    const s = this.st;
    const prev = s.teams[id];
    if (prev === team) return;
    if (prev) s.members[prev] = Math.max(0, s.members[prev] - 1);
    s.teams[id] = team;
    s.members[team]++;
    // limita o mapa de times (memória)
    const ids = Object.keys(s.teams);
    if (ids.length > 3000) for (const k of ids.slice(0, 500)) delete s.teams[k];
  }

  private fire(from: Team, dmg: number, kind: Projectile['kind'], owner?: { id: string; name: string }, sx?: number, sy?: number): void {
    const s = this.st;
    if (s.projectiles.length > 120) return;
    const c = s.champs[from];
    const target = s.champs[this.other(from)];
    const x = sx ?? c.x;
    const y = sy ?? c.y;
    const dx = target.x - x;
    const dy = target.y - y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = kind === 'special' || kind === 'super' ? 900 : 1300;
    const spread = kind === 'minion' ? 0 : this.rng.range(-0.08, 0.08);
    const p: Projectile = {
      id: this.nextId(), team: from, x, y,
      vx: (dx / len) * speed + spread * speed * (-dy / len),
      vy: (dy / len) * speed + spread * speed * (dx / len),
      dmg, kind,
    };
    if (owner) {
      p.ownerId = owner.id;
      p.ownerName = owner.name;
    }
    s.projectiles.push(p);
    if (!sx) c.anim = 0.3;
  }

  private damageChamp(team: Team, dmg: number, by?: { id?: string; name?: string }): void {
    const c = this.st.champs[team];
    if (c.hp <= 0) return;
    if (c.shieldUntil > this.b.t) {
      this.emitFx('shield-block', c.x, c.y - 40, { color: '#38bdf8' });
      return;
    }
    c.hp = Math.max(0, c.hp - dmg);
    c.hitAnim = 0.25;
    this.emitFx('damage', c.x, c.y - 120, { text: `-${Math.round(dmg)}`, color: team === 'red' ? '#fb7185' : '#60a5fa' });
    if (by?.id) {
      this.st.damage[by.id] = (this.st.damage[by.id] ?? 0) + dmg;
      this.addScore({ id: by.id, nickname: by.name }, Math.max(1, Math.round(dmg / 10)), 'battle-damage');
    }
    if (c.hp <= 0) this.finish(this.other(team));
  }

  private finish(winner: Team): void {
    const s = this.st;
    s.wins[winner]++;
    const loser = s.champs[this.other(winner)];
    this.emitFx('ko', loser.x, loser.y, { color: winner === 'red' ? '#f43f5e' : '#3b82f6' });
    const mvp = this.mvp(winner);
    this.notice(`${winner === 'red' ? '🔴 Time Vermelho' : '🔵 Time Azul'} venceu!`, winner === 'red' ? '#fb7185' : '#60a5fa', 6);
    this.endRound(mvp ? { id: mvp.id, name: mvp.name, score: Math.round(mvp.damage) } : undefined, { winner, wins: { ...s.wins } }, 7);
  }

  private mvp(team?: Team): { id: string; name: string; damage: number } | undefined {
    let best: { id: string; name: string; damage: number } | undefined;
    for (const [id, dmg] of Object.entries(this.st.damage)) {
      if (team && this.st.teams[id] !== team) continue;
      if (!best || dmg > best.damage) best = { id, name: this.b.viewers[id]?.name ?? 'Espectador', damage: dmg };
    }
    return best;
  }

  protected update(dt: number): void {
    const s = this.st;
    s.roundTime += dt;
    for (const team of ['red', 'blue'] as Team[]) {
      const c = s.champs[team];
      c.anim = Math.max(0, c.anim - dt);
      c.hitAnim = Math.max(0, c.hitAnim - dt);
      c.autoTimer -= dt;
      if (c.autoTimer <= 0) {
        c.autoTimer = this.num('autoAttackEvery');
        const dmg = this.num('autoAttackDamage');
        if (dmg > 0) this.fire(team, dmg, 'bolt');
      }
      if (c.energy >= 100) {
        c.energy = 0;
        this.notice(`💥 SUPER ATAQUE do ${team === 'red' ? 'Vermelho' : 'Azul'}!`, '#fde047', 3);
        for (let i = 0; i < 5; i++) this.fire(team, 80, 'super');
        this.emitFx('super', c.x, c.y, { color: '#fde047' });
      }
    }
    // Soldados caminham em direção ao campeão inimigo e atiram
    for (const m of s.minions) {
      const target = s.champs[this.other(m.team)];
      const dx = target.x - m.x;
      const dy = target.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d > 320) {
        m.x += (dx / d) * 90 * dt;
        m.y += (dy / d) * 90 * dt;
      }
      m.cd -= dt;
      if (m.cd <= 0) {
        m.cd = 1.6 + this.rng.next();
        this.fire(m.team, 12, 'minion', undefined, m.x, m.y);
      }
    }
    // Projéteis
    const keep: Projectile[] = [];
    for (const p of s.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const target = s.champs[this.other(p.team)];
      // colisão com soldados inimigos
      let consumed = false;
      for (const m of s.minions) {
        if (m.team === p.team || m.hp <= 0) continue;
        if ((m.x - p.x) ** 2 + (m.y - p.y) ** 2 < 40 ** 2) {
          m.hp -= p.dmg;
          this.emitFx('spark', m.x, m.y, { color: '#fde047' });
          consumed = p.kind !== 'special';
          if (consumed) break;
        }
      }
      if (!consumed && (target.x - p.x) ** 2 + (target.y - p.y) ** 2 < 90 ** 2) {
        this.damageChamp(target.team, p.dmg, { id: p.ownerId, name: p.ownerName });
        this.emitFx(p.kind === 'special' || p.kind === 'super' ? 'explode' : 'hit', p.x, p.y, { color: p.team === 'red' ? '#fb7185' : '#60a5fa' });
        if (p.kind === 'special') {
          for (const m of s.minions) if (m.team !== p.team && (m.x - p.x) ** 2 + (m.y - p.y) ** 2 < 260 ** 2) m.hp -= p.dmg;
        }
        consumed = true;
      }
      if (this.b.phase !== 'playing') return; // rodada acabou neste tick
      if (!consumed && p.x > -100 && p.x < this.W + 100 && p.y > -100 && p.y < this.H + 100) keep.push(p);
    }
    s.projectiles = keep;
    const before = s.minions.length;
    s.minions = s.minions.filter((m) => {
      if (m.hp > 0) return true;
      this.emitFx('minion-down', m.x, m.y, { color: m.team === 'red' ? '#fb7185' : '#60a5fa' });
      return false;
    });
    void before;
    // Limite de tempo: vence quem tiver mais vida proporcional
    if (s.roundTime >= this.num('roundTimeLimit')) {
      const r = s.champs.red.hp / s.champs.red.maxHp;
      const b = s.champs.blue.hp / s.champs.blue.maxHp;
      this.finish(r >= b ? 'red' : 'blue');
    }
  }

  protected onAction(a: GameActionMessage, q: number): void {
    const s = this.st;
    const who = a.viewer ? { id: a.viewer.id, name: viewerName(a.viewer) } : undefined;
    const team = this.teamOf(a.viewer);
    const c = s.champs[team];
    switch (a.actionId) {
      case 'attack':
        for (let i = 0; i < Math.min(q, 20); i++) this.fire(team, this.param(a, 'damage', 60), 'bolt', who);
        break;
      case 'special':
        this.fire(team, this.param(a, 'damage', 300) * Math.min(q, 5), 'special', who);
        this.emitFx('charge', c.x, c.y, { color: '#fde047' });
        if (who) this.notice(`🌟 ${who.name} lançou um ESPECIAL!`, '#fde047', 3);
        break;
      case 'heal': {
        const amt = this.param(a, 'amount', 80) * Math.min(q, 10);
        c.hp = Math.min(c.maxHp, c.hp + amt);
        this.emitFx('heal', c.x, c.y - 80, { text: `+${Math.round(amt)}`, color: '#4ade80' });
        if (who) this.addScore(a.viewer, Math.max(1, Math.round(amt / 20)), 'battle-heal');
        break;
      }
      case 'shield':
        c.shieldUntil = Math.max(c.shieldUntil, this.b.t) + this.param(a, 'duration', 4);
        this.emitFx('shield', c.x, c.y, { color: '#38bdf8' });
        break;
      case 'charge_energy': {
        const amt = this.param(a, 'amount', 10) * q;
        if (a.viewer && s.teams[a.viewer.id]) c.energy = Math.min(100, c.energy + amt);
        else {
          s.champs.red.energy = Math.min(100, s.champs.red.energy + amt);
          s.champs.blue.energy = Math.min(100, s.champs.blue.energy + amt);
        }
        break;
      }
      case 'spawn_minion': {
        const losing: Team = s.champs.red.hp / s.champs.red.maxHp <= s.champs.blue.hp / s.champs.blue.maxHp ? 'red' : 'blue';
        const lc = s.champs[losing];
        if (s.minions.filter((m) => m.team === losing).length >= this.num('maxMinions')) break;
        const m: Minion = { id: this.nextId(), team: losing, x: lc.x + this.rng.range(-200, 200), y: lc.y + this.rng.range(-60, 60), hp: MINION_HP, cd: 1 };
        if (who) m.owner = who.name;
        s.minions.push(m);
        this.emitFx('summon', m.x, m.y, { color: losing === 'red' ? '#fb7185' : '#60a5fa' });
        break;
      }
      case 'join_team': {
        if (!a.viewer) break;
        const want = String(a.params.team ?? 'auto');
        const t: Team = want === 'red' || want === 'blue' ? want : s.members.red <= s.members.blue ? 'red' : 'blue';
        this.assign(a.viewer.id, t);
        this.addScore(a.viewer, 1, 'battle-join');
        if (who) this.notice(`${t === 'red' ? '🔴' : '🔵'} ${who.name} entrou no time ${t === 'red' ? 'Vermelho' : 'Azul'}`, t === 'red' ? '#fb7185' : '#60a5fa', 3);
        break;
      }
    }
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    if (sig.type === 'GIFT') this.addScore(sig.viewer, Math.max(1, Math.round(sig.value)), 'gift');
  }

  snapshot(): BattleSnapshot {
    const s = this.st;
    const mvp = this.mvp();
    return {
      ...this.baseSnapshot(),
      champs: (['red', 'blue'] as Team[]).map((t) => {
        const c = s.champs[t];
        return {
          team: t, x: Math.round(c.x), y: Math.round(c.y), hp: Math.round(c.hp), maxHp: c.maxHp,
          shield: c.shieldUntil > this.b.t, energy: Math.round(c.energy), anim: c.anim, hit: c.hitAnim,
        };
      }),
      minions: s.minions.map((m) => ({ id: m.id, team: m.team, x: Math.round(m.x), y: Math.round(m.y), hp: m.hp })),
      projectiles: s.projectiles.map((p) => ({ id: p.id, team: p.team, x: Math.round(p.x), y: Math.round(p.y), kind: p.kind })),
      members: { ...s.members },
      wins: { ...s.wins },
      timeLeft: Math.max(0, Math.ceil(this.num('roundTimeLimit') - s.roundTime)),
      mvp: mvp ? { name: mvp.name, damage: Math.round(mvp.damage) } : undefined,
    };
  }
}
