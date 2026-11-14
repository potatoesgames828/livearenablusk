import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';

interface Block {
  id: number;
  c: string;
  by: string;
}

interface Member {
  team: number;
  name: string;
  blocks: number;
  lastFree: number;
}

interface State {
  towers: [Block[], Block[]];
  wins: [number, number];
  members: Record<string, Member>;
  botT: number;
}

export interface TowerSnapshot extends BaseSnapshot {
  towers: Array<{ name: string; color: string; height: number; wins: number; members: number; blocks: Array<{ id: number; c: string }>; lastBy?: string; top: Array<{ id: string; name: string; blocks: number }> }>;
  target: number;
  winsToEnd: number;
  matchWinner?: number;
  hint: string;
}

const TEAM_COLORS = ['#38bdf8', '#f472b6'];
const PALETTES = [
  ['#0ea5e9', '#38bdf8', '#7dd3fc', '#0284c7', '#22d3ee'],
  ['#ec4899', '#f472b6', '#f9a8d4', '#db2777', '#fb7185'],
];

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^!/, '').trim();
}

export class TowerWar extends BaseGame<TowerSnapshot, State> {
  protected st: State;
  private matchWinner?: number;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.st = { towers: [[], []], wins: [0, 0], members: {}, botT: 1 };
  }

  private name(i: number): string {
    return String(this.setting<string>(i === 0 ? 'teamAName' : 'teamBName') || `Torre ${i + 1}`).slice(0, 16);
  }
  private kw(i: number): string[] {
    return String(this.setting<string>(i === 0 ? 'teamAKeywords' : 'teamBKeywords') ?? '').split(',').map(norm).filter(Boolean);
  }
  private count(t: number): number {
    let n = 0;
    for (const m of Object.values(this.st.members)) if (m.team === t) n++;
    return n;
  }
  private target(): number {
    return Math.max(10, this.num('targetHeight') || 100);
  }

  private join(v: GameActionMessage['viewer'], team?: number): Member | undefined {
    if (!v?.id) return undefined;
    const t = team ?? (this.count(0) <= this.count(1) ? 0 : 1);
    const m = this.st.members[v.id];
    if (m) {
      if (team !== undefined) m.team = team;
      return m;
    }
    if (Object.keys(this.st.members).length >= 5000) return undefined;
    return (this.st.members[v.id] = { team: t, name: viewerName(v), blocks: 0, lastFree: -999 });
  }

  private teamOf(v: GameActionMessage['viewer']): number {
    const m = this.join(v);
    if (m) return m.team;
    // sem espectador: ajuda a torre mais baixa
    return this.st.towers[0].length <= this.st.towers[1].length ? 0 : 1;
  }

  private add(team: number, n: number, by: string, viewerId?: string): void {
    if (this.b.phase !== 'playing') return;
    for (let i = 0; i < n; i++) {
      // a torre é recriada ao bater a meta: sempre pega a referência atual
      const tower = this.st.towers[team as 0 | 1];
      tower.push({ id: this.nextId(), c: this.rng.pick(PALETTES[team]!), by });
      if (tower.length >= this.target()) {
        this.bankWin(team, by);
        if (this.b.phase !== 'playing') return;
      }
    }
    if (viewerId) {
      const m = this.st.members[viewerId];
      if (m) m.blocks += n;
      this.addScore({ id: viewerId, nickname: by }, n, 'block');
    }
  }

  private remove(team: number, n: number): Block[] {
    const tower = this.st.towers[team as 0 | 1];
    const k = Math.min(tower.length, n);
    return tower.splice(tower.length - k, k);
  }

  private bankWin(team: number, by: string): void {
    this.st.wins[team as 0 | 1]++;
    this.st.towers[team as 0 | 1] = [];
    this.emitFx('win', team === 0 ? this.W * 0.27 : this.W * 0.73, this.H * 0.3, { color: TEAM_COLORS[team] });
    this.notice(`🏆 ${this.name(team)} chegou na meta! (${by} colocou o bloco final)`, TEAM_COLORS[team]!, 5);
    const need = this.num('winsToEnd');
    if (need > 0 && this.st.wins[team]! >= need) {
      this.matchWinner = team;
      let mvp: { id: string; name: string; score: number } | undefined;
      for (const [id, m] of Object.entries(this.st.members)) if (m.team === team && (!mvp || m.blocks > mvp.score)) mvp = { id, name: m.name, score: m.blocks };
      this.endRound(mvp, { winnerTeam: this.name(team), wins: [...this.st.wins] }, this.num('intermission') || 10);
    }
  }

  protected update(dt: number): void {
    if (this.ctx.simulated && Object.keys(this.st.members).length === 0) {
      this.st.botT -= dt;
      if (this.st.botT <= 0) {
        this.st.botT = this.rng.range(0.4, 1.2);
        this.add(this.rng.int(0, 1), this.rng.int(1, 3), 'Bot');
      }
    }
  }

  protected resetRound(): void {
    this.st.towers = [[], []];
    this.st.wins = [0, 0];
    for (const m of Object.values(this.st.members)) m.blocks = 0;
    this.matchWinner = undefined;
  }

  protected onAction(action: GameActionMessage, q: number): void {
    const v = action.viewer;
    const by = v ? viewerName(v) : 'Público';
    switch (action.actionId) {
      case 'join': {
        const t = action.params?.team;
        this.join(v, t === '0' ? 0 : t === '1' ? 1 : undefined);
        break;
      }
      case 'grow': {
        const team = this.teamOf(v);
        this.add(team, Math.min(1000, Math.round(this.param(action, 'blocks', 1) * q)), by, v?.id);
        break;
      }
      case 'wreck': {
        if (this.b.phase !== 'playing') return;
        const team = this.teamOf(v);
        const rival = team === 0 ? 1 : 0;
        const gone = this.remove(rival, Math.round(this.param(action, 'blocks', 5) * q));
        if (gone.length) {
          this.emitFx('wreck', rival === 0 ? this.W * 0.27 : this.W * 0.73, this.H * 0.5, { size: gone.length, color: TEAM_COLORS[rival] });
          this.notice(`💣 ${by} derrubou ${gone.length} blocos de ${this.name(rival)}`, '#f97316', 3);
          this.addScore(v, gone.length, 'wreck');
        }
        break;
      }
      case 'steal': {
        if (this.b.phase !== 'playing') return;
        const team = this.teamOf(v);
        const rival = team === 0 ? 1 : 0;
        const gone = this.remove(rival, Math.round(this.param(action, 'blocks', 8) * q));
        if (gone.length) {
          this.emitFx('steal', this.W / 2, this.H * 0.4, { size: gone.length, color: TEAM_COLORS[team] });
          this.notice(`🧲 ${by} roubou ${gone.length} blocos para ${this.name(team)}`, '#a78bfa', 3);
          this.add(team, gone.length, by, v?.id);
        }
        break;
      }
      case 'reset_rival': {
        if (this.b.phase !== 'playing') return;
        const team = this.teamOf(v);
        const rival = team === 0 ? 1 : 0;
        const n = this.st.towers[rival].length;
        this.st.towers[rival] = [];
        this.emitFx('demolish', rival === 0 ? this.W * 0.27 : this.W * 0.73, this.H * 0.5, { size: n, color: TEAM_COLORS[rival] });
        this.notice(`🏚️ ${by} DEMOLIU a torre de ${this.name(rival)}!`, '#ef4444', 5);
        this.addScore(v, 50, 'demolish');
        break;
      }
    }
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    const v = sig.viewer;
    if (sig.type === 'GIFT') this.addScore(v, Math.max(1, Math.round(sig.value)), 'gift');
    if (sig.type !== 'CHAT' || !sig.text || !v?.id) return;
    const w = norm(sig.text).split(/\s+/)[0] ?? '';
    if (this.kw(0).includes(w)) return void this.join(v, 0);
    if (this.kw(1).includes(w)) return void this.join(v, 1);
    if (w === norm(String(this.setting<string>('freeKeyword') ?? 'sobe'))) {
      const m = this.join(v)!;
      if (this.b.t - m.lastFree >= this.num('freeCooldown')) {
        m.lastFree = this.b.t;
        this.add(m.team, 1, m.name, v.id);
      }
    }
  }

  snapshot(): TowerSnapshot {
    const top = (team: number) =>
      Object.entries(this.st.members)
        .filter(([, m]) => m.team === team && m.blocks > 0)
        .sort((a, b) => b[1].blocks - a[1].blocks)
        .slice(0, 3)
        .map(([id, m]) => ({ id, name: m.name, blocks: m.blocks }));
    const k = (i: number) => this.kw(i)[0] ?? String(i + 1);
    return {
      ...this.baseSnapshot(),
      towers: [0, 1].map((i) => {
        const t = this.st.towers[i as 0 | 1];
        return { name: this.name(i), color: TEAM_COLORS[i]!, height: t.length, wins: this.st.wins[i]!, members: this.count(i), blocks: t.slice(-400).map((b) => ({ id: b.id, c: b.c })), lastBy: t[t.length - 1]?.by, top: top(i) };
      }),
      target: this.target(),
      winsToEnd: this.num('winsToEnd'),
      matchWinner: this.b.phase === 'intermission' ? this.matchWinner : undefined,
      hint: `"${k(0)}" ou "${k(1)}" para entrar · "${String(this.setting<string>('freeKeyword') ?? 'sobe')}" = bloco grátis`,
    };
  }

  override serialize(): unknown {
    return { ...(super.serialize() as object), mw: this.matchWinner ?? null };
  }
  override restore(data: unknown): void {
    super.restore(data);
    this.matchWinner = (data as { mw?: number | null }).mw ?? undefined;
  }
}
