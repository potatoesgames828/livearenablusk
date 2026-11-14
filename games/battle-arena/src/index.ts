import type { GameModule } from '@live-arena/game-engine';
import { manifest } from './manifest';
import { BattleArena } from './sim';

export { manifest, BattleArena };
export type { BattleSnapshot } from './sim';

export const gameModule: GameModule = { manifest, create: (ctx) => new BattleArena(ctx) };
