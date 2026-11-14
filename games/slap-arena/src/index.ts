import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { SlapArena } from './sim';

export { manifest, SlapArena };

export const gameModule: GameModule = { manifest, create: (ctx) => new SlapArena(ctx) };
