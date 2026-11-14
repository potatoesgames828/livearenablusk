import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { TowerWar } from './sim';

export { manifest, TowerWar };

export const gameModule: GameModule = { manifest, create: (ctx) => new TowerWar(ctx) };
