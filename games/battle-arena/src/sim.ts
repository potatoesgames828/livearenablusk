import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { MatchGame, clampN, type MatchBaseSnapshot, type Participant, type SimContext } from '@live-arena/game-engine';
import { manifest, TEAMS } from './manifest';

export type Weapon = 'pistol' | 'shotgun' | 'rocket' | 'cannon' | 'nuke' | 'meteor';
export type FighterAction = 'idle' | 'run' | 'attack' | 'hit' | 'dead' | 'cheer';

interface Fighter {
  id: number;
  pid: string;
  team: number;
  golem: boolean;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  cd: number;
  barrage: Weapon[];
  barrageCd: number;
  act: FighterAction;
  actT: number;
  hitT: number;
  dead: boolean;
  respawn: number;
  facing: 1 | -1;
  kills: number;
  wanderX: number;
  wanderY: number;
  wanderT: number;
  phase: number;
}

interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: number;
  w: Weapon;
  owner: number;
  ttl: number;
  tx: number;
  ty: number;
}

interface TeamState {
  kills: number;
  rage: number;
  shield: number;
}

interface State {
  fighters: Fighter[];
  projectiles: Projectile[];
  teams: TeamState[];
  sudden: boolean;
  botBarrageT: number;
}

export interface FighterView {
  id: number;
  pid: string;
  x: number;
  y: number;
  t: number;
  n: string;
  hp: number;
  mh: number;
  f: 1 | -1;
  a: FighterAction;
  at: number;
  ph: number;
  g?: 1;
  k: number;
  sh?: 1;
  cr?: 1;
  b?: 1;
  q?: number;
}

export interface BattleSnapshot extends MatchBaseSnapshot {
  fighters: FighterView[];
  projectiles: Array<{ id: number; x: number; y: number; vx: number; vy: number; w: Weapon; t: number }>;
  teamsLive: Array<{ name: string; color: string; kills: number; alive: number; total: number; rage: boolean; shield: boolean }>;
  mode: 'kills' | 'elimination' | 'timed';
  killsToWin: number;
  sudden: boolean;
  arena: { x0: number; y0: number; x1: number; y1: number; vertical: boolean };
  shake: boolean;
}

const WEAPON: Record<Weapon, { dmg: number; radius: number; speed: number }> = {
  pistol: { dmg: 1, radius: 0, speed: 1150 },
  shotgun: { dmg: 13, radius: 0, speed: 1300 },
  rocket: { dmg: 45, radius: 130, speed: 900 },
  cannon: { dmg: 70, radius: 90, speed: 1000 },
  nuke: { dmg: 150, radius: 380, speed: 650 },
  meteor: { dmg: 60, radius: 160, speed: 1300 },
};

