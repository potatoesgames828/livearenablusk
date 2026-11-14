import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { MelonPop } from './sim';

export { manifest, MelonPop };

export const gameModule: GameModule = { manifest, create: (ctx) => new MelonPop(ctx) };
