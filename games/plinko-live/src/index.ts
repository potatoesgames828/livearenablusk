import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { PlinkoLive } from './sim';

export { manifest, PlinkoLive };
export type { PlinkoSnapshot } from './sim';

export const gameModule: GameModule = { manifest, create: (ctx) => new PlinkoLive(ctx) };
