import type { GameManifest } from '@live-arena/game-engine';

export const WEAPONS = [
  { name: 'Mão', dmg: 10, call: 'PLAFT!' },
  { name: 'Peixe', dmg: 14, call: 'SPLASH!' },
  { name: 'Frigideira', dmg: 19, call: 'BONK!' },
  { name: 'Taco', dmg: 25, call: 'HOME RUN!' },
  { name: 'Marreta', dmg: 34, call: 'CRASH!' },
  { name: 'Antena Parabólica', dmg: 70, call: 'ZAAAP!' },
] as const;

export const manifest: GameManifest = {
  id: 'slap-arena',
  name: 'Arena do Tapa',
  description:
    'O chat entra na fila e sobe ao píer dois de cada vez. Eles trocam tapas até alguém voar para a água. Quem vence fica e enfrenta o próximo. Presentes compram vida e armas cada vez mais absurdas.',
  howToPlay: [
    'Digite "tapa" ou "entrar" para entrar na fila (grátis).',
    'Dois lutadores sobem ao píer e trocam tapas, um de cada vez.',
    'Presentes dão vida extra e melhoram a arma: mão, peixe, frigideira, taco, marreta e antena parabólica.',
    'O campeão continua no píer. A cada série de vitórias ele ganha um GOLPE FINAL.',
  ],
  accent: '#0ea5e9',
  emoji: '👋',
  settings: [
    { key: 'startHp', label: 'Vida inicial', type: 'number', default: 100, min: 20, max: 2000 },
    { key: 'hpPerCoin', label: 'Vida por moeda de presente', type: 'number', default: 5, min: 1, max: 200 },
    { key: 'pace', label: 'Ritmo dos tapas', type: 'select', default: 'normal', options: [{ value: 'slow', label: 'Lento (duelos longos)' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Rápido (nocautes rápidos)' }] },
    { key: 'finishEvery', label: 'Golpe final a cada N vitórias', type: 'number', default: 3, min: 1, max: 20 },
    { key: 'joinKeywords', label: 'Palavras para entrar na fila', type: 'text', default: 'tapa, entrar, eu' },
    { key: 'queueShown', label: 'Pessoas da fila mostradas', type: 'number', default: 8, min: 0, max: 16 },
    { key: 'demoDuels', label: 'Duelos de demonstração sem público', type: 'boolean', default: true },
    { key: 'resultHold', label: 'Tempo do aviso de vencedor', type: 'number', default: 3, min: 1, max: 15, unit: 's' },
  ],
  actions: [
    { id: 'join', label: 'Entrar na fila', description: 'Coloca o espectador na fila do píer.', params: [] },
    { id: 'power_up', label: 'Ganhar vida', description: 'Guarda vida extra para o lutador de quem enviou (vale também na fila).', params: [{ key: 'coins', label: 'Moedas', type: 'number', default: 1, min: 1, max: 10000 }] },
    {
      id: 'weapon', label: 'Melhorar arma', description: 'Coloca uma arma melhor na mão do lutador de quem enviou.',
      params: [{ key: 'level', label: 'Arma', type: 'select', default: '1', options: WEAPONS.slice(1).map((w, i) => ({ value: String(i + 1), label: w.name })) }],
    },
  ],
  defaultRules: [
    { id: 'gift-hp', label: 'Qualquer presente → vida (1 moeda por unidade)', trigger: { kind: 'GIFT' }, action: 'power_up', params: { coins: 1 }, maxQuantity: 200 },
    { id: 'gift-fish', label: 'Presente de 5+ → peixe', trigger: { kind: 'GIFT', minDiamonds: 5 }, action: 'weapon', params: { level: '1' }, scaleWithQuantity: false },
    { id: 'gift-pan', label: 'Presente de 20+ → frigideira', trigger: { kind: 'GIFT', minDiamonds: 20 }, action: 'weapon', params: { level: '2' }, scaleWithQuantity: false },
    { id: 'gift-bat', label: 'Presente de 50+ → taco', trigger: { kind: 'GIFT', minDiamonds: 50 }, action: 'weapon', params: { level: '3' }, scaleWithQuantity: false },
    { id: 'gift-mallet', label: 'Presente de 199+ → marreta', trigger: { kind: 'GIFT', minDiamonds: 199 }, action: 'weapon', params: { level: '4' }, scaleWithQuantity: false },
    { id: 'gift-dish', label: 'Presente de 999+ → antena parabólica', trigger: { kind: 'GIFT', minDiamonds: 999 }, action: 'weapon', params: { level: '5' }, scaleWithQuantity: false },
    { id: 'follow-join', label: 'Novo seguidor → entra na fila', trigger: { kind: 'FOLLOW' }, action: 'join', params: {} },
  ],
};
