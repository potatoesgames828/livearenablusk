import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'avatar-race',
  name: 'Avatar Race',
  description: 'Uma corrida em que cada espectador é um corredor. Presentes dão turbo, curtidas dão energia a todos.',
  howToPlay: [
    'Digite !correr para entrar na próxima vaga da corrida.',
    'Presentes dão turbo ao seu corredor (e colocam você na corrida).',
    'Curtidas dão energia para todos os corredores do público.',
    'Bots completam as vagas para a corrida nunca parar.',
  ],
  accent: '#f59e0b',
  emoji: '🏁',
  settings: [
    { key: 'lanes', label: 'Número de pistas', type: 'number', default: 8, min: 3, max: 12 },
    { key: 'trackLength', label: 'Comprimento da pista', type: 'number', default: 1000, min: 300, max: 5000, step: 100 },
    { key: 'baseSpeed', label: 'Velocidade base', type: 'number', default: 40, min: 10, max: 200 },
    { key: 'fillWithBots', label: 'Completar com bots', type: 'boolean', default: true },
    { key: 'obstacleDensity', label: 'Obstáculos por pista', type: 'number', default: 3, min: 0, max: 10 },
    { key: 'finishGrace', label: 'Tempo após o 1º colocado', type: 'number', default: 8, min: 2, max: 60, unit: 's' },
  ],
  actions: [
    { id: 'join', label: 'Entrar na corrida', description: 'Coloca o espectador em uma pista (substitui um bot).', params: [] },
    {
      id: 'boost', label: 'Turbo', description: 'Impulsiona o corredor de quem enviou.',
      params: [
        { key: 'power', label: 'Força', type: 'number', default: 2, min: 0.5, max: 10, step: 0.5 },
        { key: 'duration', label: 'Duração', type: 'number', default: 2, min: 0.5, max: 10, step: 0.5, unit: 's' },
      ],
    },
    { id: 'crowd_energy', label: 'Energia coletiva', description: 'Pequeno impulso para todos os corredores do público.', params: [{ key: 'power', label: 'Força', type: 'number', default: 0.6, min: 0.1, max: 5, step: 0.1 }] },
    { id: 'shield', label: 'Escudo', description: 'Protege o corredor de obstáculos.', params: [{ key: 'duration', label: 'Duração', type: 'number', default: 4, min: 1, max: 20, unit: 's' }] },
    { id: 'obstacles', label: 'Obstáculos à frente do líder', description: 'Cria obstáculos na frente de quem está liderando.', params: [{ key: 'count', label: 'Quantidade', type: 'number', default: 2, min: 1, max: 6 }] },
    { id: 'turbo_all', label: 'Turbo geral', description: 'Todos os corredores recebem turbo.', params: [{ key: 'power', label: 'Força', type: 'number', default: 1.5, min: 0.5, max: 10, step: 0.5 }] },
  ],
  defaultRules: [
    { id: 'gift-boost', label: 'Qualquer presente → turbo', trigger: { kind: 'GIFT' }, action: 'boost', params: { power: 2, duration: 2 }, maxQuantity: 10 },
    { id: 'gift-turbo-all', label: 'Presente de 500+ diamantes → turbo geral', trigger: { kind: 'GIFT', minDiamonds: 500 }, action: 'turbo_all', params: { power: 1.5 }, scaleWithQuantity: false },
    { id: 'likes-energy', label: 'A cada 100 curtidas → energia coletiva', trigger: { kind: 'LIKE_THRESHOLD', every: 100 }, action: 'crowd_energy', params: { power: 0.6 }, maxQuantity: 5 },
    { id: 'follow-shield', label: 'Novo seguidor → escudo', trigger: { kind: 'FOLLOW' }, action: 'shield', params: { duration: 4 } },
    { id: 'share-obstacles', label: 'Compartilhamento → obstáculos no líder', trigger: { kind: 'SHARE' }, action: 'obstacles', params: { count: 2 }, cooldownMs: 5000 },
    { id: 'cmd-join', trigger: { kind: 'CHAT_COMMAND', command: '!correr' }, action: 'join', params: {}, perUserCooldownMs: 5000 },
    { id: 'cmd-join-en', trigger: { kind: 'CHAT_COMMAND', command: '!join' }, action: 'join', params: {}, perUserCooldownMs: 5000 },
  ],
};
