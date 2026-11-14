import { z } from 'zod';

export const planLimitsSchema = z.object({
  maxConcurrentSessions: z.number().int().min(0),
  maxGameConfigs: z.number().int().min(0),
  maxAutomations: z.number().int().min(0),
  /** IDs de jogos liberados; ['*'] libera todos. */
  allowedGames: z.array(z.string()),
  maxSessionMinutes: z.number().int().min(0),
  streamOutput: z.boolean(),
  liveConnector: z.boolean(),
  statsRetentionDays: z.number().int().min(1),
  maxOverlays: z.number().int().min(0),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

/** Valores iniciais. Os valores efetivos ficam no banco (SubscriptionPlan) e são editáveis no admin. */
export const DEFAULT_PLANS: Array<{ code: string; name: string; priceCents: number; limits: PlanLimits }> = [
  {
    code: 'free',
    name: 'Gratuito',
    priceCents: 0,
    limits: {
      maxConcurrentSessions: 1,
      maxGameConfigs: 3,
      maxAutomations: 2,
      allowedGames: ['snake-live', 'plinko-live'],
      maxSessionMinutes: 120,
      streamOutput: false,
      liveConnector: true,
      statsRetentionDays: 7,
      maxOverlays: 2,
    },
  },
  {
    code: 'basic',
    name: 'Básico',
    priceCents: 0,
    limits: {
      maxConcurrentSessions: 1,
      maxGameConfigs: 10,
      maxAutomations: 10,
      allowedGames: ['*'],
      maxSessionMinutes: 360,
      streamOutput: false,
      liveConnector: true,
      statsRetentionDays: 30,
      maxOverlays: 5,
    },
  },
  {
    code: 'pro',
    name: 'Profissional',
    priceCents: 0,
    limits: {
      maxConcurrentSessions: 3,
      maxGameConfigs: 50,
      maxAutomations: 50,
      allowedGames: ['*'],
      maxSessionMinutes: 720,
      streamOutput: true,
      liveConnector: true,
      statsRetentionDays: 90,
      maxOverlays: 20,
    },
  },
  {
    code: 'advanced',
    name: 'Avançado',
    priceCents: 0,
    limits: {
      maxConcurrentSessions: 10,
      maxGameConfigs: 200,
      maxAutomations: 200,
      allowedGames: ['*'],
      maxSessionMinutes: 1440,
      streamOutput: true,
      liveConnector: true,
      statsRetentionDays: 365,
      maxOverlays: 100,
    },
  },
];

export function isGameAllowed(limits: PlanLimits, gameId: string): boolean {
  return limits.allowedGames.includes('*') || limits.allowedGames.includes(gameId);
}
