import client, { Registry, Counter, Gauge, Histogram } from 'prom-client';
import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Registro Prometheus por processo, com métricas padrão do Node. */
export const registry = new Registry();
let initialized = false;

export function initMetrics(service: string): Registry {
  if (initialized) return registry;
  initialized = true;
  registry.setDefaultLabels({ service });
  client.collectDefaultMetrics({ register: registry, prefix: 'la_' });
  return registry;
}

function counter(name: string, help: string, labelNames: string[] = []) {
  return new Counter({ name, help, labelNames, registers: [registry] });
}
function gauge(name: string, help: string, labelNames: string[] = []) {
  return new Gauge({ name, help, labelNames, registers: [registry] });
}
function histogram(name: string, help: string, labelNames: string[], buckets: number[]) {
  return new Histogram({ name, help, labelNames, buckets, registers: [registry] });
}

export const metrics = {
  eventsReceived: counter('la_events_received_total', 'Eventos recebidos pela ingestão', ['type', 'source']),
  eventsProcessed: counter('la_events_processed_total', 'Eventos processados', ['type', 'status']),
  eventsDropped: counter('la_events_dropped_total', 'Eventos descartados (backpressure/rate limit)', ['type', 'reason']),
  eventsDuplicated: counter('la_events_duplicated_total', 'Eventos duplicados ignorados', ['type']),
  eventProcessingSeconds: histogram(
    'la_event_processing_seconds',
    'Tempo de processamento de evento',
    ['type'],
    [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  ),
  actionsEmitted: counter('la_game_actions_total', 'Ações de jogo emitidas', ['game', 'action']),
  activeSessions: gauge('la_active_sessions', 'Sessões ativas neste processo', ['kind']),
  realtimeConnections: gauge('la_realtime_connections', 'Conexões WebSocket abertas', ['kind']),
  reconnections: counter('la_connector_reconnections_total', 'Reconexões de conectores', ['provider']),
  runnerTickSeconds: histogram('la_runner_tick_seconds', 'Duração do tick dos jogos', ['game'], [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05]),
  runnerRecoveries: counter('la_runner_recoveries_total', 'Sessões recuperadas a partir de checkpoint', ['reason']),
  queueDepth: gauge('la_queue_depth', 'Profundidade das filas', ['queue', 'state']),
  streamFps: gauge('la_stream_fps', 'FPS do encoder', ['session']),
  streamBitrate: gauge('la_stream_bitrate_kbps', 'Bitrate do encoder (kbps)', ['session']),
  streamRestarts: counter('la_stream_restarts_total', 'Reinicializações do encoder', ['reason']),
  httpRequests: counter('la_http_requests_total', 'Requisições HTTP', ['method', 'route', 'status']),
  httpDuration: histogram('la_http_request_seconds', 'Duração das requisições HTTP', ['method', 'route'], [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5]),
  errors: counter('la_errors_total', 'Erros por componente', ['component', 'code']),
  eventLoopLag: gauge('la_event_loop_lag_seconds', 'Atraso do event loop (p99)'),
};

/** Monitora o event loop e expõe p99 (detecção de travamentos). */
export function startEventLoopMonitor(onBlocked?: (lagMs: number) => void, thresholdMs = 500): () => void {
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  const timer = setInterval(() => {
    const p99 = h.percentile(99) / 1e6;
    metrics.eventLoopLag.set(p99 / 1000);
    if (onBlocked && p99 > thresholdMs) onBlocked(p99);
    h.reset();
  }, 5000);
  timer.unref();
  return () => {
    clearInterval(timer);
    h.disable();
  };
}
