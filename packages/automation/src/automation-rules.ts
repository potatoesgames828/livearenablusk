import { z } from 'zod';

/**
 * Automações de alto nível ("quando X acontecer, faça Y").
 * Avaliadas pelo worker de automação.
 */
export const automationTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SESSION_STARTED') }),
  z.object({ kind: z.literal('STREAM_START') }),
  z.object({ kind: z.literal('STREAM_END') }),
  z.object({ kind: z.literal('INTERVAL'), minutes: z.number().int().min(1).max(1440) }),
  z.object({
    kind: z.literal('COUNTER_THRESHOLD'),
    counter: z.enum(['likes', 'gifts', 'diamonds', 'follows', 'shares', 'comments']),
    every: z.number().int().min(1),
  }),
  z.object({ kind: z.literal('CONNECTOR_LOST') }),
  z.object({ kind: z.literal('ROUND_ENDED') }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

export const automationActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('START_GAME') }),
  z.object({ kind: z.literal('PAUSE_GAME') }),
  z.object({ kind: z.literal('RESUME_GAME') }),
  z.object({ kind: z.literal('RESET_ROUND') }),
  z.object({ kind: z.literal('RESET_SCORES') }),
  z.object({ kind: z.literal('SWITCH_GAME'), gameConfigId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('ROTATE_GAMES'), gameConfigIds: z.array(z.string().min(1).max(64)).min(2).max(10) }),
  z.object({ kind: z.literal('ANNOUNCE'), text: z.string().min(1).max(120) }),
  z.object({ kind: z.literal('NOTIFY_OWNER'), text: z.string().min(1).max(200) }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const automationRuleInputSchema = z.object({
  trigger: automationTriggerSchema,
  action: automationActionSchema,
});

export const automationInputSchema = z.object({
  name: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
  sessionId: z.string().max(64).nullable().optional(),
  rules: z.array(automationRuleInputSchema).min(1).max(20),
});
export type AutomationInput = z.infer<typeof automationInputSchema>;

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTrigger['kind'], string> = {
  SESSION_STARTED: 'Quando a sessão iniciar',
  STREAM_START: 'Quando a LIVE começar (fonte de eventos)',
  STREAM_END: 'Quando a LIVE terminar',
  INTERVAL: 'A cada X minutos',
  COUNTER_THRESHOLD: 'A cada N curtidas/presentes/…',
  CONNECTOR_LOST: 'Quando a conexão com a fonte cair',
  ROUND_ENDED: 'Quando uma rodada terminar',
};

export const AUTOMATION_ACTION_LABELS: Record<AutomationAction['kind'], string> = {
  START_GAME: 'Iniciar jogo',
  PAUSE_GAME: 'Pausar jogo',
  RESUME_GAME: 'Retomar jogo',
  RESET_ROUND: 'Reiniciar rodada',
  RESET_SCORES: 'Zerar pontuação',
  SWITCH_GAME: 'Trocar para outro jogo',
  ROTATE_GAMES: 'Alternar entre jogos',
  ANNOUNCE: 'Exibir anúncio no overlay',
  NOTIFY_OWNER: 'Notificar o dono da conta',
};

/** Decide se um gatilho de intervalo deve disparar. */
export function intervalDue(lastRunAt: number | null, minutes: number, now: number): boolean {
  return lastRunAt === null || now - lastRunAt >= minutes * 60_000;
}

/** Próximo item de uma rotação (circular). */
export function nextInRotation(list: string[], current: string): string {
  const idx = list.indexOf(current);
  return list[(idx + 1) % list.length] ?? list[0] ?? current;
}
