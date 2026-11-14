import { ANIMALS, joinAction, matchSettings, type GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'animal-race',
  name: 'Corrida Animal',
  description:
    'Cada espectador corre com um animal: raposa, coelho, tartaruga, galinha, porco, sapo, cavalo ou pinguim. Cada bicho tem velocidade, arranque, fôlego e uma habilidade própria. Presentes dão turbo, cenouras e cascas de banana no líder.',
  howToPlay: [
    'Digite "correr" para entrar, ou o nome de um animal (ex.: "coelho") para escolher o seu.',
    'Cada animal tem um talento: o coelho pula obstáculos, a tartaruga não tropeça, o porco atravessa a lama…',
    'Presentes dão turbo para o seu animal; presentes maiores jogam casca de banana no líder ou raio nos três primeiros.',
    'Curtidas animam a torcida e dão fôlego para todos.',
  ],
  accent: '#84cc16',
  emoji: '🦊',
  settings: [
    { key: 'trackLength', label: 'Tamanho da pista', type: 'select', default: 'medium', options: [{ value: 'short', label: 'Curta (~35 s)' }, { value: 'medium', label: 'Média (~55 s)' }, { value: 'long', label: 'Longa (~80 s)' }] },
    { key: 'obstacles', label: 'Obstáculos na pista', type: 'number', default: 6, min: 0, max: 20 },
    ...matchSettings({ lobbySeconds: 25, maxParticipants: 12, minToStart: 4, matchSeconds: 120, joinKeywords: 'correr, entrar, eu', practiceBots: 6 }),
  ],
  actions: [
    joinAction(),
    { id: 'boost', label: 'Turbo', description: 'O animal de quem enviou acelera por alguns segundos (quem não corre dá turbo ao último colocado).', params: [{ key: 'seconds', label: 'Duração', type: 'number', default: 2.5, min: 0.5, max: 10, unit: 's' }] },
    { id: 'carrot', label: 'Cenoura', description: 'Recupera todo o fôlego do animal de quem enviou.', params: [] },
    { id: 'banana', label: 'Casca de banana no líder', description: 'O líder escorrega e perde tempo.', params: [] },
    { id: 'lightning', label: 'Raio nos três primeiros', description: 'Atordoa os três primeiros colocados.', params: [] },
    { id: 'cheer', label: 'Torcida', description: 'Todos ganham um pouco de fôlego e velocidade.', params: [] },
  ],
  defaultRules: [
    { id: 'gift-boost', label: 'Qualquer presente → turbo', trigger: { kind: 'GIFT' }, action: 'boost', params: { seconds: 2.5 }, maxQuantity: 5 },
    { id: 'gift-carrot', label: 'Presente de 10+ → cenoura', trigger: { kind: 'GIFT', minDiamonds: 10 }, action: 'carrot', params: {}, scaleWithQuantity: false },
    { id: 'gift-banana', label: 'Presente de 30+ → banana no líder', trigger: { kind: 'GIFT', minDiamonds: 30 }, action: 'banana', params: {}, scaleWithQuantity: false, cooldownMs: 3000 },
    { id: 'gift-lightning', label: 'Presente de 199+ → raio nos 3 primeiros', trigger: { kind: 'GIFT', minDiamonds: 199 }, action: 'lightning', params: {}, scaleWithQuantity: false, cooldownMs: 8000 },
    { id: 'likes-cheer', label: 'A cada 500 curtidas → torcida', trigger: { kind: 'LIKE_THRESHOLD', every: 500 }, action: 'cheer', params: {}, maxQuantity: 2 },
  ],
};

export const ANIMAL_KEYS = ANIMALS.map((a) => a.kind);
