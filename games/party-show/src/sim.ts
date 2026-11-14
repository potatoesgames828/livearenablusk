import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { BaseGame, viewerName, type BaseSnapshot, type SimContext } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { POLLS, QUIZ, WORDS } from './content';

export type Mode = 'quiz' | 'poll' | 'number' | 'word';

interface Result {
  answer: string;
  winners: Array<{ id: string; name: string; pts: number; team?: number }>;
  detail: string;
}

interface State {
  mode: Mode;
  prompt: string;
  options: string[];
  correct: number;
  removed: number[];
  votes: Record<string, number>;
  counts: number[];
  guesses: Record<string, number>;
  target: number;
  lo: number;
  hi: number;
  word: string;
  scrambled: string;
  revealed: number;
  timer: number;
  total: number;
  doubles: string[];
  correctOrder: string[];
  names: Record<string, string>;
  teams: Record<string, 0 | 1>;
  teamScore: [number, number];
  decks: Record<Mode, number[]>;
  modeIdx: number;
  result?: Result;
  challengeNo: number;
}

export interface PartySnapshot extends BaseSnapshot {
  mode: Mode;
  prompt: string;
  options: Array<{ text: string; count: number; removed?: 1; correct?: 1 }>;
  answers: number;
  timeLeft: number;
  total: number;
  range?: [number, number];
  scrambled?: string;
  hint?: string;
  result?: Result;
  teamMode: boolean;
  teams?: Array<{ name: string; score: number; members: number; color: string }>;
  challengeNo: number;
  recentGuesses?: Array<{ name: string; value: number }>;
}

