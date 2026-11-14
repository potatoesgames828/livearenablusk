/** Ciclo de vida de uma sessão de LIVE (Live Automation Engine). */
export const SESSION_STATES = [
  'IDLE',
  'CONNECTING',
  'CONNECTED',
  'STARTING',
  'RUNNING',
  'PAUSED',
  'RECONNECTING',
  'STOPPING',
  'STOPPED',
  'ERROR',
  'RECOVERING',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** Estados considerados "ativos" — ocupam recursos e contam no limite do plano. */
export const ACTIVE_SESSION_STATES: ReadonlySet<SessionState> = new Set([
  'CONNECTING',
  'CONNECTED',
  'STARTING',
  'RUNNING',
  'PAUSED',
  'RECONNECTING',
  'RECOVERING',
  'STOPPING',
]);

/** Estado da fonte de eventos (independente do vídeo). */
export const CONNECTOR_STATES = [
  'DISABLED',
  'IDLE',
  'CONNECTING',
  'CONNECTED',
  'RECONNECTING',
  'OFFLINE',
  'ERROR',
] as const;
export type ConnectorState = (typeof CONNECTOR_STATES)[number];

/** Estado do processamento do jogo (game-runner). */
export const RUNNER_STATES = ['IDLE', 'LOADING', 'RUNNING', 'PAUSED', 'RECOVERING', 'ERROR', 'STOPPED'] as const;
export type RunnerState = (typeof RUNNER_STATES)[number];

/** Estado da saída de vídeo (Stream Manager). */
export const STREAM_STATES = ['NOT_CONFIGURED', 'IDLE', 'STARTING', 'LIVE', 'DEGRADED', 'RESTARTING', 'STOPPED', 'ERROR'] as const;
export type StreamState = (typeof STREAM_STATES)[number];

export const CONTROL_COMMANDS = [
  'START',
  'PAUSE',
  'RESUME',
  'STOP',
  'RESET_ROUND',
  'RESET_SCORES',
  'SWITCH_GAME',
  'ANNOUNCE',
] as const;
export type ControlCommand = (typeof CONTROL_COMMANDS)[number];

export const SESSION_STATE_LABELS: Record<SessionState, string> = {
  IDLE: 'Parada',
  CONNECTING: 'Conectando',
  CONNECTED: 'Conectada',
  STARTING: 'Iniciando',
  RUNNING: 'Em execução',
  PAUSED: 'Pausada',
  RECONNECTING: 'Reconectando',
  STOPPING: 'Encerrando',
  STOPPED: 'Encerrada',
  ERROR: 'Erro',
  RECOVERING: 'Recuperando',
};

export const CONNECTOR_STATE_LABELS: Record<ConnectorState, string> = {
  DISABLED: 'Sem fonte (apenas simulador)',
  IDLE: 'Aguardando',
  CONNECTING: 'Conectando ao TikTok',
  CONNECTED: 'Recebendo eventos',
  RECONNECTING: 'Reconectando',
  OFFLINE: 'Criador não está ao vivo',
  ERROR: 'Erro na fonte de eventos',
};

export const RUNNER_STATE_LABELS: Record<RunnerState, string> = {
  IDLE: 'Aguardando',
  LOADING: 'Carregando jogo',
  RUNNING: 'Jogo rodando',
  PAUSED: 'Jogo pausado',
  RECOVERING: 'Recuperando estado',
  ERROR: 'Erro no jogo',
  STOPPED: 'Jogo parado',
};

export const STREAM_STATE_LABELS: Record<StreamState, string> = {
  NOT_CONFIGURED: 'Saída de vídeo não configurada',
  IDLE: 'Pronta',
  STARTING: 'Iniciando transmissão',
  LIVE: 'Transmitindo',
  DEGRADED: 'Transmitindo com problemas',
  RESTARTING: 'Reiniciando encoder',
  STOPPED: 'Transmissão parada',
  ERROR: 'Erro na transmissão',
};
