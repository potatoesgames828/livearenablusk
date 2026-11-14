import { z } from 'zod';

/** Gatilhos configuráveis que transformam eventos da LIVE em ações de jogo. */
export const ruleTriggerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('GIFT'),
    /** Quando vazio, qualquer presente dispara. */
    giftId: z.string().max(64).optional(),
    giftName: z.string().max(128).optional(),
    minDiamonds: z.number().int().min(0).optional(),
  }),
  z.object({ kind: z.literal('LIKE_THRESHOLD'), every: z.number().int().min(1).max(1_000_000) }),
  z.object({
    kind: z.literal('CHAT_COMMAND'),
    command: z
      .string()
      .min(2)
      .max(32)
      .regex(/^![a-z0-9_]+$/i, 'Comandos começam com ! e usam letras, números ou _'),
  }),
  z.object({ kind: z.literal('FOLLOW') }),
  z.object({ kind: z.literal('SHARE') }),
  z.object({ kind: z.literal('MEMBER') }),
  z.object({ kind: z.literal('SUBSCRIPTION') }),
]);
export type RuleTrigger = z.infer<typeof ruleTriggerSchema>;

export const ruleParamValueSchema = z.union([z.number(), z.string().max(200), z.boolean()]);

export const eventRuleSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  label: z.string().max(80).optional(),
  trigger: ruleTriggerSchema,
  /** Identificador de uma ação declarada no manifesto do jogo. */
  action: z.string().min(1).max(64),
  params: z.record(z.string(), ruleParamValueSchema).default({}),
  /** Intervalo mínimo global entre disparos desta regra. */
  cooldownMs: z.number().int().min(0).max(3_600_000).default(0),
  /** Intervalo mínimo por espectador. */
  perUserCooldownMs: z.number().int().min(0).max(3_600_000).default(0),
  /** Limite de disparos por minuto (0 = sem limite). */
  maxPerMinute: z.number().int().min(0).max(10_000).default(0),
  /** Multiplica a ação pela quantidade do presente (até o limite). */
  scaleWithQuantity: z.boolean().default(true),
  maxQuantity: z.number().int().min(1).max(1000).default(50),
});
export type EventRule = z.infer<typeof eventRuleSchema>;
export type EventRuleInput = z.input<typeof eventRuleSchema>;

export const gameConfigBodySchema = z.object({
  settings: z.record(z.string(), ruleParamValueSchema).default({}),
  rules: z.array(eventRuleSchema).max(100).default([]),
  autoMode: z.boolean().default(true),
  /** 'vertical' (9:16) ou 'horizontal' (16:9) */
  aspect: z.enum(['vertical', 'horizontal']).default('vertical'),
  soundEnabled: z.boolean().default(true),
  theme: z
    .object({
      primary: z.string().regex(/^#[0-9a-f]{6}$/i).default('#3b82f6'),
      secondary: z.string().regex(/^#[0-9a-f]{6}$/i).default('#8b5cf6'),
      background: z.string().regex(/^#[0-9a-f]{6}$/i).default('#070b17'),
    })
    // Zod 4: prefault aplica os padrões internos quando o tema não é enviado.
    .prefault({}),
});
export type GameConfigBody = z.infer<typeof gameConfigBodySchema>;

/** Ação de jogo derivada de um evento por uma regra. */
export interface GameActionMessage {
  kind: 'game';
  actionId: string;
  params: Record<string, number | string | boolean>;
  quantity: number;
  viewer?: { id: string; username?: string; nickname?: string; avatarUrl?: string };
  eventId: string;
  ruleId: string;
  simulated: boolean;
  at: number;
}

export interface ControlMessage {
  kind: 'control';
  command: import('./session').ControlCommand;
  args?: Record<string, unknown>;
  requestedBy?: string;
  at: number;
}

/** Evento informativo (sem regra) entregue ao jogo para ranking/participação. */
export interface ViewerSignalMessage {
  kind: 'signal';
  type: 'CHAT' | 'GIFT' | 'LIKE' | 'FOLLOW' | 'SHARE' | 'MEMBER';
  viewer?: { id: string; username?: string; nickname?: string; avatarUrl?: string };
  value: number;
  text?: string;
  eventId: string;
  simulated: boolean;
  at: number;
}

export type RunnerMessage = GameActionMessage | ControlMessage | ViewerSignalMessage;
