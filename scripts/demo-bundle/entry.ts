import { defaultConfigFor, type BaseSnapshot, type GameDomainEvent, type GameSimulation } from '@live-arena/game-engine';
import { Stage } from '@live-arena/game-engine/render';
import { GAME_MODULES } from '@live-arena/games';
import { GAME_RENDERERS } from '@live-arena/games/render';
import type { GameConfigBody } from '@live-arena/shared';

type Ev = { type: 'GIFT' | 'LIKE' | 'CHAT' | 'FOLLOW' | 'SHARE'; diamonds?: number; qty?: number; likes?: number; comment?: string; giftName?: string; user?: string };
interface Hooks {
  onFeed(i: { type: string; user: string; detail: string; actions: number; throttled: number }): void;
  onDomain(e: GameDomainEvent[]): void;
  onSnap(s: BaseSnapshot): void;
}
const NAMES = ['ana_gamer', 'bruno.live', 'carla_play', 'davi_123', 'eduarda', 'felipe.tt', 'gabi_star', 'hugo_dev', 'isa.moon', 'joao_pro'];

(window as unknown as Record<string, unknown>).LA = {
  games: Object.values(GAME_MODULES).map((m) => m.manifest),
  defaultConfig: (id: string): GameConfigBody => defaultConfigFor(GAME_MODULES[id]!.manifest),
  names: NAMES,
  start(canvas: HTMLCanvasElement, gameId: string, config: GameConfigBody, sound: boolean, hooks: Hooks) {
    const mod = GAME_MODULES[gameId]!;
    const sim: GameSimulation = mod.create({ seed: Math.floor(Math.random() * 1e9), config, simulated: true });
    const stage = new Stage<BaseSnapshot>(canvas, GAME_RENDERERS[gameId]!, { maxFps: 60, soundEnabled: sound });
    stage.start();
    let ticks = 0;
    let likes = 0;
    let seq = 0;
    const cd = new Map<string, number>();
    let last: BaseSnapshot | null = null;
    const timer = setInterval(() => {
      sim.tick(1 / 30);
      if (++ticks % 2 === 0) {
        last = sim.snapshot();
        sim.consumeFx();
        stage.push(last);
        const d = sim.drainEvents();
        if (d.length) hooks.onDomain(d);
        if (ticks % 30 === 0) hooks.onSnap(last);
      }
    }, 1000 / 30);
    const fire = (ev: Ev) => {
      const name = ev.user || NAMES[Math.floor(Math.random() * NAMES.length)]!;
      const viewer = { id: `demo-${name}`, username: name, nickname: name };
      const base = { eventId: `l${ticks}-${seq++}`, simulated: true, at: Date.now() };
      let actions = 0;
      let throttled = 0;
      const now = Date.now();
      for (const r of config.rules) {
        const t = r.trigger;
        if (!r.enabled) continue;
        let q = 0;
        if (ev.type === 'GIFT' && t.kind === 'GIFT') {
          if ((t.minDiamonds === undefined || (ev.diamonds ?? 1) >= t.minDiamonds) && (!t.giftName || t.giftName.toLowerCase() === (ev.giftName ?? '').toLowerCase())) q = r.scaleWithQuantity ? Math.min(ev.qty ?? 1, r.maxQuantity) : 1;
        } else if (ev.type === 'LIKE' && t.kind === 'LIKE_THRESHOLD') {
          const c = Math.floor((likes + (ev.likes ?? 0)) / t.every) - Math.floor(likes / t.every);
          if (c > 0) q = Math.min(c, r.maxQuantity);
        } else if (ev.type === 'CHAT' && t.kind === 'CHAT_COMMAND') {
          if ((ev.comment ?? '').trim().toLowerCase().split(/\s+/)[0] === t.command.toLowerCase()) q = 1;
        } else if ((ev.type === 'FOLLOW' || ev.type === 'SHARE') && t.kind === ev.type) q = 1;
        if (!q) continue;
        const gk = `g:${r.id}`;
        const uk = `u:${r.id}:${viewer.id}`;
        if ((r.cooldownMs && now - (cd.get(gk) ?? 0) < r.cooldownMs) || (r.perUserCooldownMs && now - (cd.get(uk) ?? 0) < r.perUserCooldownMs)) {
          throttled++;
          continue;
        }
        cd.set(gk, now);
        cd.set(uk, now);
        sim.applyAction({ kind: 'game', actionId: r.action, params: r.params, quantity: q, viewer, ruleId: r.id, ...base });
        actions++;
      }
      if (ev.type === 'LIKE') likes += ev.likes ?? 0;
      const value = ev.type === 'GIFT' ? (ev.diamonds ?? 1) * (ev.qty ?? 1) : ev.type === 'LIKE' ? (ev.likes ?? 1) : 1;
      sim.applySignal({ kind: 'signal', type: ev.type, viewer, value, text: ev.comment, ...base });
      const detail = ev.type === 'GIFT' ? `${ev.giftName ?? 'Presente'} x${ev.qty ?? 1}` : ev.type === 'LIKE' ? `${ev.likes} curtidas` : ev.type === 'CHAT' ? (ev.comment ?? '') : '';
      hooks.onFeed({ type: ev.type, user: name, detail, actions, throttled });
    };
    return {
      fire,
      control: (c: string, args?: Record<string, unknown>) => sim.control(c as never, args),
      snapshot: () => last,
      stop() { clearInterval(timer); stage.stop(); },
    };
  },
};
