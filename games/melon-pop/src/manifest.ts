import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'melon-pop',
  name: 'Melancia Elástica',
  description:
    'Uma fruta gigante recebe elásticos a cada interação. Ninguém sabe quantos ela aguenta: a pressão aumenta, a casca racha e quem colocar o elástico final estoura a fruta.',
  howToPlay: [
    'Digite "elástico" no chat para colocar seu elástico grátis (um por fruta).',
    'Presentes colocam elásticos na frente da fila; presentes maiores colocam elásticos grossos ou uma chuva de elásticos.',
    'Quer salvar a fruta? A tesoura corta os últimos elásticos.',
    'O martelo estoura a fruta na hora. Quem colocou o último elástico (ou bateu o martelo) vence a rodada.',
  ],
  accent: '#22c55e',
  emoji: '🍉',
  settings: [
    { key: 'strength', label: 'Resistência da fruta', type: 'select', default: 'short', options: [{ value: 'short', label: 'Curta (40–90 elásticos)' }, { value: 'medium', label: 'Média (90–200)' }, { value: 'long', label: 'Longa (200–450)' }, { value: 'huge', label: 'Gigante (450–1.000)' }] },
    { key: 'fruit', label: 'Fruta', type: 'select', default: 'melancia', options: [{ value: 'melancia', label: 'Melancia' }, { value: 'abobora', label: 'Abóbora' }, { value: 'melao', label: 'Melão' }, { value: 'aleatoria', label: 'Uma diferente por rodada' }] },
    { key: 'bandSpeed', label: 'Velocidade do chef', type: 'select', default: 'normal', options: [{ value: 'slow', label: 'Lenta' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Rápida' }] },
    { key: 'freeKeyword', label: 'Palavra do elástico grátis', type: 'text', default: 'elastico, elástico, entrar' },
    { key: 'safeMode', label: 'Modo suave (estouro sem suco vermelho)', type: 'boolean', default: false },
    { key: 'intermission', label: 'Tempo entre frutas', type: 'number', default: 8, min: 3, max: 60, unit: 's' },
  ],
  actions: [
    { id: 'band', label: 'Elástico', description: 'Coloca elásticos coloridos (vão na frente dos grátis).', params: [{ key: 'count', label: 'Elásticos', type: 'number', default: 1, min: 1, max: 100 }] },
    { id: 'free_band', label: 'Elástico grátis', description: 'Um elástico grátis por espectador por fruta.', params: [] },
    { id: 'thick_band', label: 'Elástico grosso', description: 'Um elástico vermelho grosso que vale 10.', params: [] },
    { id: 'band_rain', label: 'Chuva de elásticos', description: 'Vários elásticos voam para a fruta.', params: [{ key: 'count', label: 'Elásticos', type: 'number', default: 25, min: 5, max: 100 }] },
    { id: 'take_off', label: 'Chef tira elásticos', description: 'O chef retira os últimos elásticos, um por um.', params: [{ key: 'count', label: 'Quantidade', type: 'number', default: 5, min: 1, max: 50 }] },
    { id: 'scissors', label: 'Tesoura', description: 'Corta os últimos elásticos de uma vez.', params: [{ key: 'count', label: 'Quantidade', type: 'number', default: 10, min: 1, max: 100 }] },
    { id: 'hammer', label: 'Martelo', description: 'Estoura a fruta na hora; quem enviou é o vencedor.', params: [] },
  ],
  defaultRules: [
    { id: 'gift-band', label: 'Qualquer presente → 1 elástico por unidade', trigger: { kind: 'GIFT' }, action: 'band', params: { count: 1 }, maxQuantity: 50 },
    { id: 'gift-thick', label: 'Presente de 10+ diamantes → elástico grosso', trigger: { kind: 'GIFT', minDiamonds: 10 }, action: 'thick_band', params: {}, maxQuantity: 10 },
    { id: 'gift-rain', label: 'Presente de 99+ diamantes → chuva de elásticos', trigger: { kind: 'GIFT', minDiamonds: 99 }, action: 'band_rain', params: { count: 25 }, scaleWithQuantity: false },
    { id: 'follow-band', label: 'Novo seguidor → elástico grátis', trigger: { kind: 'FOLLOW' }, action: 'free_band', params: {} },
    { id: 'share-scissors', label: 'Compartilhamento → tesoura (salva a fruta)', trigger: { kind: 'SHARE' }, action: 'scissors', params: { count: 5 }, cooldownMs: 10000 },
    { id: 'likes-band', label: 'A cada 200 curtidas → elástico', trigger: { kind: 'LIKE_THRESHOLD', every: 200 }, action: 'band', params: { count: 1 }, maxQuantity: 10 },
    { id: 'cmd-elastico', label: '!elastico → elástico grátis', trigger: { kind: 'CHAT_COMMAND', command: '!elastico' }, action: 'free_band', params: {} },
  ],
};
