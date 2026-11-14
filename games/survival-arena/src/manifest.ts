import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'survival-arena',
  name: 'Survival Arena',
  description: 'Defenda o núcleo contra ondas de inimigos e chefes. O público reforça a defesa e lança ataques especiais.',
  howToPlay: [
    'Uma torre automática defende o núcleo.',
    'Presentes lançam ataques especiais e bombardeios — quem derrota inimigos pontua.',
    'Curtidas reforçam o escudo do núcleo.',
    'Novos seguidores convocam drones aliados. Digite !congelar para desacelerar os inimigos.',
  ],
  accent: '#06b6d4',
  emoji: '🛡️',
  settings: [
    { key: 'coreHp', label: 'Vida do núcleo', type: 'number', default: 1000, min: 100, max: 20000, step: 100 },
    { key: 'difficulty', label: 'Dificuldade', type: 'select', default: 'normal', options: [{ value: 'easy', label: 'Fácil' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Difícil' }] },
    { key: 'bossEvery', label: 'Chefe a cada N ondas', type: 'number', default: 5, min: 2, max: 20 },
    { key: 'maxEnemies', label: 'Máximo de inimigos simultâneos', type: 'number', default: 70, min: 10, max: 150 },
    { key: 'turretFireRate', label: 'Disparos da torre por segundo', type: 'number', default: 3, min: 0.5, max: 12, step: 0.5 },
  ],
  actions: [
    { id: 'special_attack', label: 'Ataque especial (nova)', description: 'Explosão ao redor do núcleo que atinge todos os inimigos próximos.', params: [{ key: 'damage', label: 'Dano', type: 'number', default: 120, min: 1, max: 10000 }, { key: 'radius', label: 'Raio', type: 'number', default: 380, min: 50, max: 1200 }] },
    { id: 'airstrike', label: 'Bombardeio', description: 'Explosões sobre os inimigos mais perigosos.', params: [{ key: 'bombs', label: 'Bombas', type: 'number', default: 4, min: 1, max: 20 }, { key: 'damage', label: 'Dano', type: 'number', default: 150, min: 1, max: 10000 }] },
    { id: 'reinforce', label: 'Reforçar escudo', description: 'Adiciona escudo ao núcleo.', params: [{ key: 'amount', label: 'Escudo', type: 'number', default: 40, min: 1, max: 5000 }] },
    { id: 'heal', label: 'Reparar núcleo', description: 'Recupera vida do núcleo.', params: [{ key: 'amount', label: 'Reparo', type: 'number', default: 100, min: 1, max: 10000 }] },
    { id: 'turret_upgrade', label: 'Turbinar torre', description: 'Aumenta a cadência de tiro por um tempo.', params: [{ key: 'duration', label: 'Duração', type: 'number', default: 8, min: 1, max: 60, unit: 's' }] },
    { id: 'spawn_ally', label: 'Drone aliado', description: 'Drone que orbita o núcleo e atira.', params: [{ key: 'duration', label: 'Duração', type: 'number', default: 30, min: 5, max: 300, unit: 's' }] },
    { id: 'freeze', label: 'Congelar inimigos', description: 'Desacelera todos os inimigos.', params: [{ key: 'duration', label: 'Duração', type: 'number', default: 3, min: 1, max: 15, unit: 's' }] },
  ],
  defaultRules: [
    { id: 'gift-nova', label: 'Qualquer presente → ataque especial', trigger: { kind: 'GIFT' }, action: 'special_attack', params: { damage: 120, radius: 380 }, maxQuantity: 10 },
    { id: 'gift-airstrike', label: 'Presente de 100+ diamantes → bombardeio', trigger: { kind: 'GIFT', minDiamonds: 100 }, action: 'airstrike', params: { bombs: 6, damage: 200 }, scaleWithQuantity: false },
    { id: 'likes-shield', label: 'A cada 100 curtidas → escudo', trigger: { kind: 'LIKE_THRESHOLD', every: 100 }, action: 'reinforce', params: { amount: 40 }, maxQuantity: 5 },
    { id: 'likes-turret', label: 'A cada 1000 curtidas → turbinar torre', trigger: { kind: 'LIKE_THRESHOLD', every: 1000 }, action: 'turret_upgrade', params: { duration: 10 }, maxQuantity: 1 },
    { id: 'follow-ally', label: 'Novo seguidor → drone aliado', trigger: { kind: 'FOLLOW' }, action: 'spawn_ally', params: { duration: 30 } },
    { id: 'share-heal', label: 'Compartilhamento → reparo', trigger: { kind: 'SHARE' }, action: 'heal', params: { amount: 100 }, cooldownMs: 3000 },
    { id: 'cmd-freeze', trigger: { kind: 'CHAT_COMMAND', command: '!congelar' }, action: 'freeze', params: { duration: 2 }, cooldownMs: 20000 },
  ],
};
