import { createHash } from 'node:crypto';
import {
  liveEventSchema,
  validateEventPayload,
  type LiveEvent,
  type LiveEventType,
  type EventSource,
  type Viewer,
} from '@live-arena/shared';

/** Evento bruto produzido por um adaptador (antes de receber tenant/sessão). */
export interface RawSourceEvent {
  /** ID fornecido pela fonte (msgId). Quando ausente, é derivado de forma determinística. */
  sourceEventId?: string;
  source: EventSource;
  type: LiveEventType;
  user?: Partial<Viewer> & { id?: string };
  payload: Record<string, unknown>;
  timestamp?: string | number | Date;
  simulated?: boolean;
}

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventValidationError';
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

export function sanitizeText(input: unknown, max = 500): string {
  if (typeof input !== 'string') return '';
  return input.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

function toIso(ts: RawSourceEvent['timestamp']): string {
  if (ts === undefined) return new Date().toISOString();
  const d = ts instanceof Date ? ts : new Date(typeof ts === 'string' && /^\d+$/.test(ts) ? Number(ts) : ts);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function deriveEventId(tenantId: string, sessionId: string, raw: RawSourceEvent): string {
  if (raw.sourceEventId) return `${raw.source}:${raw.sourceEventId}`.slice(0, 128);
  const h = createHash('sha1')
    .update(JSON.stringify([tenantId, sessionId, raw.type, raw.user?.id, raw.payload, raw.timestamp]))
    .digest('hex');
  return `${raw.source}:h:${h}`;
}

/**
 * Normaliza e valida um evento bruto para o formato interno.
 * Campos ausentes na fonte permanecem ausentes (nunca são inventados).
 */
export function normalizeEvent(tenantId: string, sessionId: string, raw: RawSourceEvent): LiveEvent {
  const payload: Record<string, unknown> = { ...raw.payload };
  if (raw.type === 'CHAT') payload.comment = sanitizeText(payload.comment, 500);
  if (raw.type === 'GIFT' && typeof payload.giftName === 'string') payload.giftName = sanitizeText(payload.giftName, 128);

  let user: Viewer | undefined;
  if (raw.user?.id) {
    user = { id: String(raw.user.id).slice(0, 128) };
    if (raw.user.username) user.username = sanitizeText(raw.user.username, 128);
    if (raw.user.nickname) user.nickname = sanitizeText(raw.user.nickname, 128);
    if (raw.user.avatarUrl && /^https:\/\//.test(raw.user.avatarUrl)) user.avatarUrl = raw.user.avatarUrl.slice(0, 2048);
  }

  const payloadError = validateEventPayload(raw.type, payload);
  if (payloadError) throw new EventValidationError(`payload inválido para ${raw.type}: ${payloadError}`);

  const parsed = liveEventSchema.safeParse({
    eventId: deriveEventId(tenantId, sessionId, raw),
    tenantId,
    sessionId,
    source: raw.source,
    type: raw.type,
    user,
    payload,
    timestamp: toIso(raw.timestamp),
    simulated: raw.simulated ?? raw.source === 'simulator',
  });
  if (!parsed.success) {
    throw new EventValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return parsed.data;
}
