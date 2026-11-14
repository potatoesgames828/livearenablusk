import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { SnakeLive } from './sim';

export { manifest, SnakeLive };
export type { SnakeSnapshot } from './sim';

export const gameModule: GameModule = {
  manifest,
  create: (ctx) => new SnakeLive(ctx),
};
