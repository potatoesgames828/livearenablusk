import { eventRuleSchema, gameConfigBodySchema, type GameConfigBody } from '@live-arena/shared';
import type { GameManifest } from './types';

/** Configuração padrão de um jogo a partir do manifesto. */
export function defaultConfigFor(manifest: GameManifest): GameConfigBody {
  const settings: Record<string, number | boolean | string> = {};
  for (const s of manifest.settings) settings[s.key] = s.default;
  return gameConfigBodySchema.parse({
    settings,
    rules: manifest.defaultRules.map((r) => eventRuleSchema.parse(r)),
    autoMode: true,
    aspect: 'vertical',
    soundEnabled: true,
    theme: {},
  });
}

/**
 * Valida uma configuração contra o manifesto: ações inexistentes e valores fora
 * dos limites são rejeitados com mensagens claras.
 */
export function validateConfigAgainstManifest(manifest: GameManifest, body: GameConfigBody): string[] {
  const errors: string[] = [];
  const actionIds = new Set(manifest.actions.map((a) => a.id));
  for (const r of body.rules) {
    if (!actionIds.has(r.action)) errors.push(`Regra "${r.label ?? r.id}": ação "${r.action}" não existe neste jogo.`);
  }
  for (const s of manifest.settings) {
    const v = body.settings[s.key];
    if (v === undefined) continue;
    if (s.type === 'number') {
      if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`"${s.label}" deve ser um número.`);
      else if ((s.min !== undefined && v < s.min) || (s.max !== undefined && v > s.max))
        errors.push(`"${s.label}" deve estar entre ${s.min} e ${s.max}.`);
    } else if (s.type === 'boolean' && typeof v !== 'boolean') errors.push(`"${s.label}" deve ser sim/não.`);
    else if (s.type === 'select' && !s.options?.some((o) => o.value === v)) errors.push(`"${s.label}" possui valor inválido.`);
  }
  const ids = new Set<string>();
  for (const r of body.rules) {
    if (ids.has(r.id)) errors.push(`Regra duplicada: ${r.id}`);
    ids.add(r.id);
  }
  return errors;
}
