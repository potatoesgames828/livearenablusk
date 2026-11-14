import { describe, expect, it } from 'vitest';
import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { defaultConfigFor, type GameDomainEvent, type GameSimulation } from '@live-arena/game-engine';
import { GAME_MODULES } from './index';

let seq = 0;
const act = (actionId: string, viewer: string, params: Record<string, number | string | boolean> = {}, quantity = 1): GameActionMessage => ({ kind: 'game', actionId, params, quantity, viewer: { id: viewer, nickname: viewer }, eventId: `a${seq++}`, ruleId: 'r', simulated: true, at: 0 });
const chat = (viewer: string, text: string): ViewerSignalMessage => ({ kind: 'signal', type: 'CHAT', viewer: { id: viewer, nickname: viewer }, value: 1, text, eventId: `c${seq++}`, simulated: true, at: 0 });

function make(id: string, settings: Record<string, number | string | boolean> = {}, seed = 3): GameSimulation {
  const mod = GAME_MODULES[id]!;
  const cfg = defaultConfigFor(mod.manifest);
  cfg.settings = { ...cfg.settings, ...settings };
  return mod.create({ seed, config: cfg, simulated: false });
}
function run(sim: GameSimulation, seconds: number, each?: (t: number) => void): GameDomainEvent[] {
  const out: GameDomainEvent[] = [];
  for (let i = 0; i < seconds * 30; i++) {
    sim.tick(1 / 30);
    if (each && i % 30 === 0) each(i / 30);
    out.push(...sim.drainEvents());
  }
  return out;
}
const snap = <T,>(sim: GameSimulation) => sim.snapshot() as unknown as T;

describe('Battle Arena v2', () => {
  it('lobby por palavra-chave → partida → pódio → novo lobby', () => {
    const sim = make('battle-arena', { lobbySeconds: 5, killsToWin: 4, practiceBots: 0, minToStart: 2, resultsSeconds: 3 });
    for (let i = 0; i < 6; i++) sim.applySignal(chat(`v${i}`, i % 2 ? 'Azul' : 'vermelho'));
    const s0 = snap<{ match: { stage: string; participants: number; teams: Array<{ count: number }> }; fighters: unknown[] }>(sim);
    expect(s0.match.stage).toBe('lobby');
    expect(s0.match.participants).toBe(6);
    expect(s0.match.teams.map((t) => t.count)).toEqual([3, 3]);
    expect(s0.fighters).toHaveLength(6);
    const ev = run(sim, 120, () => sim.applyAction(act('barrage', 'v0', { shots: 3 })));
    expect(ev.some((e) => e.type === 'roundStart')).toBe(true);
    const end = ev.find((e) => e.type === 'roundEnd');
    expect(end).toBeTruthy();
    expect((end as { summary: { podium: unknown[] } }).summary.podium.length).toBeGreaterThan(0);
  });

  it('bots de treino completam a arena e saem quando o público entra', () => {
    const sim = make('battle-arena', { practiceBots: 4, minToStart: 2 });
    expect(snap<{ match: { participants: number } }>(sim).match.participants).toBe(4);
    for (let i = 0; i < 3; i++) sim.applySignal(chat(`r${i}`, 'entrar'));
    expect(snap<{ match: { participants: number } }>(sim).match.participants).toBe(4); // 3 reais + 1 bot
  });

  it('rajada de presente de quem não entrou inscreve a pessoa (entrada tardia)', () => {
    const sim = make('battle-arena', { lobbySeconds: 3, practiceBots: 4, lateJoin: true });
    run(sim, 5);
    sim.applyAction(act('barrage', 'fa', { shots: 2 }));
    expect(snap<{ fighters: Array<{ pid: string }> }>(sim).fighters.some((f) => f.pid === 'fa')).toBe(true);
  });
});

describe('Melancia Elástica', () => {
  it('estoura ao atingir a resistência secreta e o último elástico vence', () => {
    const sim = make('melon-pop', { strength: 'short', bandSpeed: 'fast' });
    sim.applyAction(act('band', 'ana', { count: 100 }));
    const ev = run(sim, 6);
    const end = ev.find((e) => e.type === 'roundEnd') as { winner?: { name: string } } | undefined;
    expect(end?.winner?.name).toBe('ana');
    expect(snap<{ popped: boolean }>(sim).popped).toBe(true);
  });
  it('elástico grátis vale uma vez por pessoa por fruta e a tesoura corta', () => {
    const sim = make('melon-pop', { strength: 'huge' });
    for (let i = 0; i < 3; i++) sim.applySignal(chat('bia', 'elástico'));
    run(sim, 3);
    expect(snap<{ count: number }>(sim).count).toBe(1);
    sim.applyAction(act('band', 'caio', { count: 20 }));
    run(sim, 20);
    sim.applyAction(act('scissors', 'duda', { count: 10 }));
    expect(snap<{ count: number }>(sim).count).toBe(11);
  });
});

