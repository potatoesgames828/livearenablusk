import pino, { type Logger } from 'pino';
import { REDACT_PATHS } from '@live-arena/security';

export type { Logger };

/** Logger estruturado (JSON) com redação de campos sensíveis. */
export function createLogger(service: string, extra: Record<string, unknown> = {}): Logger {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'warn' : 'info'),
    base: { service, pid: process.pid, ...extra },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  });
}
