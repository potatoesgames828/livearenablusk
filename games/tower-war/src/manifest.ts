import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'tower-war',
  name: 'Guerra de Torres',
  description:
    'Dois times erguem torres bloco a bloco. Presentes empilham, derrubam e roubam blocos da torre rival. A primeira torre a chegar na altura-meta marca a vitória, volta ao chão e a disputa continua sem pausa.',
  howToPlay: [
    'Digite "torre1" ou "torre2" (ou 1 / 2) para escolher seu time.',
    'Escreva "sobe" para colocar um bloco grátis (com intervalo por pessoa).',
    'Presentes pequenos empilham blocos; médios derrubam blocos rivais; grandes roubam blocos para a sua torre.',
    'Chegou na meta? Vitória registrada, sua torre recomeça e a guerra segue.',
  ],
  accent: '#f59e0b',
  emoji: '🏗️',
  settings: [
    { key: 'teamAName', label: 'Nome da torre 1', type: 'text', default: 'Chat' },
    { key: 'teamBName', label: 'Nome da torre 2', type: 'text', default: 'Criador' },
    { key: 'teamAKeywords', label: 'Palavras da torre 1', type: 'text', default: 'torre1, chat, 1' },
    { key: 'teamBKeywords', label: 'Palavras da torre 2', type: 'text', default: 'torre2, criador, 2' },
    { key: 'targetHeight', label: 'Altura-meta (blocos)', type: 'number', default: 100, min: 10, max: 1000 },
    { key: 'freeKeyword', label: 'Palavra do bloco grátis', type: 'text', default: 'sobe' },
    { key: 'freeCooldown', label: 'Intervalo do bloco grátis por pessoa', type: 'number', default: 5, min: 0, max: 120, unit: 's' },
    { key: 'winsToEnd', label: 'Vitórias para encerrar a partida (0 = sem fim)', type: 'number', default: 0, min: 0, max: 50 },
    { key: 'intermission', label: 'Intervalo após o fim da partida', type: 'number', default: 10, min: 3, max: 60, unit: 's' },
  ],
  actions: [
    { id: 'join', label: 'Entrar em um time', description: 'Escolhe a torre do espectador.', params: [{ key: 'team', label: 'Torre', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automático' }, { value: '0', label: 'Torre 1' }, { value: '1', label: 'Torre 2' }] }] },
    { id: 'grow', label: 'Empilhar', description: 'Coloca blocos na torre de quem enviou.', params: [{ key: 'blocks', label: 'Blocos', type: 'number', default: 1, min: 1, max: 100 }] },
    { id: 'wreck', label: 'Derrubar', description: 'Derruba blocos da torre rival.', params: [{ key: 'blocks', label: 'Blocos', type: 'number', default: 5, min: 1, max: 200 }] },
    { id: 'steal', label: 'Roubar', description: 'Move blocos da torre rival para a sua.', params: [{ key: 'blocks', label: 'Blocos', type: 'number', default: 8, min: 1, max: 200 }] },
    { id: 'reset_rival', label: 'Demolir rival', description: 'Zera a torre rival. A maior virada do jogo.', params: [] },
  ],
  defaultRules: [
    { id: 'gift-grow', label: 'Qualquer presente → empilha 1 bloco por unidade', trigger: { kind: 'GIFT' }, action: 'grow', params: { blocks: 1 }, maxQuantity: 100 },
    { id: 'gift-wreck', label: 'Presente de 10+ diamantes → derruba 5 blocos rivais', trigger: { kind: 'GIFT', minDiamonds: 10 }, action: 'wreck', params: { blocks: 5 }, maxQuantity: 20 },
    { id: 'gift-steal', label: 'Presente de 99+ diamantes → rouba 8 blocos', trigger: { kind: 'GIFT', minDiamonds: 99 }, action: 'steal', params: { blocks: 8 }, maxQuantity: 10 },
    { id: 'gift-reset', label: 'Presente de 999+ diamantes → demolir rival', trigger: { kind: 'GIFT', minDiamonds: 999 }, action: 'reset_rival', params: {}, scaleWithQuantity: false },
    { id: 'likes-grow', label: 'A cada 100 curtidas → 1 bloco', trigger: { kind: 'LIKE_THRESHOLD', every: 100 }, action: 'grow', params: { blocks: 1 }, maxQuantity: 20 },
    { id: 'follow-grow', label: 'Novo seguidor → 3 blocos', trigger: { kind: 'FOLLOW' }, action: 'grow', params: { blocks: 3 } },
  ],
};
