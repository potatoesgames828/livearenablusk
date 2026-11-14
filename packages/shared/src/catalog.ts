/** Catálogo de jogos (metadados da biblioteca). As regras ficam em cada pacote de jogo em /games. */
export const GAME_CATEGORIES = [
  { id: 'corridas', label: 'Corridas' },
  { id: 'batalhas', label: 'Batalhas' },
  { id: 'sobrevivencia', label: 'Sobrevivência' },
  { id: 'arena', label: 'Arena' },
  { id: 'animais', label: 'Animais' },
  { id: 'festa', label: 'Festa' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'palavras', label: 'Palavras' },
  { id: 'habilidade', label: 'Habilidade' },
  { id: 'coletivos', label: 'Coletivos' },
  { id: 'estrategia', label: 'Estratégia' },
  { id: 'sorte', label: 'Sorte (sem apostas)' },
] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number]['id'];

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  /** categoria principal + secundárias */
  categories: GameCategory[];
  /** faixa de participantes recomendada */
  players: string;
  /** como o público entra */
  joinHow: string;
  /** 'novo' | 'v2' | 'clássico' */
  badge?: string;
  /** duração típica de uma partida */
  duration: string;
  addedAt: string;
}

export const GAME_CATALOG: readonly CatalogEntry[] = [
  {
    id: 'battle-arena', name: 'Battle Arena', sortOrder: 1, badge: 'v2',
    description: 'Dois times de espectadores numa arena. Cada pessoa vira um lutador que luta sozinho; presentes disparam rajadas, golens e escudos.',
    categories: ['batalhas', 'arena', 'coletivos'], players: '2–40+', joinHow: 'Comentário com o nome do time', duration: '2–3 min', addedAt: '2026-11-14',
  },
  {
    id: 'animal-race', name: 'Corrida Animal', sortOrder: 2, badge: 'novo',
    description: 'Oito animais com velocidade, fôlego e talentos próprios disputam uma pista com obstáculos. Presentes dão turbo, cenoura e banana no líder.',
    categories: ['corridas', 'animais'], players: '2–12', joinHow: 'Comentário "correr" ou nome do animal', duration: '~1 min', addedAt: '2026-11-14',
  },
  {
    id: 'slap-arena', name: 'Arena do Tapa', sortOrder: 3, badge: 'novo',
    description: 'O chat entra na fila e duela no píer, tapa por tapa. Presentes compram vida e armas absurdas; o campeão defende o posto.',
    categories: ['arena', 'habilidade', 'festa'], players: 'Fila ilimitada (2 por vez)', joinHow: 'Comentário "tapa"', duration: '20–40 s por duelo', addedAt: '2026-11-14',
  },
  {
    id: 'melon-pop', name: 'Melancia Elástica', sortOrder: 4, badge: 'novo',
    description: 'Elásticos numa fruta gigante até ela estourar. Ninguém sabe o limite; quem colocar o último elástico vence.',
    categories: ['coletivos', 'festa', 'sorte'], players: 'Ilimitado', joinHow: 'Comentário "elástico"', duration: '1–5 min', addedAt: '2026-11-14',
  },
  {
    id: 'tug-of-war', name: 'Cabo de Guerra', sortOrder: 5, badge: 'novo',
    description: 'Dois times puxam a mesma corda com comentários, curtidas e presentes. Melhor de 3.',
    categories: ['coletivos', 'batalhas'], players: 'Ilimitado (2 times)', joinHow: 'Comentário com o nome do time', duration: '2–5 min', addedAt: '2026-11-14',
  },
  {
    id: 'tower-war', name: 'Guerra de Torres', sortOrder: 6, badge: 'novo',
    description: 'Dois times empilham, derrubam e roubam blocos. A primeira torre a chegar na meta pontua e a guerra continua.',
    categories: ['estrategia', 'coletivos'], players: 'Ilimitado (2 times)', joinHow: 'Comentário "torre1"/"torre2"', duration: 'Contínuo', addedAt: '2026-11-14',
  },
  {
    id: 'party-show', name: 'Show de Perguntas', sortOrder: 7, badge: 'novo',
    description: 'Quiz, enquetes, adivinhe o número e palavra embaralhada em rodadas rápidas, com modo times.',
    categories: ['quiz', 'palavras', 'festa'], players: 'Ilimitado', joinHow: 'Respondendo no chat', duration: '20 s por rodada', addedAt: '2026-11-14',
  },
  {
    id: 'avatar-race', name: 'Avatar Race', sortOrder: 8,
    description: 'Espectadores entram na corrida e recebem impulsos com presentes.',
    categories: ['corridas'], players: '2–20', joinHow: 'Comando !join', duration: '~1 min', addedAt: '2026-11-14',
  },
  {
    id: 'survival-arena', name: 'Survival Arena', sortOrder: 9,
    description: 'Defenda o núcleo contra ondas de inimigos e chefes. O público fortalece a defesa.',
    categories: ['sobrevivencia', 'coletivos'], players: 'Ilimitado', joinHow: 'Qualquer interação', duration: 'Ondas contínuas', addedAt: '2026-11-14',
  },
  {
    id: 'snake-live', name: 'Snake Live', sortOrder: 10, badge: 'clássico',
    description: 'A cobrinha clássica reinventada: o público acelera, cria comida especial e muda obstáculos.',
    categories: ['habilidade', 'coletivos'], players: 'Ilimitado', joinHow: 'Comandos de direção', duration: 'Contínuo', addedAt: '2026-11-14',
  },
  {
    id: 'plinko-live', name: 'Plinko Live', sortOrder: 11, badge: 'clássico',
    description: 'Bolas caem entre pinos rumo a multiplicadores visuais. Apenas pontuação virtual, sem apostas.',
    categories: ['sorte'], players: 'Ilimitado', joinHow: 'Presentes e comandos', duration: 'Contínuo', addedAt: '2026-11-14',
  },
];

export type GameId = string;
export const GAME_IDS = GAME_CATALOG.map((g) => g.id);
export function catalogEntry(id: string): CatalogEntry | undefined {
  return GAME_CATALOG.find((g) => g.id === id);
}
