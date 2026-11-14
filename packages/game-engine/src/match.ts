import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName } from './base-game';
import type { ActionDef, BaseSnapshot, GameManifest, ParamDef, SimContext } from './types';

/**
 * Ciclo de partida completo (Game Engine v2):
 *   lobby (entrada por comentário, contagem regressiva, bots de treino)
 *   → partida → resultado com pódio → novo lobby.
 * Os jogos baseados em participantes estendem `MatchGame` e implementam
 * apenas a lógica da partida.
 */
export type MatchStage = 'lobby' | 'playing' | 'results';

export interface Participant {
  id: string;
  name: string;
  avatarUrl?: string;
  team: number;
  joinedAt: number;
  bot: boolean;
  /** pontuação da partida atual */
  score: number;
  out: boolean;
}

export interface TeamDef {
  name: string;
  color: string;
  /** palavras de entrada no chat (sem "!"; com "!" também funciona) */
  keywords: string[];
}

export interface PodiumEntry {
  id: string;
  name: string;
  avatarUrl?: string;
  score: number;
  team?: number;
  bot?: boolean;
}

export interface MatchSnapshot {
  stage: MatchStage;
  /** segundos restantes do estágio (lobby/resultado) ou da partida, quando houver limite */
  endsIn?: number;
  elapsed: number;
  participants: number;
  max: number;
  minToStart: number;
  joinHint: string;
  /** últimos que entraram (para o lobby) */
  recent: PodiumEntry[];
  podium: PodiumEntry[];
  resultTitle?: string;
  resultSubtitle?: string;
  winnerTeam?: number;
  teams?: Array<{ name: string; color: string; count: number; wins: number }>;
  waitingManualStart?: boolean;
}

export interface MatchBaseSnapshot extends BaseSnapshot {
  match: MatchSnapshot;
}

interface MatchState {
  stage: MatchStage;
  timer: number;
  elapsed: number;
  parts: Record<string, Participant>;
  order: string[];
  podium: PodiumEntry[];
  resultTitle?: string;
  resultSubtitle?: string;
  winnerTeam?: number;
  teamWins: number[];
  botSeq: number;
}

export interface MatchDefaults {
  lobbySeconds?: number;
  maxParticipants?: number;
  minToStart?: number;
  matchSeconds?: number;
  joinKeywords?: string;
  practiceBots?: number;
  resultsSeconds?: number;
  lateJoin?: boolean;
  joinOnAnyInteraction?: boolean;
}

/** Ajustes comuns de partida; os jogos incluem no manifesto via spread. */
export function matchSettings(d: MatchDefaults = {}): ParamDef[] {
  return [
    { key: 'lobbySeconds', label: 'Tempo de entrada (lobby)', type: 'number', default: d.lobbySeconds ?? 30, min: 5, max: 180, unit: 's', help: 'Janela para o público entrar antes da partida começar.' },
    { key: 'maxParticipants', label: 'Máximo de participantes', type: 'number', default: d.maxParticipants ?? 40, min: 2, max: 120 },
    { key: 'minToStart', label: 'Mínimo para começar', type: 'number', default: d.minToStart ?? 2, min: 1, max: 50, help: 'Bots de treino contam para o mínimo.' },
    { key: 'matchSeconds', label: 'Duração máxima da partida', type: 'number', default: d.matchSeconds ?? 120, min: 20, max: 1800, unit: 's' },
    { key: 'joinKeywords', label: 'Palavras para entrar', type: 'text', default: d.joinKeywords ?? 'entrar, eu, join', help: 'Separadas por vírgula. Funcionam com ou sem "!".' },
    { key: 'joinOnAnyInteraction', label: 'Entrar com qualquer interação', type: 'boolean', default: d.joinOnAnyInteraction ?? false, help: 'Qualquer comentário, curtida ou presente inscreve o espectador.' },
    { key: 'lateJoin', label: 'Permitir entrada durante a partida', type: 'boolean', default: d.lateJoin ?? false },
    { key: 'practiceBots', label: 'Bots de treino', type: 'number', default: d.practiceBots ?? 4, min: 0, max: 40, help: 'Completam a arena quando há poucos espectadores e saem quando o público entra.' },
    { key: 'resultsSeconds', label: 'Tempo da tela de resultado', type: 'number', default: d.resultsSeconds ?? 10, min: 3, max: 60, unit: 's' },
  ];
}

