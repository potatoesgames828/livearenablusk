import type { GameManifest, GameModule } from '@live-arena/game-engine';
import { gameModule as snake } from '@live-arena/game-snake-live';
import { gameModule as battle } from '@live-arena/game-battle-arena';
import { gameModule as race } from '@live-arena/game-avatar-race';
import { gameModule as plinko } from '@live-arena/game-plinko-live';
import { gameModule as survival } from '@live-arena/game-survival-arena';

/** Registro central de jogos disponíveis (lado servidor / simulação). */
export const GAME_MODULES: Record<string, GameModule> = {
  [snake.manifest.id]: snake,
  [battle.manifest.id]: battle,
  [race.manifest.id]: race,
  [plinko.manifest.id]: plinko,
  [survival.manifest.id]: survival,
};

export function getGameModule(id: string): GameModule | undefined {
  return GAME_MODULES[id];
}

export function listManifests(): GameManifest[] {
  return Object.values(GAME_MODULES).map((m) => m.manifest);
}
