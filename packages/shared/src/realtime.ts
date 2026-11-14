/**
 * Contratos de tempo real compartilhados entre realtime, runner, worker e web.
 * Os canais Redis sempre incluem o tenant e a sessão para manter o isolamento.
 */
export const channels = {
  /** Snapshots do estado do jogo (alta frequência). */
  sessionState: (tenantId: string, sessionId: string) => `rt:${tenantId}:${sessionId}:state`,
  /** Eventos processados (feed). */
  sessionEvents: (tenantId: string, sessionId: string) => `rt:${tenantId}:${sessionId}:events`,
  /** Mudanças de status (ciclo de vida, conector, runner, stream). */
  sessionStatus: (tenantId: string, sessionId: string) => `rt:${tenantId}:${sessionId}:status`,
  /** Efeitos visuais pontuais (anúncios, explosões, etc.). */
  sessionFx: (tenantId: string, sessionId: string) => `rt:${tenantId}:${sessionId}:fx`,
  /** Notificações do tenant (alertas, sessões). */
  tenant: (tenantId: string) => `rt:${tenantId}:tenant`,
};

export const REALTIME_PATTERN = 'rt:*';

export const socketEvents = {
  subscribeSession: 'session:subscribe',
  unsubscribeSession: 'session:unsubscribe',
  state: 'session:state',
  events: 'session:events',
  status: 'session:status',
  fx: 'session:fx',
  tenant: 'tenant:notice',
  error: 'error:notice',
} as const;

export interface SessionStatusPayload {
  sessionId: string;
  state?: string;
  connectorState?: string;
  runnerState?: string;
  streamState?: string;
  message?: string;
  stats?: Record<string, number>;
  at: number;
}

export interface SocketRoomInfo {
  room: string;
  kind: 'dashboard' | 'overlay';
}

export const roomFor = (tenantId: string, sessionId: string) => `s:${tenantId}:${sessionId}`;
export const tenantRoomFor = (tenantId: string) => `t:${tenantId}`;