const LETTERS = ['A', 'B', 'C', 'D'];
const TEAM_COLORS = ['#a855f7', '#f97316'];

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export class PartyShow extends BaseGame<PartySnapshot, State> {
  protected st: State;
  private custom: Array<[string, string, ...string[]]>;

  constructor(ctx: SimContext) {
    super(manifest, ctx);
    this.custom = this.parseCustom();
    this.st = {
      mode: 'quiz', prompt: '', options: [], correct: 0, removed: [], votes: {}, counts: [], guesses: {}, target: 0, lo: 1, hi: 100,
      word: '', scrambled: '', revealed: 0, timer: 0, total: 0, doubles: [], correctOrder: [], names: {}, teams: {}, teamScore: [0, 0],
      decks: { quiz: [], poll: [], number: [], word: [] }, modeIdx: -1, challengeNo: 0,
    };
    this.nextChallenge();
  }

  private parseCustom(): Array<[string, string, ...string[]]> {
    const raw = String(this.setting<string>('customQuestions') ?? '');
    return raw
      .split(';')
      .map((q) => q.split('|').map((x) => x.trim()).filter(Boolean))
      .filter((p) => p.length >= 3 && p.length <= 5)
      .slice(0, 100)
      .map((p) => p.map((x) => x.slice(0, 120)) as [string, string, ...string[]]);
  }

  private modes(): Mode[] {
    const m: Mode[] = [];
    if (this.setting<boolean>('modeQuiz') !== false) m.push('quiz');
    if (this.setting<boolean>('modePoll') !== false) m.push('poll');
    if (this.setting<boolean>('modeNumber') !== false) m.push('number');
    if (this.setting<boolean>('modeWord') !== false) m.push('word');
    return m.length ? m : ['quiz'];
  }

  private draw(mode: Mode, size: number): number {
    const deck = this.st.decks[mode];
    if (!deck.length) {
      const idx = Array.from({ length: size }, (_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i);
        [idx[i], idx[j]] = [idx[j]!, idx[i]!];
      }
      deck.push(...idx);
    }
    return deck.pop()!;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  private nextChallenge(): void {
    const s = this.st;
    const modes = this.modes();
    s.modeIdx = (s.modeIdx + 1) % modes.length;
    s.mode = modes[s.modeIdx]!;
    s.challengeNo++;
    s.votes = {};
    s.guesses = {};
    s.removed = [];
    s.correctOrder = [];
    s.result = undefined;
    s.revealed = 0;
    s.total = s.timer = Math.max(5, this.num('roundSeconds') || 20);
    switch (s.mode) {
      case 'quiz': {
        const bank = [...this.custom, ...QUIZ] as Array<[string, string, ...string[]]>;
        const q = bank[this.draw('quiz', bank.length)]!;
        const [prompt, right, ...wrong] = q;
        const opts = this.shuffle([right, ...wrong].slice(0, 4));
        s.prompt = prompt;
        s.options = opts;
        s.correct = opts.indexOf(right);
        break;
      }
      case 'poll': {
        const p = POLLS[this.draw('poll', POLLS.length)]!;
        s.prompt = p[0];
        s.options = p.slice(1);
        s.correct = -1;
        break;
      }
      case 'number': {
        const max = Math.max(10, Math.round(this.num('numberMax') || 100));
        s.target = this.rng.int(1, max);
        s.lo = 1;
        s.hi = max;
        s.prompt = `Adivinhe o número de 1 a ${max}`;
        s.options = [];
        break;
      }
      case 'word': {
        const w = WORDS[this.draw('word', WORDS.length)]!;
        s.word = w;
        let sc = w;
        for (let k = 0; k < 6 && sc === w; k++) sc = this.shuffle(w.split('')).join('');
        s.scrambled = sc.toUpperCase();
        s.prompt = 'Desembaralhe a palavra!';
        s.options = [];
        break;
      }
    }
    s.counts = s.options.map(() => 0);
    this.emit({ type: 'roundStart', round: this.b.round });
  }

  private remember(v: { id: string; username?: string; nickname?: string }): string {
    const name = viewerName(v);
    this.st.names[v.id] = name;
    if (this.setting<boolean>('teamMode') && this.st.teams[v.id] === undefined) {
      let a = 0;
      let b = 0;
      for (const t of Object.values(this.st.teams)) t === 0 ? a++ : b++;
      this.st.teams[v.id] = a <= b ? 0 : 1;
    }
    return name;
  }

  private give(id: string, pts: number, reason: string): number {
    const s = this.st;
    let p = pts;
    const di = s.doubles.indexOf(id);
    if (di >= 0 && reason !== 'poll') {
      p *= 2;
      s.doubles.splice(di, 1);
    }
    this.addScore({ id, nickname: s.names[id] }, p, reason);
    const t = s.teams[id];
    if (t !== undefined && this.setting<boolean>('teamMode')) s.teamScore[t] += p;
    return p;
  }

  private resolve(): void {
    const s = this.st;
    let res: Result;
    switch (s.mode) {
      case 'quiz': {
        const winners = s.correctOrder.slice(0, 50).map((id, i) => ({ id, name: s.names[id] ?? id, pts: this.give(id, 10 + Math.max(0, 10 - i), 'quiz'), team: s.teams[id] }));
        const total = Object.keys(s.votes).length;
        res = { answer: `${LETTERS[s.correct]}) ${s.options[s.correct]}`, winners: winners.slice(0, 5), detail: `${winners.length} de ${total} acertaram` };
        break;
      }
      case 'poll': {
        const max = Math.max(...s.counts);
        const top = s.counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
        for (const id of Object.keys(s.votes)) this.give(id, 2, 'poll');
        const total = s.counts.reduce((a, b) => a + b, 0);
        res = {
          answer: total ? top.map((i) => s.options[i]).join(' / ') : 'Ninguém votou',
          winners: [],
          detail: total ? `${Math.round((max / total) * 100)}% dos ${total} votos` : 'Vote na próxima!',
        };
        break;
      }
      case 'number': {
        const ranked = Object.entries(s.guesses).sort((a, b) => Math.abs(a[1] - s.target) - Math.abs(b[1] - s.target));
        const prizes = [30, 15, 8];
        const winners = ranked.slice(0, 3).map(([id, g], i) => ({ id, name: `${s.names[id] ?? id} (${g})`, pts: this.give(id, prizes[i]! + (g === s.target ? 20 : 0), 'number'), team: s.teams[id] }));
        res = { answer: String(s.target), winners, detail: ranked.length ? `${ranked.length} palpites` : 'Ninguém arriscou' };
        break;
      }
      case 'word': {
        const id = s.correctOrder[0];
        const winners = id ? [{ id, name: s.names[id] ?? id, pts: this.give(id, 30, 'word'), team: s.teams[id] }] : [];
        res = { answer: s.word.toUpperCase(), winners, detail: id ? 'Mais rápido do chat!' : 'Ninguém acertou' };
        break;
      }
    }
    s.result = res;
    const w = res.winners[0];
    this.emitFx(res.winners.length ? 'correct' : 'reveal', this.W / 2, this.H / 2);
    this.endRound(w ? { id: w.id, name: w.name.replace(/ \(\d+\)$/, '') } : undefined, { mode: s.mode, answer: res.answer, prompt: s.prompt }, Math.max(2, this.num('revealSeconds') || 6));
  }

  protected update(dt: number): void {
    this.st.timer -= dt;
    if (this.st.timer <= 0) this.resolve();
  }

  protected resetRound(): void {
    this.nextChallenge();
  }

  protected onAction(action: GameActionMessage, q: number): void {
    const s = this.st;
    const v = action.viewer;
    switch (action.actionId) {
      case 'double_points':
        if (!v?.id) return;
        this.remember(v);
        if (!s.doubles.includes(v.id)) s.doubles.push(v.id);
        this.notice(`✨ ${viewerName(v)} vale o dobro no próximo acerto`, '#facc15', 3);
        break;
      case 'hint':
        if (this.b.phase !== 'playing') return;
        if (s.mode === 'quiz') {
          const wrong = s.options.map((_, i) => i).filter((i) => i !== s.correct && !s.removed.includes(i));
          if (wrong.length > 1) s.removed.push(this.rng.pick(wrong));
        } else if (s.mode === 'word') s.revealed = Math.min(s.word.length - 1, s.revealed + 1);
        else if (s.mode === 'number') {
          const span = s.hi - s.lo;
          const lo = Math.max(s.lo, s.target - Math.floor(span / 4));
          s.lo = lo;
          s.hi = Math.min(s.hi, lo + Math.ceil(span / 2));
        }
        this.notice(`💡 Dica liberada por ${v ? viewerName(v) : 'alguém'}`, '#fde047', 3);
        break;
      case 'add_time':
        if (this.b.phase !== 'playing') return;
        s.timer = Math.min(s.total + 60, s.timer + this.param(action, 'seconds', 5) * q);
        break;
      case 'skip':
        if (this.b.phase !== 'playing') return;
        this.notice('⏭️ Rodada pulada', '#94a3b8', 2);
        this.nextChallenge();
        break;
    }
  }

  protected override onSignal(sig: ViewerSignalMessage): void {
    if (sig.type === 'GIFT') this.addScore(sig.viewer, Math.max(1, Math.round(sig.value)), 'gift');
    if (sig.type !== 'CHAT' || !sig.text || !sig.viewer?.id || this.b.phase !== 'playing') return;
    const s = this.st;
    const id = sig.viewer.id;
    const txt = norm(sig.text);
    const first = txt.split(/\s+/)[0] ?? '';
    if (s.mode === 'quiz' || s.mode === 'poll') {
      if (s.votes[id] !== undefined) return;
      let idx = LETTERS.findIndex((l) => l.toLowerCase() === first);
      if (idx < 0 && /^[1-4]$/.test(first)) idx = Number(first) - 1;
      if (idx < 0) idx = s.options.findIndex((o) => norm(o) === txt);
      if (idx < 0 || idx >= s.options.length || s.removed.includes(idx)) return;
      this.remember(sig.viewer);
      s.votes[id] = idx;
      s.counts[idx]!++;
      if (s.mode === 'quiz' && idx === s.correct) s.correctOrder.push(id);
    } else if (s.mode === 'number') {
      if (s.guesses[id] !== undefined || !/^\d{1,6}$/.test(first)) return;
      this.remember(sig.viewer);
      s.guesses[id] = Number(first);
    } else if (s.mode === 'word') {
      if (txt.replace(/\s+/g, '') === s.word) {
        this.remember(sig.viewer);
        s.correctOrder.push(id);
        this.resolve();
      }
    }
  }

  snapshot(): PartySnapshot {
    const s = this.st;
    const reveal = this.b.phase === 'intermission';
    const teamMode = this.setting<boolean>('teamMode') === true;
    let hint: string | undefined;
    if (s.mode === 'word' && s.revealed > 0) hint = s.word.slice(0, s.revealed).toUpperCase() + '_'.repeat(s.word.length - s.revealed);
    const guesses = Object.entries(s.guesses);
    return {
      ...this.baseSnapshot(),
      mode: s.mode,
      prompt: s.prompt,
      options: s.options.map((t, i) => {
        const o: PartySnapshot['options'][number] = { text: t, count: s.counts[i] ?? 0 };
        if (s.removed.includes(i)) o.removed = 1;
        if (reveal && i === s.correct) o.correct = 1;
        return o;
      }),
      answers: s.mode === 'number' ? guesses.length : Object.keys(s.votes).length,
      timeLeft: Math.max(0, Math.ceil(s.timer)),
      total: s.total,
      range: s.mode === 'number' ? [s.lo, s.hi] : undefined,
      scrambled: s.mode === 'word' ? s.scrambled : undefined,
      hint,
      result: reveal ? s.result : undefined,
      teamMode,
      teams: teamMode
        ? [0, 1].map((i) => ({ name: String(this.setting<string>(i === 0 ? 'teamAName' : 'teamBName')).slice(0, 16), score: s.teamScore[i]!, members: Object.values(s.teams).filter((t) => t === i).length, color: TEAM_COLORS[i]! }))
        : undefined,
      challengeNo: s.challengeNo,
      recentGuesses: s.mode === 'number' ? guesses.slice(-6).map(([id, value]) => ({ name: s.names[id] ?? id, value })) : undefined,
    };
  }
}