export class BattleArena extends MatchGame<BattleSnapshot, State> {
  protected st: State;
  private readonly arena: { x0: number; y0: number; x1: number; y1: number };
  private readonly vertical: boolean;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.vertical = this.aspect === 'vertical';
    this.arena = this.vertical ? { x0: 70, y0: 330, x1: this.W - 70, y1: this.H - 250 } : { x0: 110, y0: 230, x1: this.W - 110, y1: this.H - 90 };
    this.teams = TEAMS.map((t, i) => ({ ...t, name: String(this.setting<string>(i === 0 ? 'teamAName' : 'teamBName') || t.name).slice(0, 16) }));
    this.st = { fighters: [], projectiles: [], teams: [this.newTeam(), this.newTeam()], sudden: false, botBarrageT: 6 };
    this.initMatch();
  }

  private newTeam(): TeamState {
    return { kills: 0, rage: 0, shield: 0 };
  }

  private get mode(): 'kills' | 'elimination' | 'timed' {
    const m = this.setting<string>('winMode');
    return m === 'elimination' || m === 'timed' ? m : 'kills';
  }

  // ---------- geometria ----------

  /** Metade da arena do time (vertical: 0 embaixo / 1 em cima; horizontal: 0 esquerda / 1 direita). */
  private half(team: number): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.arena;
    if (this.vertical) {
      const mid = (a.y0 + a.y1) / 2;
      return team === 0 ? { x0: a.x0, y0: mid + 60, x1: a.x1, y1: a.y1 } : { x0: a.x0, y0: a.y0 + 60, x1: a.x1, y1: mid - 60 };
    }
    const mid = (a.x0 + a.x1) / 2;
    return team === 0 ? { x0: a.x0, y0: a.y0 + 40, x1: mid - 60, y1: a.y1 } : { x0: mid + 60, y0: a.y0 + 40, x1: a.x1, y1: a.y1 };
  }

  private randomIn(r: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number } {
    return { x: this.rng.range(r.x0, r.x1), y: this.rng.range(r.y0, r.y1) };
  }

  // ---------- participantes ----------

  private spawnFighter(p: Participant): Fighter {
    const pos = this.randomIn(this.half(p.team));
    const hp = this.num('baseHp') || 100;
    const f: Fighter = {
      id: this.nextId(), pid: p.id, team: p.team, golem: false, name: p.name, x: pos.x, y: pos.y, vx: 0, vy: 0, hp, maxHp: hp,
      cd: this.rng.range(0.3, 1.2), barrage: [], barrageCd: 0, act: 'idle', actT: 0, hitT: 0, dead: false, respawn: 0,
      facing: p.team === 0 ? 1 : -1, kills: 0, wanderX: pos.x, wanderY: pos.y, wanderT: 0, phase: this.rng.range(0, 6),
    };
    this.st.fighters.push(f);
    this.emitFx('spawn', f.x, f.y, { color: this.teams[p.team]!.color });
    return f;
  }

  private heroOf(pid: string | undefined): Fighter | undefined {
    if (!pid) return undefined;
    return this.st.fighters.find((f) => f.pid === pid && !f.golem);
  }

  protected override onJoin(p: Participant): void {
    if (!this.heroOf(p.id)) this.spawnFighter(p);
    if (!p.bot) this.notice(`${p.name} entrou no ${this.teams[p.team]!.name}`, this.teams[p.team]!.color, 3);
  }

  protected override onLeave(p: Participant): void {
    this.st.fighters = this.st.fighters.filter((f) => f.pid !== p.id);
  }

  protected override onTeamChange(p: Participant): void {
    const f = this.heroOf(p.id);
    if (f) {
      f.team = p.team;
      const pos = this.randomIn(this.half(p.team));
      f.x = pos.x;
      f.y = pos.y;
    }
  }

  protected override onLobby(): void {
    this.st.projectiles = [];
    this.st.teams = [this.newTeam(), this.newTeam()];
    this.st.sudden = false;
    // golens saem; heróis voltam cheios de vida para sua metade
    this.st.fighters = this.st.fighters.filter((f) => !f.golem);
    const base = this.num('baseHp') || 100;
    for (const f of this.st.fighters) {
      const p = this.participant(f.pid);
      if (p) f.team = p.team;
      f.hp = f.maxHp = base;
      f.dead = false;
      f.barrage = [];
      f.kills = 0;
      f.act = 'idle';
      const pos = this.randomIn(this.half(f.team));
      f.x = pos.x;
      f.y = pos.y;
    }
  }

  protected onMatchStart(): void {
    this.notice('⚔️ LUTEM!', '#f43f5e', 3);
    this.emitFx('fight', this.W / 2, (this.arena.y0 + this.arena.y1) / 2);
  }

  // ---------- partida ----------

  private alive(team: number): Fighter[] {
    return this.st.fighters.filter((f) => f.team === team && !f.dead);
  }

  private nearestEnemy(f: Fighter): Fighter | undefined {
    let best: Fighter | undefined;
    let bd = Infinity;
    for (const o of this.st.fighters) {
      if (o.team === f.team || o.dead) continue;
      const d = (o.x - f.x) ** 2 + (o.y - f.y) ** 2;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private moveFighter(f: Fighter, dt: number, target: Fighter | undefined, fighting: boolean): void {
    let tx = f.wanderX;
    let ty = f.wanderY;
    f.wanderT -= dt;
    const half = this.half(f.team);
    if (f.golem && target && fighting) {
      tx = target.x;
      ty = target.y;
    } else if (target && fighting) {
      // aproxima da linha central para ficar ao alcance, sem sair da própria metade
      const range = 420;
      const d = Math.hypot(target.x - f.x, target.y - f.y);
      if (d > range) {
        tx = clampN(target.x, half.x0, half.x1);
        ty = clampN(target.y, half.y0, half.y1);
      } else if (f.wanderT <= 0) {
        const p = this.randomIn(half);
        f.wanderX = p.x;
        f.wanderY = p.y;
        f.wanderT = this.rng.range(1.5, 3.5);
      }
    } else if (f.wanderT <= 0) {
      const p = this.randomIn(half);
      f.wanderX = p.x;
      f.wanderY = p.y;
      f.wanderT = this.rng.range(2, 4);
    }
    const dx = tx - f.x;
    const dy = ty - f.y;
    const d = Math.hypot(dx, dy);
    const speed = f.golem ? 150 : 210;
    if (d > 12) {
      f.vx = (dx / d) * speed;
      f.vy = (dy / d) * speed;
    } else {
      f.vx *= 0.8;
      f.vy *= 0.8;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    const a = this.arena;
    if (f.golem) {
      f.x = clampN(f.x, a.x0, a.x1);
      f.y = clampN(f.y, a.y0 + 40, a.y1);
    } else {
      f.x = clampN(f.x, half.x0, half.x1);
      f.y = clampN(f.y, half.y0, half.y1);
    }
    const moving = Math.hypot(f.vx, f.vy) > 40;
    if (target) f.facing = target.x >= f.x ? 1 : -1;
    else if (Math.abs(f.vx) > 20) f.facing = f.vx > 0 ? 1 : -1;
    if (f.actT <= 0) f.act = moving ? 'run' : 'idle';
    f.phase += dt * (moving ? 11 : 3);
  }

  private fire(f: Fighter, w: Weapon, target: Fighter): void {
    const spec = WEAPON[w];
    const dx = target.x - f.x;
    const dy = target.y - 60 - (f.y - 60);
    const d = Math.hypot(dx, dy) || 1;
    const ox = f.x + f.facing * 30;
    const oy = f.y - 70;
    if (w === 'shotgun') {
      for (let i = -2; i <= 2; i++) {
        const ang = Math.atan2(dy, dx) + i * 0.09;
        this.st.projectiles.push({ id: this.nextId(), x: ox, y: oy, vx: Math.cos(ang) * spec.speed, vy: Math.sin(ang) * spec.speed, team: f.team, w, owner: f.id, ttl: 0.9, tx: 0, ty: 0 });
      }
    } else {
      const ttl = Math.min(2.5, d / spec.speed + 0.05);
      this.st.projectiles.push({ id: this.nextId(), x: ox, y: oy, vx: (dx / d) * spec.speed, vy: (dy / d) * spec.speed, team: f.team, w, owner: f.id, ttl, tx: target.x, ty: target.y - 50 });
    }
    f.act = 'attack';
    f.actT = 0.3;
    if (w !== 'pistol') this.emitFx('shot', ox, oy, { text: w });
  }

  private rollWeapon(): Weapon {
    const nuke = Math.max(0, this.num('nukeChance')) / 100;
    if (this.rng.chance(nuke)) return 'nuke';
    const r = this.rng.next();
    return r < 0.42 ? 'shotgun' : r < 0.77 ? 'rocket' : 'cannon';
  }

  private damageMult(team: number): number {
    return (this.st.teams[team]!.rage > 0 ? 2 : 1) * (this.st.sudden ? 2 : 1);
  }

  private hurt(victim: Fighter, amount: number, attacker: Fighter | undefined): void {
    if (victim.dead || this.stage !== 'playing') return;
    if (this.st.teams[victim.team]!.shield > 0) {
      this.emitFx('block', victim.x, victim.y - 60);
      return;
    }
    victim.hp -= amount;
    victim.hitT = 0.15;
    if (victim.actT <= 0) {
      victim.act = 'hit';
      victim.actT = 0.15;
    }
    if (amount >= 20) this.emitFx('dmg', victim.x, victim.y - 140, { text: `-${Math.round(amount)}` });
    const owner = attacker ? this.participant(attacker.pid) : undefined;
    if (owner) this.credit(owner, amount / 10, 'damage');
    if (victim.hp <= 0) this.kill(victim, attacker);
  }

  private kill(victim: Fighter, attacker: Fighter | undefined): void {
    victim.hp = 0;
    victim.dead = true;
    victim.act = 'dead';
    victim.barrage = [];
    victim.respawn = this.num('respawnSeconds') ?? 3;
    this.emitFx('death', victim.x, victim.y - 60, { color: this.teams[victim.team]!.color });
    if (attacker) {
      attacker.kills++;
      this.st.teams[attacker.team]!.kills++;
      const p = this.participant(attacker.pid);
      this.credit(p, victim.golem ? 25 : 10, 'kill');
      if (this.st.fighters.filter((f) => !f.golem).length <= 40 || !victim.golem) {
        this.notice(`${attacker.name} ⚔ ${victim.name}`, this.teams[attacker.team]!.color, 2.5);
      }
    } else {
      this.st.teams[victim.team === 0 ? 1 : 0]!.kills++;
    }
    if (this.mode === 'elimination' && !victim.golem) {
      const p = this.participant(victim.pid);
      if (p) p.out = true;
    }
  }

  protected matchTick(dt: number): void {
    this.simulate(dt, true);
    this.checkWin();
  }

  protected override lobbyTick(dt: number): void {
    this.simulate(dt, false);
  }

  protected override resultsTick(dt: number): void {
    for (const f of this.st.fighters) {
      if (f.dead) continue;
      f.act = this.matchWinnerTeam() === f.team ? 'cheer' : 'idle';
      f.phase += dt * 5;
    }
    this.stepProjectiles(dt);
  }

  private matchWinnerTeam(): number | undefined {
    return this.m.winnerTeam;
  }

  private simulate(dt: number, fighting: boolean): void {
    for (const t of this.st.teams) {
      t.rage = Math.max(0, t.rage - dt);
      t.shield = Math.max(0, t.shield - dt);
    }
    const pistol = this.num('pistolDamage');
    for (const f of this.st.fighters) {
      f.actT = Math.max(0, f.actT - dt);
      f.hitT = Math.max(0, f.hitT - dt);
      if (f.dead) {
        if (!fighting) continue;
        if (f.golem) continue;
        const p = this.participant(f.pid);
        if (this.mode === 'elimination' || p?.out) continue;
        f.respawn -= dt;
        if (f.respawn <= 0) {
          const pos = this.randomIn(this.half(f.team));
          f.x = pos.x;
          f.y = pos.y;
          f.hp = f.maxHp;
          f.dead = false;
          f.act = 'idle';
          this.emitFx('spawn', f.x, f.y, { color: this.teams[f.team]!.color });
        }
        continue;
      }
      const target = this.nearestEnemy(f);
      this.moveFighter(f, dt, target, fighting);
      if (!fighting || !target) continue;
      const d = Math.hypot(target.x - f.x, target.y - f.y);
      f.cd -= dt;
      f.barrageCd -= dt;
      if (f.golem) {
        if (d < 130 && f.cd <= 0) {
          f.cd = 1.1;
          f.act = 'attack';
          f.actT = 0.35;
          this.emitFx('smash', target.x, target.y - 30);
          for (const o of this.st.fighters) {
            if (o.team !== f.team && !o.dead && Math.hypot(o.x - target.x, o.y - target.y) < 140) this.hurt(o, 32 * this.damageMult(f.team), f);
          }
        }
        continue;
      }
      if (f.barrage.length && f.barrageCd <= 0) {
        f.barrageCd = 0.38;
        this.fire(f, f.barrage.shift()!, target);
      } else if (f.cd <= 0 && d < 700 && pistol > 0) {
        f.cd = this.rng.range(0.9, 1.4);
        this.fire(f, 'pistol', target);
      }
    }
    // golens têm vida útil: perdem vida lentamente
    for (const f of this.st.fighters) if (f.golem && !f.dead && fighting) f.hp -= dt * 8;
    for (const f of this.st.fighters) if (f.golem && !f.dead && f.hp <= 0) this.kill(f, undefined);
    this.st.fighters = this.st.fighters.filter((f) => !(f.golem && f.dead && f.actT <= 0));
    this.separate();
    this.stepProjectiles(dt);
    // bots de treino também "presenteiam" de vez em quando para a arena não ficar parada
    if (fighting) {
      this.st.botBarrageT -= dt;
      if (this.st.botBarrageT <= 0) {
        this.st.botBarrageT = this.rng.range(5, 10);
        const bots = this.st.fighters.filter((f) => !f.dead && !f.golem && this.participant(f.pid)?.bot);
        if (bots.length) this.rng.pick(bots).barrage.push(this.rollWeapon() === 'nuke' ? 'rocket' : this.rollWeapon());
      }
    }
  }

  /** Evita que lutadores fiquem empilhados no mesmo ponto. */
  private separate(): void {
    const fs = this.st.fighters;
    if (fs.length > 140) return;
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i]!;
      if (a.dead) continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j]!;
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 56;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
  }

  private stepProjectiles(dt: number): void {
    const pistolDmg = this.num('pistolDamage');
    const keep: Projectile[] = [];
    for (const pr of this.st.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.ttl -= dt;
      const spec = WEAPON[pr.w];
      const owner = this.st.fighters.find((f) => f.id === pr.owner);
      let done = false;
      if (spec.radius > 0) {
        if (pr.ttl <= 0) {
          this.explode(pr, owner);
          done = true;
        }
      } else {
        for (const f of this.st.fighters) {
          if (f.team === pr.team || f.dead) continue;
          if (Math.abs(f.x - pr.x) < 34 && pr.y > f.y - 120 && pr.y < f.y) {
            const dmg = (pr.w === 'pistol' ? pistolDmg : spec.dmg) * this.damageMult(pr.team);
            this.hurt(f, dmg, owner);
            if (pr.w !== 'pistol') this.emitFx('spark', pr.x, pr.y);
            done = true;
            break;
          }
        }
        if (pr.ttl <= 0) done = true;
      }
      const a = this.arena;
      if (pr.x < a.x0 - 200 || pr.x > a.x1 + 200 || pr.y < a.y0 - 300 || pr.y > a.y1 + 200) done = true;
      if (!done) keep.push(pr);
    }
    this.st.projectiles = keep.length > 400 ? keep.slice(-400) : keep;
  }

  private explode(pr: Projectile, owner: Fighter | undefined): void {
    const spec = WEAPON[pr.w];
    this.emitFx(pr.w === 'nuke' ? 'nuke' : pr.w === 'meteor' ? 'meteor' : 'boom', pr.x, pr.y, { size: spec.radius });
    for (const f of this.st.fighters) {
      if (f.dead) continue;
      if (pr.w !== 'meteor' && f.team === pr.team) continue;
      const d = Math.hypot(f.x - pr.x, f.y - 50 - pr.y);
      if (d < spec.radius) {
        const fall = 1 - (d / spec.radius) * 0.5;
        this.hurt(f, spec.dmg * fall * this.damageMult(pr.team), owner);
      }
    }
  }

  private checkWin(): void {
    if (this.stage !== 'playing') return;
    const [a, b] = this.st.teams as [TeamState, TeamState];
    if (this.mode === 'kills') {
      const target = this.num('killsToWin') || 25;
      if (a.kills >= target || b.kills >= target) this.win(a.kills >= target ? 0 : 1, `${a.kills} x ${b.kills} em abates`);
      return;
    }
    if (this.mode === 'elimination') {
      const la = this.alive(0).filter((f) => !f.golem).length;
      const lb = this.alive(1).filter((f) => !f.golem).length;
      const ta = this.st.fighters.some((f) => f.team === 0);
      const tb = this.st.fighters.some((f) => f.team === 1);
      if (ta && tb && (la === 0 || lb === 0)) {
        if (la === 0 && lb === 0) this.draw();
        else this.win(la > 0 ? 0 : 1, `Último time de pé · ${Math.max(la, lb)} sobreviventes`);
      }
    }
  }

  protected onTimeUp(): void {
    const [a, b] = this.st.teams as [TeamState, TeamState];
    let sa = a.kills;
    let sb = b.kills;
    if (this.mode === 'elimination') {
      sa = this.alive(0).reduce((s, f) => s + f.hp, 0);
      sb = this.alive(1).reduce((s, f) => s + f.hp, 0);
    }
    if (sa === sb) {
      if (this.setting<boolean>('suddenDeath') && !this.st.sudden) {
        this.st.sudden = true;
        this.m.timer = 30;
        this.notice('☠️ MORTE SÚBITA: dano em dobro!', '#f97316', 5);
        this.emitFx('sudden', this.W / 2, this.H / 2);
        return;
      }
      this.draw();
      return;
    }
    this.win(sa > sb ? 0 : 1, this.mode === 'elimination' ? 'Mais vida restante no fim do tempo' : `${a.kills} x ${b.kills} em abates`);
  }

  private ranking(): Participant[] {
    return this.participants().sort((x, y) => y.score - x.score);
  }

  private win(team: number, subtitle: string): void {
    this.emitFx('victory', this.W / 2, this.H / 2, { color: this.teams[team]!.color });
    const ranking = this.ranking();
    // o melhor jogador do time vencedor fica em 1º lugar
    const best = ranking.find((p) => p.team === team);
    const ordered = best ? [best, ...ranking.filter((p) => p !== best)] : ranking;
    this.finishMatch({ ranking: ordered, title: `${this.teams[team]!.name} venceu!`, subtitle, winnerTeam: team });
  }

  private draw(): void {
    this.finishMatch({ ranking: this.ranking(), title: 'Empate!', subtitle: 'Ninguém levou essa' });
  }

  // ---------- ações vindas de eventos ----------

  /** Garante um lutador para quem interagiu (entra no menor time se permitido). */
  private ensureHero(v: GameActionMessage['viewer']): Fighter | undefined {
    if (!v) return undefined;
    let f = this.heroOf(v.id);
    if (!f) {
      this.join(v);
      f = this.heroOf(v.id);
    }
    return f;
  }

  private losingTeam(): number {
    const [a, b] = this.st.teams as [TeamState, TeamState];
    if (a.kills !== b.kills) return a.kills < b.kills ? 0 : 1;
    return this.alive(0).length <= this.alive(1).length ? 0 : 1;
  }

  private teamOf(v: GameActionMessage['viewer']): number {
    const p = this.participant(v?.id);
    return p ? p.team : this.losingTeam();
  }

  protected onGameAction(action: GameActionMessage, q: number): void {
    const v = action.viewer;
    switch (action.actionId) {
      case 'barrage': {
        const shots = Math.min(60, Math.round(this.param(action, 'shots', 2) * q));
        let f = this.ensureHero(v);
        if (!f || f.dead) {
          // sem lutador (ou morto): um aliado vivo do time dispara em nome de quem enviou
          const team = f ? f.team : this.losingTeam();
          const allies = this.alive(team).filter((x) => !x.golem);
          if (allies.length) f = this.rng.pick(allies);
        }
        if (!f) return;
        for (let i = 0; i < shots; i++) f.barrage.push(this.rollWeapon());
        if (f.barrage.length > 80) f.barrage.splice(0, f.barrage.length - 80);
        this.addScore(v, shots * 2, 'barrage');
        if (shots >= 6) this.notice(`💥 ${v ? (this.participant(v.id)?.name ?? 'Alguém') : 'Alguém'} soltou uma rajada de ${shots}!`, '#fb923c', 3);
        break;
      }
      case 'grow_hp': {
        const f = this.ensureHero(v);
        if (!f) return;
        const amount = this.param(action, 'amount', 60) * q;
        const cap = (this.num('baseHp') || 100) * 12;
        f.maxHp = Math.min(cap, f.maxHp + amount);
        if (!f.dead) f.hp = Math.min(f.maxHp, f.hp + amount);
        this.emitFx('grow', f.x, f.y - 60, { color: this.teams[f.team]!.color });
        this.addScore(v, Math.round(amount / 10), 'grow');
        break;
      }
      case 'summon_golem': {
        if (this.stage === 'results') return;
        const team = this.teamOf(v);
        const golems = this.st.fighters.filter((f) => f.golem && f.team === team).length;
        if (golems >= 3) return;
        const name = v ? `Golem de ${this.participant(v.id)?.name ?? (v.nickname || v.username || 'fã')}` : 'Golem';
        const hp = this.param(action, 'hp', 400);
        const pos = this.randomIn(this.half(team));
        this.st.fighters.push({
          id: this.nextId(), pid: v?.id ?? 'crowd', team, golem: true, name: name.slice(0, 24), x: pos.x, y: pos.y, vx: 0, vy: 0, hp, maxHp: hp,
          cd: 1, barrage: [], barrageCd: 0, act: 'idle', actT: 0, hitT: 0, dead: false, respawn: 0, facing: team === 0 ? 1 : -1, kills: 0,
          wanderX: pos.x, wanderY: pos.y, wanderT: 0, phase: 0,
        });
        this.emitFx('golem', pos.x, pos.y, { color: this.teams[team]!.color });
        this.notice(`🗿 ${name} entrou na arena!`, this.teams[team]!.color, 3);
        this.addScore(v, 30, 'golem');
        break;
      }
      case 'heal_team': {
        const team = this.teamOf(v);
        const amount = this.param(action, 'amount', 40) * q;
        for (const f of this.alive(team)) {
          f.hp = Math.min(f.maxHp, f.hp + amount);
          this.emitFx('heal', f.x, f.y - 60);
        }
        this.addScore(v, 5, 'heal');
        break;
      }
      case 'shield_team': {
        const team = this.teamOf(v);
        this.st.teams[team]!.shield = Math.min(30, this.st.teams[team]!.shield + this.param(action, 'duration', 4));
        this.notice(`🛡️ Escudo no ${this.teams[team]!.name}!`, '#38bdf8', 2.5);
        this.addScore(v, 5, 'shield');
        break;
      }
      case 'rage': {
        const team = v && this.participant(v.id) ? this.participant(v.id)!.team : this.losingTeam();
        this.st.teams[team]!.rage = Math.min(30, this.st.teams[team]!.rage + this.param(action, 'duration', 6));
        this.notice(`🔥 Fúria do ${this.teams[team]!.name}: dano em dobro!`, '#f97316', 3);
        break;
      }
      case 'meteor_rain': {
        if (this.stage !== 'playing') return;
        const [a, b] = this.st.teams as [TeamState, TeamState];
        const target = a.kills === b.kills ? this.rng.int(0, 1) : a.kills > b.kills ? 0 : 1;
        const half = this.half(target);
        const count = Math.min(40, this.param(action, 'count', 8) * q);
        for (let i = 0; i < count; i++) {
          const p = this.randomIn(half);
          this.st.projectiles.push({ id: this.nextId(), x: p.x + 200, y: this.arena.y0 - 300 - i * 120, vx: -160, vy: WEAPON.meteor.speed, team: -1, w: 'meteor', owner: -1, ttl: (p.y - (this.arena.y0 - 300 - i * 120)) / WEAPON.meteor.speed, tx: p.x, ty: p.y });
        }
        this.notice(`☄️ Chuva de meteoros sobre o ${this.teams[target]!.name}!`, '#fbbf24', 4);
        break;
      }
    }
  }

  protected override onGameSignal(_sig: ViewerSignalMessage): void {}

  // ---------- snapshot ----------

  snapshot(): BattleSnapshot {
    const match = this.matchSnapshot();
    let topKills = 0;
    for (const f of this.st.fighters) if (!f.golem) topKills = Math.max(topKills, f.kills);
    const fighters: FighterView[] = this.st.fighters.map((f) => {
      const p = this.participant(f.pid);
      const v: FighterView = {
        id: f.id, pid: f.golem ? `golem:${f.id}` : f.pid, x: Math.round(f.x), y: Math.round(f.y), t: f.team, n: f.name,
        hp: Math.max(0, Math.round((f.hp / f.maxHp) * 100)), mh: Math.round(f.maxHp), f: f.facing, a: f.dead ? 'dead' : f.act,
        at: Math.round((f.act === 'attack' ? 1 - f.actT / 0.3 : 0) * 100) / 100, ph: Math.round(f.phase * 100) / 100, k: f.kills,
      };
      if (f.golem) v.g = 1;
      if (this.st.teams[f.team]!.shield > 0) v.sh = 1;
      if (!f.golem && topKills > 0 && f.kills === topKills) v.cr = 1;
      if (p?.bot) v.b = 1;
      if (f.barrage.length) v.q = f.barrage.length;
      return v;
    });
    return {
      ...this.baseSnapshot(),
      leaderboard: this.leaderboard(5, true),
      match,
      fighters,
      projectiles: this.st.projectiles.slice(-160).map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), w: p.w, t: p.team })),
      teamsLive: this.teams.map((t, i) => ({
        name: t.name, color: t.color, kills: this.st.teams[i]!.kills,
        alive: this.alive(i).filter((f) => !f.golem).length, total: this.st.fighters.filter((f) => f.team === i && !f.golem).length,
        rage: this.st.teams[i]!.rage > 0, shield: this.st.teams[i]!.shield > 0,
      })),
      mode: this.mode,
      killsToWin: this.num('killsToWin') || 25,
      sudden: this.st.sudden,
      arena: { ...this.arena, vertical: this.vertical },
      shake: this.setting<boolean>('screenShake') !== false,
    };
  }
}
