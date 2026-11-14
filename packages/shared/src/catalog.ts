/** Catálogo básico de jogos (metadados). As regras ficam em cada pacote de jogo em /games. */
export const GAME_CATALOG = [
  {
    id: 'snake-live',
    name: 'Snake Live',
    description: 'A cobrinha clássica reinventada: o público acelera, cria comida especial e muda obstáculos.',
    sortOrder: 1,
  },
  {
    id: 'battle-arena',
    name: 'Battle Arena',
    description: 'Dois times se enfrentam em rodadas. Presentes viram ataques e curtidas carregam energia.',
    sortOrder: 2,
  },
  {
    id: 'avatar-race',
    name: 'Avatar Race',
    description: 'Espectadores entram na corrida com !join e recebem impulsos com presentes.',
    sortOrder: 3,
  },
  {
    id: 'plinko-live',
    name: 'Plinko Live',
    description: 'Bolas caem entre pinos rumo a multiplicadores visuais. Apenas pontuação virtual, sem apostas.',
    sortOrder: 4,
  },
  {
    id: 'survival-arena',
    name: 'Survival Arena',
    description: 'Defenda o núcleo contra ondas de inimigos e chefes. O público fortalece a defesa.',
    sortOrder: 5,
  },
] as const;

export type GameId = (typeof GAME_CATALOG)[number]['id'];
export const GAME_IDS = GAME_CATALOG.map((g) => g.id) as GameId[];
