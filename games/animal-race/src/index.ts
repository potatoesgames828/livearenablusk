import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { AnimalRace } from './sim';

export { manifest, AnimalRace };

export const gameModule: GameModule = { manifest, create: (ctx) => new AnimalRace(ctx) };
