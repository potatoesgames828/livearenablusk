import type { SessionState } from '@live-arena/shared';

/**
 * Transições permitidas do ciclo de vida da sessão.
 * Qualquer transição fora desta tabela é rejeitada (409).
 */
export const SESSION_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  IDLE: ['CONNECTING', 'STARTING', 'STOPPED'],
  CONNECTING: ['CONNECTED', 'RECONNECTING', 'ERROR', 'STOPPING'],
  CONNECTED: ['STARTING', 'RECONNECTING', 'ERROR', 'STOPPING'],
  STARTING: ['RUNNING', 'ERROR', 'STOPPING'],
  RUNNING: ['PAUSED', 'RECONNECTING', 'RECOVERING', 'ERROR', 'STOPPING'],
  PAUSED: ['RUNNING', 'RECONNECTING', 'RECOVERING', 'ERROR', 'STOPPING'],
  RECONNECTING: ['RUNNING', 'PAUSED', 'CONNECTED', 'ERROR', 'STOPPING', 'RECOVERING'],
  RECOVERING: ['RUNNING', 'PAUSED', 'ERROR', 'STOPPING'],
  STOPPING: ['STOPPED', 'ERROR'],
  STOPPED: ['STARTING', 'CONNECTING'],
  ERROR: ['RECOVERING', 'STARTING', 'STOPPING', 'STOPPED'],
};

export function canTransition(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: SessionState,
    readonly to: SessionState,
  ) {
    super(`Transição inválida: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: SessionState, to: SessionState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Ações do painel e o estado alvo correspondente. */
export type SessionAction = 'start' | 'pause' | 'resume' | 'stop';

export function targetStateFor(action: SessionAction): SessionState {
  switch (action) {
    case 'start':
      return 'STARTING';
    case 'pause':
      return 'PAUSED';
    case 'resume':
      return 'RUNNING';
    case 'stop':
      return 'STOPPING';
  }
}

/** Quais ações o painel deve habilitar para um estado. */
export function availableActions(state: SessionState): SessionAction[] {
  const acts: SessionAction[] = [];
  if (canTransition(state, 'STARTING')) acts.push('start');
  if (state === 'RUNNING' || state === 'RECONNECTING') acts.push('pause');
  if (state === 'PAUSED') acts.push('resume');
  if (canTransition(state, 'STOPPING')) acts.push('stop');
  return acts;
}
