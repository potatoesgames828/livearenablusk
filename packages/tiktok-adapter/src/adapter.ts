import type { RawSourceEvent } from '@live-arena/event-engine';
import type { ConnectorState } from '@live-arena/shared';

/**
 * Contrato único de fonte de eventos. TODA a plataforma conversa com esta
 * interface — nunca com uma biblioteca específica — para que o fornecedor
 * possa ser trocado (biblioteca open source, serviço gerenciado, API oficial).
 */
export interface TikTokConnectorAdapter {
  readonly provider: ProviderId;
  connect(target: ConnectTarget, handlers: AdapterHandlers): Promise<void>;
  disconnect(): Promise<void>;
}

export type ProviderId = 'SIMULATOR' | 'TIKTOK_TTLC' | 'EULER_STREAM';

export interface ConnectTarget {
  /** @usuario do criador (sem @). */
  uniqueId: string;
  /** Credenciais opcionais do provedor (ex.: API key do serviço gerenciado). */
  credentials?: Record<string, string>;
  options?: Record<string, unknown>;
}

export interface AdapterHandlers {
  onEvent(event: RawSourceEvent): void;
  /** Mudanças de estado relatadas pela fonte. */
  onState(state: ConnectorState, detail?: string): void;
  /** Encerramento inesperado da conexão (o gerenciador decide se reconecta). */
  onDisconnected(reason: string, retryable: boolean): void;
}

export class ConnectorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorUnavailableError';
  }
}

/** O criador não está ao vivo: não adianta reconectar rapidamente. */
export class UserOfflineError extends Error {
  constructor(message = 'Criador não está ao vivo') {
    super(message);
    this.name = 'UserOfflineError';
  }
}
