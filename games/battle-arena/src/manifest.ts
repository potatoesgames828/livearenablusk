import { joinAction, matchSettings, type GameManifest, type TeamDef } from '@live-arena/game-engine';

export const TEAMS: TeamDef[] = [
  { name: 'Vermelho', color: '#f43f5e', keywords: ['vermelho', '1', 'a', 'red'] },
  { name: 'Azul', color: '#3b82f6', keywords: ['azul', '2', 'b', 'blue'] },
];

export const manifest: GameManifest = {
  id: 'battle-arena',
  name: 'Battle Arena',
  description:
    'Dois times de espectadores numa arena. Cada pessoa que entra vira um lutador com seu nome e visual próprio, que luta sozinho contra o time rival. Presentes dão vida, disparam rajadas de armas pesadas, convocam golens e ativam escudos.',
  howToPlay: [
    'Digite "vermelho" ou "azul" (ou 1 / 2) no chat para entrar com seu lutador.',
    'Seu lutador anda e ataca sozinho o time rival. Abates valem pontos.',
    'Presentes disparam rajadas: espingarda, foguete, bala de canhão e, com sorte, uma bomba nuclear.',
    'Presentes maiores convocam golens, curam ou protegem o time. Curtidas ativam a fúria coletiva.',
    'Vence o time que fizer os abates primeiro (ou o último de pé, conforme o modo).',
  ],
  accent: '#f43f5e',
  emoji: '⚔️',
  settings: [
    { key: 'winMode', label: 'Modo de vitória', type: 'select', default: 'kills', options: [{ value: 'kills', label: 'Primeiro a N abates' }, { value: 'elimination', label: 'Eliminação (sem renascer)' }, { value: 'timed', label: 'Por tempo (mais abates)' }] },
    { key: 'killsToWin', label: 'Abates para vencer', type: 'number', default: 25, min: 3, max: 500 },
    { key: 'teamAName', label: 'Nome do time 1', type: 'text', default: 'Vermelho' },
    { key: 'teamBName', label: 'Nome do time 2', type: 'text', default: 'Azul' },
    { key: 'baseHp', label: 'Vida inicial do lutador', type: 'number', default: 100, min: 10, max: 5000 },
    { key: 'hpPerGrow', label: 'Vida por "crescer"', type: 'number', default: 60, min: 1, max: 5000 },
    { key: 'pistolDamage', label: 'Dano da pistola automática', type: 'number', default: 9, min: 0, max: 500 },
    { key: 'respawnSeconds', label: 'Tempo para renascer', type: 'number', default: 3, min: 0, max: 30, unit: 's' },
    { key: 'nukeChance', label: 'Chance de bomba nuclear por tiro', type: 'number', default: 3, min: 0, max: 50, unit: '%' },
    { key: 'suddenDeath', label: 'Morte súbita no empate', type: 'boolean', default: true },
    { key: 'screenShake', label: 'Tremor de tela nas explosões', type: 'boolean', default: true },
    ...matchSettings({ lobbySeconds: 25, maxParticipants: 40, minToStart: 4, matchSeconds: 150, joinKeywords: 'entrar, eu', practiceBots: 6, lateJoin: true }),
  ],
  actions: [
    joinAction(TEAMS),
    { id: 'barrage', label: 'Rajada de armas', description: 'O lutador de quem enviou dispara uma rajada de armas aleatórias contra o time rival, um tiro por vez.', params: [{ key: 'shots', label: 'Tiros por presente', type: 'number', default: 2, min: 1, max: 50 }] },
    { id: 'grow_hp', label: 'Crescer (vida)', description: 'Aumenta a vida e o tamanho do lutador de quem enviou.', params: [{ key: 'amount', label: 'Vida extra', type: 'number', default: 60, min: 1, max: 5000 }] },
    { id: 'summon_golem', label: 'Convocar golem', description: 'Um golem lutador entra no time de quem enviou, com o nome dessa pessoa.', params: [{ key: 'hp', label: 'Vida do golem', type: 'number', default: 400, min: 50, max: 20000 }] },
    { id: 'heal_team', label: 'Curar o time', description: 'Cura todos os lutadores do time de quem enviou.', params: [{ key: 'amount', label: 'Cura', type: 'number', default: 40, min: 1, max: 5000 }] },
    { id: 'shield_team', label: 'Escudo no time', description: 'Bloqueia o dano recebido pelo time por alguns segundos.', params: [{ key: 'duration', label: 'Duração', type: 'number', default: 4, min: 1, max: 30, unit: 's' }] },
    { id: 'rage', label: 'Fúria coletiva', description: 'O time de quem interagiu (ou o que está perdendo) causa o dobro de dano.', params: [{ key: 'duration', label: 'Duração', type: 'number', default: 6, min: 1, max: 60, unit: 's' }] },
    { id: 'meteor_rain', label: 'Chuva de meteoros', description: 'Evento coletivo: meteoros caem sobre o time que está vencendo.', params: [{ key: 'count', label: 'Meteoros', type: 'number', default: 8, min: 1, max: 40 }] },
  ],
  defaultRules: [
    { id: 'cmd-red', label: '!vermelho → entrar no Vermelho', trigger: { kind: 'CHAT_COMMAND', command: '!vermelho' }, action: 'join', params: { team: '0' }, perUserCooldownMs: 5000 },
    { id: 'cmd-blue', label: '!azul → entrar no Azul', trigger: { kind: 'CHAT_COMMAND', command: '!azul' }, action: 'join', params: { team: '1' }, perUserCooldownMs: 5000 },
    { id: 'gift-barrage', label: 'Qualquer presente → rajada (2 tiros por unidade)', trigger: { kind: 'GIFT' }, action: 'barrage', params: { shots: 2 }, maxQuantity: 25 },
    { id: 'gift-grow', label: 'Presente de 5+ diamantes → crescer', trigger: { kind: 'GIFT', minDiamonds: 5 }, action: 'grow_hp', params: { amount: 60 }, maxQuantity: 20 },
    { id: 'gift-golem', label: 'Presente de 99+ diamantes → golem', trigger: { kind: 'GIFT', minDiamonds: 99 }, action: 'summon_golem', params: { hp: 400 }, scaleWithQuantity: false },
    { id: 'likes-rage', label: 'A cada 300 curtidas → fúria do time', trigger: { kind: 'LIKE_THRESHOLD', every: 300 }, action: 'rage', params: { duration: 6 }, maxQuantity: 3 },
    { id: 'likes-meteor', label: 'A cada 1.000 curtidas → chuva de meteoros', trigger: { kind: 'LIKE_THRESHOLD', every: 1000 }, action: 'meteor_rain', params: { count: 8 }, maxQuantity: 2 },
    { id: 'follow-heal', label: 'Novo seguidor → cura o time', trigger: { kind: 'FOLLOW' }, action: 'heal_team', params: { amount: 30 }, cooldownMs: 2000 },
    { id: 'share-shield', label: 'Compartilhamento → escudo no time', trigger: { kind: 'SHARE' }, action: 'shield_team', params: { duration: 3 }, cooldownMs: 5000 },
  ],
};
