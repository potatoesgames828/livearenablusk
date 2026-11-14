import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { PartyShow } from './sim';

export { manifest, PartyShow };

export const gameModule: GameModule = { manifest, create: (ctx) => new PartyShow(ctx) };
