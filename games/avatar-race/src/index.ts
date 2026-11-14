import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { AvatarRace } from './sim';

export { manifest, AvatarRace };
export type { RaceSnapshot } from './sim';

export const gameModule: GameModule = { manifest, create: (ctx) => new AvatarRace(ctx) };
