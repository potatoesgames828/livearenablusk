import {
  CONNECTOR_STATE_LABELS, RUNNER_STATE_LABELS, SESSION_STATE_LABELS, STREAM_STATE_LABELS,
  type ConnectorState, type RunnerState, type SessionState, type StreamState,
} from '@live-arena/shared';

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';

export function sessionTone(s: string): Tone {
  if (s === 'RUNNING') return 'ok';
  if (['STARTING', 'CONNECTING', 'RECONNECTING', 'RECOVERING', 'STOPPING', 'PAUSED'].includes(s)) return 'warn';
  if (s === 'ERROR') return 'bad';
  return 'neutral';
}
export function connectorTone(s: string): Tone {
  if (s === 'CONNECTED') return 'ok';
  if (['CONNECTING', 'RECONNECTING', 'OFFLINE'].includes(s)) return 'warn';
  if (s === 'ERROR') return 'bad';
  return 'neutral';
}
export function runnerTone(s: string): Tone {
  if (s === 'RUNNING') return 'ok';
  if (['LOADING', 'RECOVERING', 'PAUSED'].includes(s)) return 'warn';
  if (s === 'ERROR') return 'bad';
  return 'neutral';
}
export function streamTone(s: string): Tone {
  if (s === 'LIVE') return 'ok';
  if (['STARTING', 'DEGRADED', 'RESTARTING'].includes(s)) return 'warn';
  if (s === 'ERROR') return 'bad';
  return 'neutral';
}

export const labelSession = (s: string) => SESSION_STATE_LABELS[s as SessionState] ?? s;
export const labelConnector = (s: string) => CONNECTOR_STATE_LABELS[s as ConnectorState] ?? s;
export const labelRunner = (s: string) => RUNNER_STATE_LABELS[s as RunnerState] ?? s;
export const labelStream = (s: string) => STREAM_STATE_LABELS[s as StreamState] ?? s;

export const EVENT_LABELS: Record<string, string> = {
  GIFT: 'Presente',
  LIKE: 'Curtidas',
  CHAT: 'Comentário',
  FOLLOW: 'Seguidor',
  SHARE: 'Compartilhamento',
  MEMBER: 'Entrada',
  ROOM_USER: 'Espectadores',
  SUBSCRIPTION: 'Assinatura',
  STREAM_START: 'LIVE iniciada',
  STREAM_END: 'LIVE encerrada',
  BATTLE: 'Batalha',
  SYSTEM_WARNING: 'Aviso',
  SYSTEM_ERROR: 'Erro',
};

export function compact(n: number | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return d.toLocaleDateString('pt-BR');
}
