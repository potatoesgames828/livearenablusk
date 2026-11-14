import { describe, expect, it } from 'vitest';
import type { GameActionMessage, ViewerSignalMessage } from '@live-arena/shared';
import { defaultConfigFor, validateConfigAgainstManifest, GameHost, type GameDomainEvent } from '@live-arena/game-engine';
import { GAME_MODULES, listManifests } from './index';

function action(actionId: string, viewer = 'v1', quantity = 1, params: Record<string, number | string | boolean> = {}): GameActionMessage {
  return { kind: 'game', actionId, params, quantity, viewer: { id: viewer, username: viewer }, eventId: `e-${Math.random()}`, ruleId: 'r', simulated: true, at: 0 };
}
function signal(type: ViewerSignalMessage['type'], viewer = 'v1', value = 1, text?: string): ViewerSignalMessage {
  return { kind: 'signal', type, viewer: { id: viewer, username: viewer }, value, text, eventId: 'x', simulated: true, at: 0 };
}

describe('catálogo de jogos', () => {
  it('possui os cinco jogos com manifestos válidos', () => {
    const ids = listManifests().map((m) => m.id).sort();
    expect(ids).toEqual(['avatar-race', 'battle-arena', 'plinko-live', 'snake-live', 'survival-arena']);
    for (const m of listManifests()) {
      const cfg = defaultConfigFor(m);
      expect(validateConfigAgainstManifest(m, cfg)).toEqual([]);
      expect(m.actions.length).toBeGreaterThan(2);
      expect(m.defaultRules.length).toBeGreaterThan(2);
    }
  });
});

for (const [id, mod] of Object.entries(GAME_MODULES)) {
  describe(`jogo ${id}`, () => {
    for (const aspect of ['vertical', 'horizontal'] as const) {
      it(`roda sozinho sem eventos (${aspect}) e gera snapshots válidos`, () => {
        const cfg = { ...defaultConfigFor(mod.manifest), aspect };
        const sim = mod.create({ seed: 42, config: cfg, simulated: true });
        for (let i = 0; i < 30 * 60; i++) sim.tick(1 / 30); // 60s simulados
        const snap = sim.snapshot();
        expect(snap.gameId).toBe(id);
        expect(snap.aspect).toBe(aspect);
        expect(snap.width).toBe(aspect === 'vertical' ? 1080 : 1920);
        expect(JSON.stringify(snap).length).toBeLessThan(60_000);
      });
    }

    it('reage a todas as ações do manifesto sem lançar erro e pontua espectadores', () => {
      const sim = mod.create({ seed: 7, config: defaultConfigFor(mod.manifest), simulated: true });
      for (const sig of ['CHAT', 'GIFT', 'LIKE', 'FOLLOW'] as const) sim.applySignal(signal(sig, 'v2', 5, '!join'));
      for (let round = 0; round < 3; round++) {
        for (const a of mod.manifest.actions) {
          const params: Record<string, number | string | boolean> = {};
          for (const p of a.params) params[p.key] = p.options?.[0]?.value ?? p.default;
          sim.applyAction(action(a.id, `v${round}`, 3, params));
        }
        for (let i = 0; i < 90; i++) sim.tick(1 / 30);
      }
      const events = sim.drainEvents();
      expect(events.some((e: GameDomainEvent) => e.type === 'participation')).toBe(true);
      expect(events.some((e: GameDomainEvent) => e.type === 'score')).toBe(true);
    });

    it('é determinístico pela semente e restaura checkpoint', () => {
      const cfg = defaultConfigFor(mod.manifest);
      const a = mod.create({ seed: 99, config: cfg, simulated: false });
      const b = mod.create({ seed: 99, config: cfg, simulated: false });
      for (let i = 0; i < 300; i++) {
        a.tick(1 / 30);
        b.tick(1 / 30);
        if (i === 100) {
          a.applyAction(action(mod.manifest.actions[0]!.id));
          b.applyAction(action(mod.manifest.actions[0]!.id));
        }
      }
      const strip = (s: unknown) => JSON.stringify({ ...(s as object), fx: [] });
      expect(strip(a.snapshot())).toBe(strip(b.snapshot()));
      const saved = JSON.parse(JSON.stringify(a.serialize()));
      const c = mod.create({ seed: 1, config: cfg, simulated: false });
      c.restore(saved);
      for (let i = 0; i < 60; i++) {
        a.tick(1 / 30);
        c.tick(1 / 30);
      }
      expect(strip(c.snapshot())).toBe(strip(a.snapshot()));
    });

    it('pausa, retoma e reinicia rodada', () => {
      const sim = mod.create({ seed: 3, config: defaultConfigFor(mod.manifest), simulated: true });
      sim.control('PAUSE');
      const t0 = JSON.stringify({ ...sim.snapshot(), t: 0, notices: [] });
      for (let i = 0; i < 30; i++) sim.tick(1 / 30);
      expect(sim.snapshot().phase).toBe('paused');
      expect(JSON.stringify({ ...sim.snapshot(), t: 0, notices: [] })).toBe(t0);
      sim.control('RESUME');
      expect(sim.snapshot().phase).toBe('playing');
      sim.control('RESET_SCORES');
      sim.control('RESET_ROUND');
      expect(sim.snapshot().phase).toBe('playing');
    });
  });
}

describe('GameHost implementa LiveGamePlugin', () => {
  it('ciclo initialize/start/pause/resume/stop/reset', async () => {
    const mod = GAME_MODULES['snake-live']!;
    const host = new GameHost(mod, 5, true);
    await host.initialize(defaultConfigFor(mod.manifest));
    expect(((await host.getState()) as { phase: string }).phase).toBe('stopped');
    await host.start();
    host.step(0.5);
    expect(((await host.getState()) as { phase: string }).phase).toBe('playing');
    await host.pause();
    expect(((await host.getState()) as { phase: string }).phase).toBe('paused');
    await host.resume();
    await host.stop();
    expect(((await host.getState()) as { phase: string }).phase).toBe('stopped');
    await host.reset();
    expect(((await host.getState()) as { phase: string }).phase).toBe('playing');
  });
});