describe('Cabo de Guerra', () => {
  it('times entram por palavra e puxões marcam ponto', () => {
    const sim = make('tug-of-war', { pullsToWin: 20, bestOf: 1 });
    sim.applySignal(chat('a', 'meninos'));
    sim.applySignal(chat('b', 'Meninas'));
    const ev = run(sim, 10, () => sim.applyAction(act('pull', 'a', { force: 30, team: 'sender' })));
    const end = ev.find((e) => e.type === 'roundEnd') as { summary: { winnerTeam: string } } | undefined;
    expect(end?.summary.winnerTeam).toBe('Meninos');
  });
});

describe('Guerra de Torres', () => {
  it('empilha, derruba, rouba e registra vitória na meta', () => {
    const sim = make('tower-war', { targetHeight: 30 });
    sim.applySignal(chat('a', 'torre1'));
    sim.applySignal(chat('b', 'torre2'));
    sim.applyAction(act('grow', 'b', { blocks: 10 }));
    sim.applyAction(act('wreck', 'a', { blocks: 4 }));
    sim.applyAction(act('steal', 'a', { blocks: 3 }));
    let s = snap<{ towers: Array<{ height: number; wins: number }> }>(sim);
    expect(s.towers.map((t) => t.height)).toEqual([3, 3]);
    sim.applyAction(act('grow', 'a', { blocks: 30 }));
    s = snap(sim);
    expect(s.towers[0]!.wins).toBe(1);
    expect(s.towers[0]!.height).toBeLessThan(30);
  });
});

describe('Arena do Tapa', () => {
  it('fila, duelo até o nocaute e o vencedor permanece', () => {
    const sim = make('slap-arena', { demoDuels: false, pace: 'fast' });
    sim.applySignal(chat('ana', 'tapa'));
    sim.applySignal(chat('bia', 'TAPA'));
    sim.applySignal(chat('caio', 'tapa'));
    sim.applyAction(act('weapon', 'ana', { level: '5' }));
    const ev = run(sim, 40);
    const end = ev.find((e) => e.type === 'roundEnd') as { winner?: { name: string } } | undefined;
    expect(end?.winner?.name).toBe('ana');
    const s = snap<{ left?: { id: string }; queueSize: number }>(sim);
    expect(s.left?.id).toBe('ana');
  });
});

describe('Corrida Animal', () => {
  it('escolha de animal pelo chat e chegada com pódio', () => {
    const sim = make('animal-race', { lobbySeconds: 3, trackLength: 'short', practiceBots: 3, minToStart: 2 });
    sim.applySignal(chat('ana', 'coelho'));
    sim.applySignal(chat('bia', 'tartaruga'));
    const s0 = snap<{ runners: Array<{ id: string; a: string }> }>(sim);
    expect(s0.runners.find((r) => r.id === 'ana')?.a).toBe('coelho');
    expect(s0.runners.find((r) => r.id === 'bia')?.a).toBe('tartaruga');
    const ev = run(sim, 90, (t) => t > 4 && sim.applyAction(act('boost', 'ana', { seconds: 2 })));
    const end = ev.find((e) => e.type === 'roundEnd') as { summary: { podium: Array<{ name: string }> } } | undefined;
    expect(end?.summary.podium.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Show de Perguntas', () => {
  it('quiz pontua quem acerta; palavra embaralhada encerra no primeiro acerto', () => {
    const sim = make('party-show', { modePoll: false, modeNumber: false, roundSeconds: 10, revealSeconds: 2 });
    const s = snap<{ mode: string; options: Array<{ text: string }> }>(sim);
    expect(s.mode).toBe('quiz');
    // descobre a alternativa certa pelo estado interno serializado
    const st = (sim.serialize() as { st: { correct: number } }).st;
    sim.applySignal(chat('ana', 'ABCD'[st.correct]!));
    sim.applySignal(chat('bia', 'ABCD'[(st.correct + 1) % 4]!));
    const ev = run(sim, 11);
    const end = ev.find((e) => e.type === 'roundEnd') as { winner?: { name: string } } | undefined;
    expect(end?.winner?.name).toBe('ana');
    run(sim, 3);
    const w = snap<{ mode: string }>(sim);
    expect(w.mode).toBe('word');
    const word = (sim.serialize() as { st: { word: string } }).st.word;
    sim.applySignal(chat('caio', word.toUpperCase()));
    const ev2 = sim.drainEvents();
    expect((ev2.find((e) => e.type === 'roundEnd') as { winner?: { name: string } } | undefined)?.winner?.name).toBe('caio');
  });
});
