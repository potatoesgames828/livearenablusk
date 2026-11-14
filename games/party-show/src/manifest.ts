import type { GameManifest } from '@live-arena/game-engine';

export const manifest: GameManifest = {
  id: 'party-show',
  name: 'Show de Perguntas',
  description:
    'Um programa de auditório controlado pelo chat: perguntas de múltipla escolha, enquetes, "adivinhe o número" e palavras embaralhadas, em rodadas rápidas. Pontue respondendo certo e rápido; no modo times, os pontos vão para a sua equipe.',
  howToPlay: [
    'Quiz: responda com a letra (A, B, C ou D) ou o número da alternativa.',
    'Enquete: vote no chat; vale ponto de participação.',
    'Adivinhe o número: mande um número; quem chegar mais perto vence.',
    'Palavra embaralhada: o primeiro a escrever a palavra certa leva a rodada.',
  ],
  accent: '#a855f7',
  emoji: '🎤',
  settings: [
    { key: 'modeQuiz', label: 'Quiz', type: 'boolean', default: true },
    { key: 'modePoll', label: 'Enquete', type: 'boolean', default: true },
    { key: 'modeNumber', label: 'Adivinhe o número', type: 'boolean', default: true },
    { key: 'modeWord', label: 'Palavra embaralhada', type: 'boolean', default: true },
    { key: 'roundSeconds', label: 'Tempo por rodada', type: 'number', default: 20, min: 5, max: 120, unit: 's' },
    { key: 'revealSeconds', label: 'Tempo mostrando a resposta', type: 'number', default: 6, min: 2, max: 30, unit: 's' },
    { key: 'numberMax', label: 'Maior número possível (adivinhação)', type: 'number', default: 100, min: 10, max: 100000 },
    { key: 'teamMode', label: 'Modo times', type: 'boolean', default: false, help: 'Os participantes são divididos em dois times e somam pontos para a equipe.' },
    { key: 'teamAName', label: 'Nome do time 1', type: 'text', default: 'Time Roxo' },
    { key: 'teamBName', label: 'Nome do time 2', type: 'text', default: 'Time Laranja' },
    { key: 'customQuestions', label: 'Perguntas próprias', type: 'text', default: '', help: 'Formato: Pergunta?|Certa|Errada|Errada|Errada ; separe perguntas com ponto e vírgula.' },
  ],
  actions: [
    { id: 'double_points', label: 'Pontos em dobro', description: 'O próximo acerto de quem enviou vale o dobro.', params: [] },
    { id: 'hint', label: 'Dica', description: 'Quiz: elimina uma alternativa errada. Palavra: revela uma letra. Número: estreita o intervalo.', params: [] },
    { id: 'add_time', label: 'Mais tempo', description: 'Adiciona segundos à rodada atual.', params: [{ key: 'seconds', label: 'Segundos', type: 'number', default: 5, min: 1, max: 60, unit: 's' }] },
    { id: 'skip', label: 'Pular rodada', description: 'Pula para o próximo desafio.', params: [] },
  ],
  defaultRules: [
    { id: 'gift-double', label: 'Qualquer presente → pontos em dobro', trigger: { kind: 'GIFT' }, action: 'double_points', params: {}, scaleWithQuantity: false },
    { id: 'gift-hint', label: 'Presente de 10+ → dica para todos', trigger: { kind: 'GIFT', minDiamonds: 10 }, action: 'hint', params: {}, scaleWithQuantity: false, cooldownMs: 4000 },
    { id: 'likes-time', label: 'A cada 300 curtidas → +5 s', trigger: { kind: 'LIKE_THRESHOLD', every: 300 }, action: 'add_time', params: { seconds: 5 }, maxQuantity: 2 },
    { id: 'gift-skip', label: 'Presente de 99+ → pular rodada', trigger: { kind: 'GIFT', minDiamonds: 99 }, action: 'skip', params: {}, scaleWithQuantity: false, cooldownMs: 10000 },
  ],
};
