import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'battle-arena',
  name: 'Battle Arena',
  description: 'Time Vermelho contra Time Azul. Presentes viram ataques, curtidas carregam a energia e seguidores convocam soldados.',
  howToPlay: [
    'Digite !vermelho ou !azul para escolher seu time.',
    'Presentes fazem o campeão do seu time atacar.',
    'Curtidas carregam a energia coletiva; com 100% sai um super ataque.',
    'Novos seguidores convocam soldados para o time que está perdendo.',
  ],
  accent: '#f43f5e',
  emoji: '⚔️',
  settings: [
    { key: 'championHp', label: 'Vida dos campeões', type: 'number', default: 1500, min: 200, max: 20000, step: 100 },
    { key: 'autoAttackEvery', label: 'Ataque automático a cada', type: 'number', default: 2.5, min: 0.5, max: 10, step: 0.5, unit: 's' },
    { key: 'autoAttackDamage', label: 'Dano do ataque automático', type: 'number', default: 15, min: 0, max: 500 },
    { key: 'maxMinions', label: 'Máximo de soldados por time', type: 'number', default: 8, min: 0, max: 20 },
    { key: 'roundTimeLimit', label: 'Duração máxima da rodada', type: 'number', default: 240, min: 30, max: 1800, unit: 's' },
  ],
  actions: [
    { id: 'attack', label: 'Ataque', description: 'O campeão do time de quem enviou dispara um projétil.', params: [{ key: 'damage', label: 'Dano', type: 'number', default: 60, min: 1, max: 5000 }] },
    { id: 'special', label: 'Habilidade especial', description: 'Ataque devastador com área de efeito.', params: [{ key: 'damage', label: 'Dano', type: 'number', default: 300, min: 1, max: 20000 }] },
    { id: 'heal', label: 'Curar campeão', description: 'Recupera vida do campeão do time.', params: [{ key: 'amount', label: 'Cura', type: 'number', default: 80, min: 1, max: 5000 }] },
    { id: 'shield', label: 'Escudo', description: 'Bloqueia o dano recebido por alguns segundos.', params: [{ key: 'duration', label: 'Duração', type: 'number', default: 4, min: 1, max: 30, unit: 's' }] },
    { id: 'charge_energy', label: 'Carregar energia', description: 'Enche a barra de energia dos dois times (ou do time de quem interagiu).', params: [{ key: 'amount', label: 'Energia (%)', type: 'number', default: 10, min: 1, max: 100 }] },
    { id: 'spawn_minion', label: 'Convocar soldado', description: 'Adiciona um soldado ao time que está perdendo.', params: [] },
    {
      id: 'join_team', label: 'Entrar em um time', description: 'Escolhe o time do espectador.',
      params: [{ key: 'team', label: 'Time', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automático' }, { value: 'red', label: 'Vermelho' }, { value: 'blue', label: 'Azul' }] }],
    },
  ],
  defaultRules: [
    { id: 'gift-attack', label: 'Qualquer presente → ataque', trigger: { kind: 'GIFT' }, action: 'attack', params: { damage: 60 }, maxQuantity: 20 },
    { id: 'gift-special', label: 'Presente de 100+ diamantes → especial', trigger: { kind: 'GIFT', minDiamonds: 100 }, action: 'special', params: { damage: 300 }, scaleWithQuantity: false },
    { id: 'likes-energy', label: 'A cada 50 curtidas → +10% energia', trigger: { kind: 'LIKE_THRESHOLD', every: 50 }, action: 'charge_energy', params: { amount: 10 }, maxQuantity: 5 },
    { id: 'follow-minion', label: 'Novo seguidor → soldado', trigger: { kind: 'FOLLOW' }, action: 'spawn_minion', params: {}, cooldownMs: 2000 },
    { id: 'share-shield', label: 'Compartilhamento → escudo', trigger: { kind: 'SHARE' }, action: 'shield', params: { duration: 3 }, cooldownMs: 5000 },
    { id: 'cmd-red', trigger: { kind: 'CHAT_COMMAND', command: '!vermelho' }, action: 'join_team', params: { team: 'red' }, perUserCooldownMs: 10000 },
    { id: 'cmd-blue', trigger: { kind: 'CHAT_COMMAND', command: '!azul' }, action: 'join_team', params: { team: 'blue' }, perUserCooldownMs: 10000 },
    { id: 'cmd-heal', trigger: { kind: 'CHAT_COMMAND', command: '!curar' }, action: 'heal', params: { amount: 20 }, perUserCooldownMs: 15000 },
  ],
};
