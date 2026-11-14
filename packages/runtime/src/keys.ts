/** Chaves Redis centralizadas. Sempre incluem tenant/sessão quando aplicável. */
export const keys = {
  /** Conjunto de sessões que devem ter um game-runner ativo. */
  activeSessions: () => 'la:sessions:active',
  /** Conjunto de sessões que devem ter um conector ativo. */
  activeConnectors: () => 'la:connectors:active',
  /** Metadados da sessão ativa (tenantId, gameConfig…) usados pelos workers. */
  sessionMeta: (sessionId: string) => `la:session:${sessionId}:meta`,
  /** Lease de posse da sessão por um game-runner. */
  runnerLease: (sessionId: string) => `la:lease:runner:${sessionId}`,
  connectorLease: (sessionId: string) => `la:lease:connector:${sessionId}`,
  streamLease: (streamKeyHash: string) => `la:lease:stream:${streamKeyHash}`,
  /** Stream Redis de mensagens para o runner (ações, controles, sinais). */
  actions: (sessionId: string) => `la:session:${sessionId}:actions`,
  /** Checkpoint quente do jogo. */
  checkpoint: (sessionId: string) => `la:session:${sessionId}:checkpoint`,
  /** Último snapshot de estado (para novos espectadores do overlay). */
  lastState: (sessionId: string) => `la:session:${sessionId}:laststate`,
  /** Contadores agregados da sessão (mesmo formato de defaultEngineKeys.counters). */
  counters: (sessionId: string) => `la:session:${sessionId}:counters`,
  /** Chaves de deduplicação, sequências e cooldowns: ver defaultEngineKeys no event-engine. */
  /** Status em tempo real dos serviços. */
  serviceHeartbeat: (kind: string, id: string) => `la:svc:${kind}:${id}`,
  /** Tentativas de login (brute force). */
  loginAttempts: (fingerprint: string) => `la:auth:attempts:${fingerprint}`,
  /** Estado do encoder de vídeo. */
  streamStats: (sessionId: string) => `la:session:${sessionId}:stream`,
  /** Comando de simulação de falha (somente modo demo/teste). */
  faultInjection: (sessionId: string) => `la:session:${sessionId}:fault`,
};
