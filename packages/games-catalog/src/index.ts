import type { GameManifest, GameModule } from '@live-arena/game-engine';
import { gameModule as snake } from '@live-arena/game-snake-live';
import { gameModule as battle } from '@live-arena/game-battle-arena';
import { gameModule as race } from '@live-arena/game-avatar-race';
import { gameModule as plinko } from '@live-arena/game-plinko-live';
import { gameModule as survival } from '@live-arena/game-survival-arena';
import { gameModule as melonPop } from '@live-arena/game-melon-pop';
import { gameModule as tugOfWar } from '@live-arena/game-tug-of-war';
import { gameModule as towerWar } from '@live-arena/game-tower-war';

/** Registro central de jogos disponíveis (lado servidor / simulação). */
export const GAME_MODULES: Record<string, GameModule> = {
  [snake.manifest.id]: snake,
  [battle.manifest.id]: battle,
  [race.manifest.id]: race,
  [plinko.manifest.id]: plinko,
  [survival.manifest.id]: survival,
  [towerWar.manifest.id]: towerWar,
  [tugOfWar.manifest.id]: tugOfWar,
  [melonPop.manifest.id]: melonPop,
};

export function getGameModule(id: string): GameModule | undefined {
  return GAME_MODULES[id];
}

export function listManifests(): GameManifest[] {
  return Object.values(GAME_MODULES).map((m) => m.manifest);
}
