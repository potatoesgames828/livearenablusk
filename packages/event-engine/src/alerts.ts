import { ruleTriggerSchema, type EventRule, type GiftPayload, type LiveEvent, type RuleTrigger } from '@live-arena/shared';
import { matchRules, type MatchContext } from './rules';

/** Alerta configurado pelo criador (mesmo formato de gatilho das regras de jogo). */
export interface AlertConfig {
  id: string;
  name: string;
  enabled: boolean;
  trigger: unknown;
  message: string;
  emoji: string;
  color: string;
  soundId?: string | null;
  volume: number;
  durationMs: number;
  cooldownMs: number;
}

/** Alerta pronto para exibição no overlay. */
export interface AlertFx {
  type: 'alert';
  alertId: string;
  title: string;
  emoji: string;
  color: string;
  soundId?: string;
  volume: number;
  durationMs: number;
  user?: { name: string; avatarUrl?: string };
  simulated: boolean;
}

/** Substitui variáveis do texto: {usuario} {presente} {quantidade} {diamantes} {comentario} {curtidas}. */
export function renderAlertMessage(template: string, event: LiveEvent, quantity: number): string {
  const p = event.payload as Record<string, unknown>;
  const name = event.user?.nickname || event.user?.username || 'Alguém';
  const vars: Record<string, string> = {
    usuario: name,
    user: name,
    presente: String((p as Partial<GiftPayload>).giftName ?? 'presente'),
    quantidade: String(quantity),
    diamantes: String((p as Partial<GiftPayload>).diamondValue ?? 0),
    comentario: String(p.comment ?? '').slice(0, 80),
    curtidas: String(p.count ?? ''),
    espectadores: String(p.viewerCount ?? ''),
  };
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k.toLowerCase()] ?? m).slice(0, 140);
}

/** Retorna os alertas que casam com o evento (sem aplicar cooldown, que depende do store). */
export function matchAlerts(event: LiveEvent, alerts: AlertConfig[], ctx: MatchContext): Array<{ alert: AlertConfig; quantity: number }> {
  const rules: EventRule[] = [];
  const byId = new Map<string, AlertConfig>();
  for (const a of alerts) {
    if (!a.enabled) continue;
    const t = ruleTriggerSchema.safeParse(a.trigger);
    if (!t.success) continue;
    byId.set(a.id, a);
    rules.push({ id: a.id, enabled: true, trigger: t.data as RuleTrigger, action: 'alert', params: {}, cooldownMs: 0, perUserCooldownMs: 0, maxPerMinute: 0, scaleWithQuantity: true, maxQuantity: 1000 });
  }
  return matchRules(event, rules, ctx).map((m) => ({ alert: byId.get(m.rule.id)!, quantity: m.quantity }));
}

export function toAlertFx(a: AlertConfig, event: LiveEvent, quantity: number): AlertFx {
  const fx: AlertFx = {
    type: 'alert', alertId: a.id, title: renderAlertMessage(a.message, event, quantity), emoji: a.emoji.slice(0, 8), color: a.color,
    volume: Math.max(0, Math.min(100, a.volume)), durationMs: Math.max(1000, Math.min(15000, a.durationMs)), simulated: event.simulated,
  };
  if (a.soundId) fx.soundId = a.soundId;
  if (event.user) fx.user = { name: event.user.nickname || event.user.username || 'Alguém', ...(event.user.avatarUrl ? { avatarUrl: event.user.avatarUrl } : {}) };
  return fx;
}
