'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameActionMessage, GameConfigBody, ViewerSignalMessage } from '@live-arena/shared';
import type { BaseSnapshot, GameSimulation } from '@live-arena/game-engine';
import { getGameModule } from '@live-arena/games';
import type { GameCanvasHandle } from '@/components/game-canvas';

const NAMES = ['ana_gamer', 'bruno.live', 'carla_play', 'davi_123', 'eduarda', 'felipe.tt', 'gabi_star', 'hugo_dev'];
const pick = () => NAMES[Math.floor(Math.random() * NAMES.length)]!;

export type DemoEvent =
  | { type: 'GIFT'; diamonds: number; quantity?: number }
  | { type: 'LIKE'; count: number }
  | { type: 'CHAT'; comment: string }
  | { type: 'FOLLOW' }
  | { type: 'SHARE' };

/**
 * Modo demonstração 100% local: a simulação roda no navegador usando as
 * mesmas regras configuradas. Útil para testar sem servidor e sem LIVE.
 * Todo snapshot é marcado como simulado.
 */
export function useLocalGame(gameId: string | null, config: GameConfigBody | null) {
  const simRef = useRef<GameSimulation | null>(null);
  const canvasRef = useRef<GameCanvasHandle | null>(null);
  const likesRef = useRef(0);
  const [snapshot, setSnapshot] = useState<BaseSnapshot | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!gameId || !config) return;
    const mod = getGameModule(gameId);
    if (!mod) return;
    const sim = mod.create({ seed: Math.floor(Math.random() * 1e9), config, simulated: true });
    simRef.current = sim;
    likesRef.current = 0;
    let ticks = 0;
    const timer = setInterval(() => {
      sim.tick(1 / 30);
      if (++ticks % 2 === 0) {
        const s = sim.snapshot();
        sim.consumeFx();
        sim.drainEvents();
        canvasRef.current?.push(s);
        if (ticks % 30 === 0) setSnapshot(s);
      }
    }, 1000 / 30);
    return () => {
      clearInterval(timer);
      simRef.current = null;
    };
  }, [gameId, config]);

  const fire = useCallback(
    (ev: DemoEvent, username?: string) => {
      const sim = simRef.current;
      if (!sim || !config) return;
      const name = username || pick();
      const viewer = { id: `demo-${name}`, username: name, nickname: name };
      const base = { eventId: `local-${seq.current++}`, simulated: true, at: Date.now() };
      const signal = (type: ViewerSignalMessage['type'], value: number, text?: string) =>
        sim.applySignal({ kind: 'signal', type, viewer, value, text, ...base });
      const act = (ruleId: string, actionId: string, params: GameActionMessage['params'], quantity: number) =>
        sim.applyAction({ kind: 'game', actionId, params, quantity, viewer, ruleId, ...base });
      for (const rule of config.rules) {
        if (!rule.enabled) continue;
        const t = rule.trigger;
        if (ev.type === 'GIFT' && t.kind === 'GIFT' && (t.minDiamonds === undefined || ev.diamonds >= t.minDiamonds)) {
          const q = rule.scaleWithQuantity ? Math.min(ev.quantity ?? 1, rule.maxQuantity) : 1;
          act(rule.id, rule.action, rule.params, q);
        } else if (ev.type === 'LIKE' && t.kind === 'LIKE_THRESHOLD') {
          const before = likesRef.current;
          const after = before + ev.count;
          const crossed = Math.floor(after / t.every) - Math.floor(before / t.every);
          if (crossed > 0) act(rule.id, rule.action, rule.params, Math.min(crossed, rule.maxQuantity));
        } else if (ev.type === 'CHAT' && t.kind === 'CHAT_COMMAND' && ev.comment.trim().toLowerCase().startsWith(t.command.toLowerCase())) {
          act(rule.id, rule.action, rule.params, 1);
        } else if ((ev.type === 'FOLLOW' || ev.type === 'SHARE') && t.kind === ev.type) {
          act(rule.id, rule.action, rule.params, 1);
        }
      }
      if (ev.type === 'LIKE') likesRef.current += ev.count;
      if (ev.type === 'GIFT') signal('GIFT', ev.diamonds * (ev.quantity ?? 1));
      else if (ev.type === 'LIKE') signal('LIKE', ev.count);
      else if (ev.type === 'CHAT') signal('CHAT', 1, ev.comment);
      else signal(ev.type, 1);
    },
    [config],
  );

  const control = useCallback((cmd: 'PAUSE' | 'RESUME' | 'RESET_ROUND' | 'RESET_SCORES') => simRef.current?.control(cmd), []);

  return {
    attach: (h: GameCanvasHandle) => {
      canvasRef.current = h;
    },
    fire,
    control,
    snapshot,
  };
}