export function joinAction(teams?: TeamDef[]): ActionDef {
  return {
    id: 'join',
    label: 'Entrar na partida',
    description: teams ? 'Inscreve o espectador em um time.' : 'Inscreve o espectador na próxima partida.',
    params: teams
      ? [{ key: 'team', label: 'Time', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automático (menor time)' }, ...teams.map((t, i) => ({ value: String(i), label: t.name }))] }]
      : [],
  };
}

const BOT_NAMES = ['Bot Faísca', 'Bot Trovão', 'Bot Pipoca', 'Bot Neon', 'Bot Cometa', 'Bot Turbo', 'Bot Bolha', 'Bot Ninja', 'Bot Pixel', 'Bot Zíper', 'Bot Brisa', 'Bot Jujuba'];

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^!/, '')
    .trim();
}

export abstract class MatchGame<S extends MatchBaseSnapshot, St extends object> extends BaseGame<S, St> {
  protected m: MatchState;
  /** times (vazio = todos contra todos) */
  protected teams: TeamDef[] = [];

  constructor(manifest: GameManifest, ctx: SimContext) {
    super(manifest, ctx);
    this.m = { stage: 'lobby', timer: 0, elapsed: 0, parts: {}, order: [], podium: [], teamWins: [], botSeq: 0 };
  }

  /** Deve ser chamado no fim do construtor da subclasse (após definir `teams` e `st`). */
  protected initMatch(): void {
    this.m.teamWins = this.teams.map(() => 0);
    this.enterLobby(true);
  }

  // ---------- configuração ----------

  protected get lobbySeconds(): number {
    return this.num('lobbySeconds') || 30;
  }
  protected get maxParticipants(): number {
    return Math.max(2, this.num('maxParticipants') || 40);
  }
  protected get minToStart(): number {
    return Math.max(1, this.num('minToStart') || 2);
  }
  protected get matchSeconds(): number {
    return this.num('matchSeconds') || 120;
  }
  private joinWords(): string[] {
    const raw = String(this.setting<string>('joinKeywords') ?? '');
    return raw.split(',').map(normalize).filter(Boolean);
  }

  // ---------- participantes ----------

  get stage(): MatchStage {
    return this.m.stage;
  }

  protected participants(): Participant[] {
    return this.m.order.map((id) => this.m.parts[id]!).filter(Boolean);
  }

  protected participant(id: string | undefined): Participant | undefined {
    return id ? this.m.parts[id] : undefined;
  }

  protected teamCount(team: number): number {
    let n = 0;
    for (const id of this.m.order) if (this.m.parts[id]?.team === team) n++;
    return n;
  }

  private smallestTeam(): number {
    if (!this.teams.length) return 0;
    let best = 0;
    for (let i = 1; i < this.teams.length; i++) if (this.teamCount(i) < this.teamCount(best)) best = i;
    return best;
  }

  /** Pode entrar agora? (lobby sempre; durante a partida depende do ajuste) */
  protected canJoinNow(): boolean {
    if (this.m.stage === 'lobby') return true;
    if (this.m.stage === 'playing') return this.setting<boolean>('lateJoin') === true;
    return false;
  }

