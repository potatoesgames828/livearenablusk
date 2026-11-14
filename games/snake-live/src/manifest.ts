import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'snake-live',
  name: 'Snake Live',
  description: 'A cobrinha clássica controlada por um piloto automático — o público acelera, cria comida especial e muda os obstáculos.',
  howToPlay: [
    'A cobrinha anda sozinha e procura comida.',
    'Presentes criam comida especial com o nome de quem enviou: quando a cobra come, a pessoa pontua.',
    'Curtidas aceleram a cobra por alguns segundos.',
    'Comentários !cima !baixo !esquerda !direita podem guiar a cobra (se ativado).',
  ],
  accent: '#22c55e',
  emoji: '🐍',
  settings: [
    { key: 'baseSpeed', label: 'Velocidade base', type: 'number', default: 7, min: 3, max: 16, step: 1, unit: 'passos/s' },
    { key: 'startObstacles', label: 'Obstáculos iniciais', type: 'number', default: 6, min: 0, max: 40, step: 1 },
    { key: 'foodCount', label: 'Comidas simultâneas', type: 'number', default: 3, min: 1, max: 12, step: 1 },
    { key: 'chatControl', label: 'Permitir controle por comentários', type: 'boolean', default: true },
    { key: 'chatControlSeconds', label: 'Duração do controle manual', type: 'number', default: 4, min: 1, max: 20, unit: 's' },
    { key: 'wrapWalls', label: 'Atravessar paredes', type: 'boolean', default: false },
  ],
  actions: [
    {
      id: 'speed_boost',
      label: 'Aumentar velocidade',
      description: 'Acelera a cobra temporariamente.',
      params: [
        { key: 'multiplier', label: 'Multiplicador', type: 'number', default: 1.5, min: 1.1, max: 3, step: 0.1 },
        { key: 'duration', label: 'Duração', type: 'number', default: 5, min: 1, max: 30, unit: 's' },
      ],
    },
    {
      id: 'special_food',
      label: 'Criar comida especial',
      description: 'Cria uma comida com o nome de quem enviou. Quando a cobra come, a pessoa pontua.',
      params: [{ key: 'value', label: 'Pontos', type: 'number', default: 10, min: 1, max: 1000 }],
    },
    {
      id: 'golden_food',
      label: 'Comida dourada',
      description: 'Comida rara que vale muitos pontos e faz a cobra crescer bastante.',
      params: [{ key: 'value', label: 'Pontos', type: 'number', default: 100, min: 10, max: 10000 }],
    },
    {
      id: 'shuffle_obstacles',
      label: 'Embaralhar obstáculos',
      description: 'Reposiciona todos os obstáculos do mapa.',
      params: [{ key: 'count', label: 'Quantidade', type: 'number', default: 8, min: 0, max: 40 }],
    },
    {
      id: 'add_obstacles',
      label: 'Adicionar obstáculos',
      description: 'Aumenta a dificuldade colocando novos obstáculos.',
      params: [{ key: 'count', label: 'Quantidade', type: 'number', default: 2, min: 1, max: 10 }],
    },
    { id: 'clear_obstacles', label: 'Limpar obstáculos', description: 'Remove todos os obstáculos.', params: [] },
    {
      id: 'steer',
      label: 'Guiar a cobra',
      description: 'Muda a direção da cobra (usado por comandos de comentário).',
      params: [
        {
          key: 'dir', label: 'Direção', type: 'select', default: 'up',
          options: [{ value: 'up', label: 'Cima' }, { value: 'down', label: 'Baixo' }, { value: 'left', label: 'Esquerda' }, { value: 'right', label: 'Direita' }],
        },
      ],
    },
  ],
  defaultRules: [
    { id: 'gift-any', label: 'Qualquer presente → comida especial', trigger: { kind: 'GIFT' }, action: 'special_food', params: { value: 10 }, maxQuantity: 10 },
    { id: 'gift-big', label: 'Presente de 100+ diamantes → comida dourada', trigger: { kind: 'GIFT', minDiamonds: 100 }, action: 'golden_food', params: { value: 100 }, scaleWithQuantity: false },
    { id: 'likes-100', label: 'A cada 100 curtidas → acelerar', trigger: { kind: 'LIKE_THRESHOLD', every: 100 }, action: 'speed_boost', params: { multiplier: 1.5, duration: 5 }, maxQuantity: 1 },
    { id: 'likes-1000', label: 'A cada 1000 curtidas → embaralhar obstáculos', trigger: { kind: 'LIKE_THRESHOLD', every: 1000 }, action: 'shuffle_obstacles', params: { count: 10 }, maxQuantity: 1 },
    { id: 'follow', label: 'Novo seguidor → +2 obstáculos', trigger: { kind: 'FOLLOW' }, action: 'add_obstacles', params: { count: 2 }, cooldownMs: 3000 },
    { id: 'cmd-up', trigger: { kind: 'CHAT_COMMAND', command: '!cima' }, action: 'steer', params: { dir: 'up' }, perUserCooldownMs: 1000 },
    { id: 'cmd-down', trigger: { kind: 'CHAT_COMMAND', command: '!baixo' }, action: 'steer', params: { dir: 'down' }, perUserCooldownMs: 1000 },
    { id: 'cmd-left', trigger: { kind: 'CHAT_COMMAND', command: '!esquerda' }, action: 'steer', params: { dir: 'left' }, perUserCooldownMs: 1000 },
    { id: 'cmd-right', trigger: { kind: 'CHAT_COMMAND', command: '!direita' }, action: 'steer', params: { dir: 'right' }, perUserCooldownMs: 1000 },
  ],
};
