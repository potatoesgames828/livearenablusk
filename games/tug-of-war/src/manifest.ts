import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'tug-of-war',
  name: 'Cabo de Guerra',
  description:
    'Dois times puxam a mesma corda. Cada comentário, curtida e presente do time puxa a bandeira para o seu lado. Leve a bandeira até a sua marca para marcar o ponto; quem fizer mais pontos leva a partida.',
  howToPlay: [
    'Digite o nome de um time (padrão: "meninos" ou "meninas") para entrar.',
    'Depois de entrar, cada comentário e curtida dá um puxão no seu time.',
    'Presentes dão puxões fortes; presentes grandes marcam ponto direto.',
    'Leve a bandeira até a sua marca para vencer a rodada. Melhor de 3 por padrão.',
  ],
  accent: '#ec4899',
  emoji: '🪢',
  settings: [
    { key: 'teamAName', label: 'Nome do time 1', type: 'text', default: 'Meninos' },
    { key: 'teamBName', label: 'Nome do time 2', type: 'text', default: 'Meninas' },
    { key: 'teamAColor', label: 'Cor do time 1', type: 'select', default: '#3b82f6', options: [{ value: '#3b82f6', label: 'Azul' }, { value: '#22c55e', label: 'Verde' }, { value: '#f97316', label: 'Laranja' }, { value: '#ef4444', label: 'Vermelho' }] },
    { key: 'teamBColor', label: 'Cor do time 2', type: 'select', default: '#ec4899', options: [{ value: '#ec4899', label: 'Rosa' }, { value: '#a855f7', label: 'Roxo' }, { value: '#eab308', label: 'Amarelo' }, { value: '#06b6d4', label: 'Ciano' }] },
    { key: 'teamAKeywords', label: 'Palavras do time 1', type: 'text', default: 'meninos, menino, 1' },
    { key: 'teamBKeywords', label: 'Palavras do time 2', type: 'text', default: 'meninas, menina, 2' },
    { key: 'pullsToWin', label: 'Força para marcar ponto', type: 'number', default: 120, min: 10, max: 5000, help: 'Quanto maior, mais longa a disputa.' },
    { key: 'bestOf', label: 'Melhor de', type: 'number', default: 3, min: 1, max: 15, step: 2 },
    { key: 'chatPull', label: 'Força do comentário', type: 'number', default: 1, min: 0, max: 50 },
    { key: 'likePull', label: 'Força por curtida', type: 'number', default: 0.15, min: 0, max: 10, step: 0.05 },
    { key: 'idleRecenter', label: 'Bandeira volta ao centro quando o chat para', type: 'boolean', default: true },
    { key: 'intermission', label: 'Intervalo entre partidas', type: 'number', default: 10, min: 3, max: 60, unit: 's' },
  ],
  actions: [
    { id: 'join', label: 'Entrar em um time', description: 'Escolhe o time do espectador.', params: [{ key: 'team', label: 'Time', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automático (menor time)' }, { value: '0', label: 'Time 1' }, { value: '1', label: 'Time 2' }] }] },
    { id: 'pull', label: 'Puxão', description: 'Puxa a corda para o time de quem enviou (ou para o time escolhido).', params: [{ key: 'force', label: 'Força', type: 'number', default: 6, min: 1, max: 1000 }, { key: 'team', label: 'Time', type: 'select', default: 'sender', options: [{ value: 'sender', label: 'Time de quem enviou' }, { value: '0', label: 'Time 1' }, { value: '1', label: 'Time 2' }] }] },
    { id: 'point', label: 'Ponto direto', description: 'Marca uma rodada para o time de quem enviou.', params: [{ key: 'team', label: 'Time', type: 'select', default: 'sender', options: [{ value: 'sender', label: 'Time de quem enviou' }, { value: '0', label: 'Time 1' }, { value: '1', label: 'Time 2' }] }] },
    { id: 'freeze', label: 'Congelar adversário', description: 'O time adversário não consegue puxar por alguns segundos.', params: [{ key: 'seconds', label: 'Duração', type: 'number', default: 4, min: 1, max: 30, unit: 's' }] },
  ],
  defaultRules: [
    { id: 'gift-pull', label: 'Qualquer presente → puxão forte', trigger: { kind: 'GIFT' }, action: 'pull', params: { force: 6, team: 'sender' }, maxQuantity: 50 },
    { id: 'gift-big', label: 'Presente de 30+ diamantes → puxão gigante', trigger: { kind: 'GIFT', minDiamonds: 30 }, action: 'pull', params: { force: 40, team: 'sender' }, maxQuantity: 10 },
    { id: 'gift-point', label: 'Presente de 299+ diamantes → ponto direto', trigger: { kind: 'GIFT', minDiamonds: 299 }, action: 'point', params: { team: 'sender' }, scaleWithQuantity: false },
    { id: 'share-freeze', label: 'Compartilhamento → congela o adversário', trigger: { kind: 'SHARE' }, action: 'freeze', params: { seconds: 3 }, cooldownMs: 8000 },
    { id: 'cmd-a', label: '!meninos → time 1', trigger: { kind: 'CHAT_COMMAND', command: '!meninos' }, action: 'join', params: { team: '0' } },
    { id: 'cmd-b', label: '!meninas → time 2', trigger: { kind: 'CHAT_COMMAND', command: '!meninas' }, action: 'join', params: { team: '1' } },
  ],
};
