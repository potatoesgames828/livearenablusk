import { z } from 'zod';

/** Tipos de evento suportados pelo Event Engine (independentes da fonte). */
export const LIVE_EVENT_TYPES = [
  'GIFT',
  'LIKE',
  'CHAT',
  'FOLLOW',
  'SHARE',
  'MEMBER',
  'ROOM_USER',
  'STREAM_START',
  'STREAM_END',
  'SUBSCRIPTION',
  'BATTLE',
  'SYSTEM_WARNING',
  'SYSTEM_ERROR',
  'CUSTOM',
] as const;
export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];

export const EVENT_SOURCES = ['tiktok', 'simulator', 'system', 'manual'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** Prioridade de processamento: menor número = maior prioridade (BullMQ). */
export const EVENT_PRIORITY: Record<LiveEventType, number> = {
  STREAM_START: 1,
  STREAM_END: 1,
  SYSTEM_ERROR: 1,
  GIFT: 2,
  SUBSCRIPTION: 2,
  BATTLE: 3,
  FOLLOW: 4,
  SHARE: 4,
  SYSTEM_WARNING: 4,
  CHAT: 6,
  LIKE: 7,
  MEMBER: 8,
  ROOM_USER: 9,
  CUSTOM: 5,
};

/** Eventos que podem ser descartados sob sobrecarga (backpressure). */
export const LOW_PRIORITY_EVENTS: ReadonlySet<LiveEventType> = new Set([
  'LIKE',
  'CHAT',
  'MEMBER',
  'ROOM_USER',
]);

export const viewerSchema = z.object({
  /** Identificador estável fornecido pela fonte (nunca o username). */
  id: z.string().min(1).max(128),
  username: z.string().max(128).optional(),
  nickname: z.string().max(128).optional(),
  avatarUrl: z.string().url().max(2048).optional(),
});
export type Viewer = z.infer<typeof viewerSchema>;

export const giftPayloadSchema = z.object({
  giftId: z.string().max(64),
  giftName: z.string().max(128).optional(),
  /** Quantidade nova a ser creditada (já descontando atualizações intermediárias). */
  quantity: z.number().int().min(0).max(100000).optional(),
  /** Contagem acumulada informada pela fonte para a sequência (streak). */
  repeatCount: z.number().int().min(0).max(100000),
  /** true quando a fonte sinaliza o fim da sequência. */
  repeatEnd: z.boolean().optional(),
  /** true quando o presente pode formar sequência (streakable). */
  streakable: z.boolean().optional(),
  /** Identificador de agrupamento da sequência quando fornecido. */
  groupId: z.string().max(64).optional(),
  diamondValue: z.number().int().min(0).max(10_000_000).optional(),
  imageUrl: z.string().url().max(2048).optional(),
});

export const likePayloadSchema = z.object({
  /** Curtidas novas contidas neste evento (pode ser um lote agregado). */
  count: z.number().int().min(1).max(10_000_000),
  /** Total de curtidas da LIVE quando a fonte informa. */
  total: z.number().int().min(0).optional(),
  /** true quando o evento foi gerado por agregação local. */
  aggregated: z.boolean().optional(),
  /** Participantes do lote agregado (top N). */
  contributors: z
    .array(z.object({ id: z.string(), username: z.string().optional(), count: z.number().int() }))
    .max(50)
    .optional(),
});

export const chatPayloadSchema = z.object({
  comment: z.string().max(500),
});

export const roomUserPayloadSchema = z.object({
  viewerCount: z.number().int().min(0),
});

export const customPayloadSchema = z.object({
  name: z.string().min(1).max(40).regex(/^[a-z0-9_.-]+$/i),
  value: z.number().optional(),
  text: z.string().max(200).optional(),
});

export const systemPayloadSchema = z.object({
  code: z.string().max(64),
  message: z.string().max(1000),
});

export const genericPayloadSchema = z.record(z.string(), z.unknown());

export const liveEventSchema = z.object({
  eventId: z.string().min(8).max(128),
  tenantId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64),
  source: z.enum(EVENT_SOURCES),
  type: z.enum(LIVE_EVENT_TYPES),
  user: viewerSchema.optional(),
  payload: genericPayloadSchema,
  /** ISO-8601 */
  timestamp: z.string().datetime(),
  /** Marca eventos de simulação para que nunca sejam exibidos como reais. */
  simulated: z.boolean().default(false),
});
export type LiveEvent = z.infer<typeof liveEventSchema>;
export type LiveEventInput = z.input<typeof liveEventSchema>;

export type GiftPayload = z.infer<typeof giftPayloadSchema>;
export type LikePayload = z.infer<typeof likePayloadSchema>;
export type ChatPayload = z.infer<typeof chatPayloadSchema>;
export type RoomUserPayload = z.infer<typeof roomUserPayloadSchema>;
export type SystemPayload = z.infer<typeof systemPayloadSchema>;

/** Valida o payload específico do tipo. Retorna mensagem de erro ou null. */
export function validateEventPayload(type: LiveEventType, payload: unknown): string | null {
  const schema =
    type === 'GIFT'
      ? giftPayloadSchema
      : type === 'LIKE'
        ? likePayloadSchema
        : type === 'CHAT'
          ? chatPayloadSchema
          : type === 'ROOM_USER'
            ? roomUserPayloadSchema
            : type === 'CUSTOM'
              ? customPayloadSchema
              : type === 'SYSTEM_ERROR' || type === 'SYSTEM_WARNING'
              ? systemPayloadSchema
              : genericPayloadSchema;
  const res = schema.safeParse(payload);
  return res.success ? null : res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}