  /**
   * Inscreve (ou troca de time) um espectador. Retorna o participante ou
   * undefined se a partida estiver cheia/fechada.
   */
  protected join(v: { id: string; username?: string; nickname?: string; avatarUrl?: string } | undefined, team?: number): Participant | undefined {
    if (!v?.id) return undefined;
    const existing = this.m.parts[v.id];
    if (existing) {
      if (team !== undefined && this.teams.length && team !== existing.team && this.m.stage === 'lobby') {
        existing.team = team;
        this.onTeamChange(existing);
      }
      return existing;
    }
    if (!this.canJoinNow()) return undefined;
    if (this.realCount() >= this.maxParticipants) return undefined;
    // um bot sai para abrir vaga quando a arena estiver cheia
    if (this.m.order.length >= this.maxParticipants) this.retireBot();
    const t = team ?? this.smallestTeam();
    const p: Participant = { id: v.id, name: viewerName(v), team: this.teams.length ? Math.min(t, this.teams.length - 1) : 0, joinedAt: this.b.t, bot: false, score: 0, out: false };
    if (v.avatarUrl) p.avatarUrl = v.avatarUrl;
    this.m.parts[p.id] = p;
    this.m.order.push(p.id);
    this.touchViewer(v);
    this.onJoin(p);
    // retira bots excedentes quando o público real chega
    if (this.m.stage === 'lobby') this.trimBots();
    if (this.m.stage === 'lobby' && this.realCount() >= this.maxParticipants) {
      this.m.timer = Math.min(this.m.timer, 3);
    }
    return p;
  }

  private realCount(): number {
    let n = 0;
    for (const id of this.m.order) if (!this.m.parts[id]?.bot) n++;
    return n;
  }

  private addBot(team?: number): void {
    const n = this.m.botSeq++;
    const id = `bot:${n}`;
    const p: Participant = { id, name: BOT_NAMES[n % BOT_NAMES.length]! + (n >= BOT_NAMES.length ? ` ${Math.floor(n / BOT_NAMES.length) + 1}` : ''), team: team ?? this.smallestTeam(), joinedAt: this.b.t, bot: true, score: 0, out: false };
    this.m.parts[id] = p;
    this.m.order.push(id);
    this.onJoin(p);
  }

  private retireBot(): boolean {
    for (let i = this.m.order.length - 1; i >= 0; i--) {
      const id = this.m.order[i]!;
      if (this.m.parts[id]?.bot) {
        this.removeParticipant(id);
        return true;
      }
    }
    return false;
  }

  protected removeParticipant(id: string): void {
    const p = this.m.parts[id];
    if (!p) return;
    delete this.m.parts[id];
    this.m.order = this.m.order.filter((x) => x !== id);
    this.onLeave(p);
  }

  /** Mantém o total de bots = max(0, bots configurados − reais), respeitando o mínimo. */
  private trimBots(): void {
    const want = this.desiredBots();
    let bots = this.m.order.filter((id) => this.m.parts[id]?.bot).length;
    while (bots > want && this.retireBot()) bots--;
  }

  private desiredBots(): number {
    const cfg = Math.max(0, this.num('practiceBots') || 0);
    const real = this.realCount();
    return Math.max(0, Math.min(cfg, this.maxParticipants - real, Math.max(cfg - real, this.minToStart - real)));
  }

  private fillBots(): void {
    const want = this.desiredBots();
    let bots = this.m.order.filter((id) => this.m.parts[id]?.bot).length;
    while (bots < want) {
      this.addBot();
      bots++;
    }
  }

  /** Credita pontos ao participante (e ao ranking global, se não for bot). */
  protected credit(p: Participant | undefined, points: number, reason: string): void {
    if (!p || points === 0) return;
    p.score += points;
    if (!p.bot) this.addScore({ id: p.id, nickname: p.name }, Math.round(points), reason);
  }

  // ---------- estágios ----------

