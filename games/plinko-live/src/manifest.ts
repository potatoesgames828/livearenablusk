import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'plinko-live',
  name: 'Plinko Live',
  description: 'Bolas caem entre pinos até os multiplicadores. Jogo exclusivamente recreativo, com pontuação virtual — sem apostas, depósitos ou prêmios em dinheiro.',
  howToPlay: [
    'Cada presente solta uma bola com o seu nome.',
    'A bola cai entre os pinos e multiplica seus pontos virtuais.',
    'Curtidas soltam bolas da comunidade.',
    'Comentários !esquerda !meio !direita escolhem de onde a sua próxima bola cai.',
  ],
  accent: '#a855f7',
  emoji: '🔮',
  settings: [
    { key: 'rows', label: 'Linhas de pinos', type: 'number', default: 12, min: 6, max: 16 },
    { key: 'roundSeconds', label: 'Duração da rodada', type: 'number', default: 120, min: 20, max: 1800, unit: 's' },
    { key: 'autoDropEvery', label: 'Bola automática a cada', type: 'number', default: 3, min: 0, max: 60, unit: 's', help: '0 desativa' },
    { key: 'maxBalls', label: 'Máximo de bolas na tela', type: 'number', default: 60, min: 5, max: 120 },
    { key: 'bounciness', label: 'Elasticidade', type: 'number', default: 0.55, min: 0.2, max: 0.9, step: 0.05 },
  ],
  actions: [
    { id: 'drop_ball', label: 'Soltar bola', description: 'Solta uma bola com o nome de quem enviou.', params: [{ key: 'value', label: 'Pontos base', type: 'number', default: 10, min: 1, max: 10000 }] },
    { id: 'drop_golden', label: 'Bola dourada', description: 'Bola especial com pontos base altos.', params: [{ key: 'value', label: 'Pontos base', type: 'number', default: 100, min: 1, max: 100000 }] },
    { id: 'community_drop', label: 'Bolas da comunidade', description: 'Solta bolas sem dono (efeito visual coletivo).', params: [{ key: 'count', label: 'Quantidade', type: 'number', default: 3, min: 1, max: 20 }] },
    {
      id: 'choose_lane', label: 'Escolher posição', description: 'Define de onde a próxima bola do espectador cai.',
      params: [{ key: 'lane', label: 'Posição', type: 'select', default: 'mid', options: [{ value: 'left', label: 'Esquerda' }, { value: 'mid', label: 'Meio' }, { value: 'right', label: 'Direita' }] }],
    },
    { id: 'multiplier_boost', label: 'Multiplicadores em dobro', description: 'Dobra os multiplicadores por alguns segundos.', params: [{ key: 'duration', label: 'Duração', type: 'number', default: 10, min: 2, max: 60, unit: 's' }] },
  ],
  defaultRules: [
    { id: 'gift-ball', label: 'Qualquer presente → bola', trigger: { kind: 'GIFT' }, action: 'drop_ball', params: { value: 10 }, maxQuantity: 15 },
    { id: 'gift-golden', label: 'Presente de 100+ diamantes → bola dourada', trigger: { kind: 'GIFT', minDiamonds: 100 }, action: 'drop_golden', params: { value: 100 }, scaleWithQuantity: false },
    { id: 'likes-community', label: 'A cada 200 curtidas → 3 bolas da comunidade', trigger: { kind: 'LIKE_THRESHOLD', every: 200 }, action: 'community_drop', params: { count: 3 }, maxQuantity: 3 },
    { id: 'follow-boost', label: 'Novo seguidor → multiplicadores em dobro', trigger: { kind: 'FOLLOW' }, action: 'multiplier_boost', params: { duration: 8 }, cooldownMs: 10000 },
    { id: 'cmd-left', trigger: { kind: 'CHAT_COMMAND', command: '!esquerda' }, action: 'choose_lane', params: { lane: 'left' }, perUserCooldownMs: 2000 },
    { id: 'cmd-mid', trigger: { kind: 'CHAT_COMMAND', command: '!meio' }, action: 'choose_lane', params: { lane: 'mid' }, perUserCooldownMs: 2000 },
    { id: 'cmd-right', trigger: { kind: 'CHAT_COMMAND', command: '!direita' }, action: 'choose_lane', params: { lane: 'right' }, perUserCooldownMs: 2000 },
  ],
};
