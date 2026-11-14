import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { SurvivalArena } from './sim';

export { manifest, SurvivalArena };
export type { SurvivalSnapshot } from './sim';

export const gameModule: GameModule = { manifest, create: (ctx) => new SurvivalArena(ctx) };
