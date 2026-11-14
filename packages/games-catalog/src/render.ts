import type { GameRenderer } from '@live-arena/game-engine/render';
import type { BaseSnapshot } from '@live-arena/game-engine';
import { renderer as snake } from '@live-arena/game-snake-live/render';
import { renderer as battle } from '@live-arena/game-battle-arena/render';
import { renderer as race } from '@live-arena/game-avatar-race/render';
import { renderer as plinko } from '@live-arena/game-plinko-live/render';
import { renderer as survival } from '@live-arena/game-survival-arena/render';
import { renderer as melonPop } from '@live-arena/game-melon-pop/render';
import { renderer as tugOfWar } from '@live-arena/game-tug-of-war/render';

/** Registro de renderizadores (lado navegador). */
export const GAME_RENDERERS: Record<string, GameRenderer<BaseSnapshot>> = {
  'snake-live': snake as unknown as GameRenderer<BaseSnapshot>,
  'battle-arena': battle as unknown as GameRenderer<BaseSnapshot>,
  'avatar-race': race as unknown as GameRenderer<BaseSnapshot>,
  'plinko-live': plinko as unknown as GameRenderer<BaseSnapshot>,
  'survival-arena': survival as unknown as GameRenderer<BaseSnapshot>,
  'melon-pop': melonPop as unknown as GameRenderer<BaseSnapshot>,
  'tug-of-war': tugOfWar as unknown as GameRenderer<BaseSnapshot>,
};
