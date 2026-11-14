'use client';
import { useEffect, useRef } from 'react';
import { Stage, type GameRenderer } from '@live-arena/game-engine/render';
import type { BaseSnapshot } from '@live-arena/game-engine';
import { GAME_RENDERERS } from '@live-arena/games/render';

const fallback: GameRenderer<BaseSnapshot> = {
  draw(ctx, { snap }) {
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, snap.width, snap.height);
  },
};

export interface GameCanvasHandle {
  push(s: BaseSnapshot): void;
}

/**
 * Canvas de jogo responsivo. A tela de CONTROLE pode ter qualquer formato;
 * o jogo é sempre desenhado na proporção de vídeo configurada (9:16 ou 16:9)
 * com letterbox, exatamente como sairá na transmissão.
 */
export function GameCanvas({
  onReady, sound = false, mode = 'contain', maxFps, className, label = 'Pré-visualização do jogo',
}: {
  onReady: (h: GameCanvasHandle) => void;
  sound?: boolean;
  mode?: 'contain' | 'exact';
  maxFps?: number;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const gameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Em telas pequenas/baterias, limita o FPS da pré-visualização.
    const lowPower = typeof window !== 'undefined' && (window.matchMedia('(max-width: 767px)').matches || (navigator as { hardwareConcurrency?: number }).hardwareConcurrency! <= 4);
    const stage = new Stage(ref.current, fallback, { maxFps: maxFps ?? (mode === 'exact' ? 60 : lowPower ? 30 : 60), fit: mode, soundEnabled: sound });
    stageRef.current = stage;
    stage.start();
    onReady({
      push(s) {
        if (gameRef.current !== s.gameId) {
          gameRef.current = s.gameId;
          stage.setRenderer(GAME_RENDERERS[s.gameId] ?? fallback);
        }
        stage.push(s);
      },
    });
    return () => stage.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    stageRef.current?.setSound(sound);
  }, [sound]);

  return (
    <div className={className ?? 'relative h-full w-full'}>
      <canvas ref={ref} role="img" aria-label={label} className="block" />
    </div>
  );
}
