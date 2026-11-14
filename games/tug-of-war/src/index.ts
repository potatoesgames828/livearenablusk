import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { TugOfWar } from './sim';

export { manifest, TugOfWar };

export const gameModule: GameModule = { manifest, create: (ctx) => new TugOfWar(ctx) };