  private enterLobby(first = false): void {
    this.m.stage = 'lobby';
    this.m.timer = this.lobbySeconds;
    this.m.elapsed = 0;
    this.m.podium = [];
    this.m.resultTitle = undefined;
    this.m.resultSubtitle = undefined;
    this.m.winnerTeam = undefined;
    if (!first) {
      const keep = this.keepRosterBetweenMatches();
      for (const id of [...this.m.order]) {
        const p = this.m.parts[id]!;
        if (!keep && !p.bot) this.removeParticipant(id);
        else {
          p.score = 0;
          p.out = false;
        }
      }
    }
    this.trimBots();
    this.fillBots();
    this.onLobby();
  }

  private startMatch(): void {
    this.m.stage = 'playing';
    this.m.elapsed = 0;
    this.m.timer = this.matchSeconds;
    for (const v of Object.values(this.b.viewers)) v.roundScore = 0;
    for (const p of this.participants()) {
      p.score = 0;
      p.out = false;
    }
    this.emit({ type: 'roundStart', round: this.b.round });
    this.notice(`Partida ${this.b.round} começou!`, '#a78bfa');
    this.onMatchStart();
  }

  /**
   * Encerra a partida e mostra o pódio. `ranking` em ordem (1º primeiro).
   */
  protected finishMatch(opts: { ranking: Participant[]; title: string; subtitle?: string; winnerTeam?: number; scoreOf?: (p: Participant) => number }): void {
    if (this.m.stage !== 'playing') return;
    const scoreOf = opts.scoreOf ?? ((p: Participant) => p.score);
    this.m.podium = opts.ranking.slice(0, 3).map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, score: Math.round(scoreOf(p)), team: this.teams.length ? p.team : undefined, bot: p.bot }));
    this.m.resultTitle = opts.title;
    this.m.resultSubtitle = opts.subtitle;
    this.m.winnerTeam = opts.winnerTeam;
    if (opts.winnerTeam !== undefined && this.m.teamWins[opts.winnerTeam] !== undefined) this.m.teamWins[opts.winnerTeam]! += 1;
    const top = opts.ranking.find((p) => !p.bot);
    const winner = top ? { id: top.id, name: top.name, score: Math.round(scoreOf(top)) } : undefined;
    this.emit({
      type: 'roundEnd',
      round: this.b.round,
      winner,
      summary: { title: opts.title, winnerTeam: opts.winnerTeam !== undefined ? this.teams[opts.winnerTeam]?.name : undefined, participants: this.realCount(), podium: this.m.podium.map((p) => ({ name: p.name, score: p.score })) },
    });
    this.notice(`🏆 ${opts.title}`, '#facc15', 6);
    this.m.stage = 'results';
    this.m.timer = Math.max(3, this.num('resultsSeconds') || 10);
    this.onResults();
  }

  // ---------- integração com BaseGame ----------

  protected update(dt: number): void {
    const m = this.m;
    if (m.stage === 'lobby') {
      this.lobbyTick(dt);
      const enough = m.order.length >= this.minToStart;
      if (this.ctx.config.autoMode === false) return; // aguarda início manual
      if (!enough) {
        this.fillBots();
        m.timer = Math.max(m.timer, Math.min(5, this.lobbySeconds));
        return;
      }
      m.timer -= dt;
      if (m.timer <= 0) this.startMatch();
      return;
    }
    if (m.stage === 'results') {
      m.timer -= dt;
      this.resultsTick(dt);
      if (m.timer <= 0) {
        this.b.round += 1;
        this.enterLobby();
      }
      return;
    }
    m.elapsed += dt;
    m.timer -= dt;
    this.matchTick(dt);
    if (m.stage === 'playing' && m.timer <= 0) this.onTimeUp();
  }

  protected onAction(action: GameActionMessage, quantity: number): void {
    if (action.actionId === 'join') {
      const raw = action.params?.team;
      const team = typeof raw === 'string' && raw !== 'auto' ? Number(raw) : typeof raw === 'number' ? raw : undefined;
      this.join(action.viewer, Number.isFinite(team) ? team : undefined);
      return;
    }
    if (this.setting<boolean>('joinOnAnyInteraction')) this.join(action.viewer);
    this.onGameAction(action, quantity);
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    if (sig.type === 'CHAT' && sig.text) {
      const word = normalize(sig.text).split(/\s+/)[0] ?? '';
      if (word) {
        const tIdx = this.teams.findIndex((t) => t.keywords.map(normalize).includes(word));
        if (tIdx >= 0) this.join(sig.viewer, tIdx);
        else if (this.joinWords().includes(word)) this.join(sig.viewer);
      }
    }
    if (this.setting<boolean>('joinOnAnyInteraction') && sig.type !== 'SHARE') this.join(sig.viewer);
    if (sig.type === 'GIFT') this.addScore(sig.viewer, Math.max(1, Math.round(sig.value)), 'gift');
    this.onGameSignal(sig);
  }

  /** START no lobby inicia a partida imediatamente (modo manual). */
  override control(command: Parameters<BaseGame<S, St>['control']>[0], args?: Record<string, unknown>): void {
    if (command === 'START' && this.b.phase === 'playing' && this.m.stage === 'lobby') {
      this.fillBots();
      if (this.m.order.length >= 1) this.startMatch();
      return;
    }
    super.control(command, args);
  }

  protected resetRound(): void {
    this.enterLobby();
  }

  override serialize(): unknown {
    const base = super.serialize() as Record<string, unknown>;
    return { ...base, m: this.m };
  }

  override restore(data: unknown): void {
    super.restore(data);
    const m = (data as { m?: MatchState }).m;
    if (!m) throw new Error('checkpoint incompatível (sem estado de partida)');
    this.m = m;
  }

  protected matchSnapshot(): MatchSnapshot {
    const m = this.m;
    const words = this.joinWords();
    const joinHint = this.teams.length
      ? `Digite ${this.teams.map((t) => `"${t.keywords[0]}"`).join(' ou ')} para entrar`
      : `Digite "${words[0] ?? 'entrar'}" para entrar`;
    return {
      stage: m.stage,
      endsIn: m.stage === 'playing' && !this.hasTimeLimit() ? undefined : Math.max(0, Math.ceil(m.timer)),
      elapsed: Math.round(m.elapsed * 10) / 10,
      participants: m.order.length,
      max: this.maxParticipants,
      minToStart: this.minToStart,
      joinHint,
      recent: m.order.slice(-8).reverse().map((id) => {
        const p = m.parts[id]!;
        return { id: p.id, name: p.name, avatarUrl: p.avatarUrl, score: p.score, team: this.teams.length ? p.team : undefined, bot: p.bot };
      }),
      podium: m.podium,
      resultTitle: m.resultTitle,
      resultSubtitle: m.resultSubtitle,
      winnerTeam: m.winnerTeam,
      teams: this.teams.length ? this.teams.map((t, i) => ({ name: t.name, color: t.color, count: this.teamCount(i), wins: m.teamWins[i] ?? 0 })) : undefined,
      waitingManualStart: m.stage === 'lobby' && this.ctx.config.autoMode === false ? true : undefined,
    };
  }

  // ---------- pontos de extensão ----------

  /** Partida tem limite de tempo exibido? */
  protected hasTimeLimit(): boolean {
    return true;
  }
  protected keepRosterBetweenMatches(): boolean {
    return true;
  }
  protected onJoin(_p: Participant): void {}
  protected onLeave(_p: Participant): void {}
  protected onTeamChange(_p: Participant): void {}
  protected onLobby(): void {}
  protected lobbyTick(_dt: number): void {}
  protected onResults(): void {}
  protected resultsTick(_dt: number): void {}
  protected abstract onMatchStart(): void;
  protected abstract matchTick(dt: number): void;
  protected abstract onTimeUp(): void;
  protected abstract onGameAction(action: GameActionMessage, quantity: number): void;
  protected onGameSignal(_sig: ViewerSignalMessage): void {}
}
