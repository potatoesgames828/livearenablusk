import { defaultConfigFor, type BaseSnapshot, type GameSimulation } from '@live-arena/game-engine';
import { Stage } from '@live-arena/game-engine/render';
import { GAME_MODULES } from '@live-arena/games';
import { GAME_RENDERERS } from '@live-arena/games/render';

const w = window as unknown as Record<string, unknown>;
w.LA = {
  games: Object.values(GAME_MODULES).map((m) => m.manifest),
  start(canvas: HTMLCanvasElement, gameId: string, aspect: 'vertical' | 'horizontal', sound: boolean) {
    const mod = GAME_MODULES[gameId]!;
    const config = { ...defaultConfigFor(mod.manifest), aspect };
    const sim: GameSimulation = mod.create({ seed: Math.floor(Math.random() * 1e9), config, simulated: true });
    const stage = new Stage<BaseSnapshot>(canvas, GAME_RENDERERS[gameId]!, { maxFps: 60, soundEnabled: sound });
    stage.start();
    let ticks = 0;
    let likes = 0;
    const timer = setInterval(() => {
      sim.tick(1 / 30);
      if (++ticks % 2 === 0) {
        const s = sim.snapshot();
        sim.consumeFx();
        sim.drainEvents();
        stage.push(s);
      }
    }, 1000 / 30);
    const names = ['ana_gamer', 'bruno.live', 'carla_play', 'davi_123', 'eduarda', 'felipe.tt', 'gabi_star', 'hugo_dev'];
    const fire = (ev: { type: string; diamonds?: number; qty?: number; likes?: number; comment?: string }) => {
      const name = names[Math.floor(Math.random() * names.length)]!;
      const viewer = { id: `demo-${name}`, username: name, nickname: name };
      const base = { eventId: `l${ticks}${Math.random()}`, simulated: true, at: Date.now() };
      const act = (r: (typeof config.rules)[number], q: number) => sim.applyAction({ kind: 'game', actionId: r.action, params: r.params, quantity: q, viewer, ruleId: r.id, ...base });
      for (const r of config.rules) {
        const t = r.trigger;
        if (!r.enabled) continue;
        if (ev.type === 'GIFT' && t.kind === 'GIFT' && (t.minDiamonds === undefined || (ev.diamonds ?? 1) >= t.minDiamonds)) act(r, r.scaleWithQuantity ? Math.min(ev.qty ?? 1, r.maxQuantity) : 1);
        else if (ev.type === 'LIKE' && t.kind === 'LIKE_THRESHOLD') {
          const c = Math.floor((likes + (ev.likes ?? 0)) / t.every) - Math.floor(likes / t.every);
          if (c > 0) act(r, Math.min(c, r.maxQuantity));
        } else if (ev.type === 'CHAT' && t.kind === 'CHAT_COMMAND' && (ev.comment ?? '').toLowerCase().startsWith(t.command.toLowerCase())) act(r, 1);
        else if ((ev.type === 'FOLLOW' || ev.type === 'SHARE') && t.kind === ev.type) act(r, 1);
      }
      if (ev.type === 'LIKE') likes += ev.likes ?? 0;
      const sigType = ev.type as 'GIFT' | 'LIKE' | 'CHAT' | 'FOLLOW' | 'SHARE';
      sim.applySignal({ kind: 'signal', type: sigType, viewer, value: ev.type === 'GIFT' ? (ev.diamonds ?? 1) * (ev.qty ?? 1) : ev.type === 'LIKE' ? (ev.likes ?? 1) : 1, text: ev.comment, ...base });
    };
    return {
      fire,
      commands: config.rules.flatMap((r) => (r.trigger.kind === 'CHAT_COMMAND' ? [r.trigger.command] : [])),
      control: (c: 'PAUSE' | 'RESUME' | 'RESET_ROUND') => sim.control(c),
      stop() { clearInterval(timer); stage.stop(); },
    };
  },
};
