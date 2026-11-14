import type { EventRule, GiftPayload, LiveEvent } from '@live-arena/shared';

export interface RuleMatch {
  rule: EventRule;
  /** Quantidade de vezes que a ação deve ser aplicada. */
  quantity: number;
}

export interface MatchContext {
  /** Unidades novas do presente (após tratamento de streak). */
  giftDelta?: number;
  /** Totais de curtidas antes e depois deste evento. */
  likesBefore?: number;
  likesAfter?: number;
  /** Espectadores antes e depois (eventos ROOM_USER). */
  viewersBefore?: number;
  viewersAfter?: number;
}

/** Normaliza texto para comparação: minúsculas e sem acentos. */
export function normText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Verifica se um comentário corresponde a uma palavra-chave (sem "!"). */
export function keywordMatches(comment: string, keyword: string, match: 'word' | 'contains' | 'exact' = 'word'): boolean {
  const c = normText(comment).replace(/^!/, '');
  const k = normText(keyword).replace(/^!/, '');
  if (!k) return false;
  if (match === 'exact') return c === k;
  if (match === 'contains') return c.includes(k);
  if (k.includes(' ')) return c === k || c.startsWith(`${k} `);
  return (c.split(/\s+/)[0] ?? '') === k;
}

/** Extrai o comando de um comentário ("!join agora" → "!join"). */
export function parseCommand(comment: string): string | null {
  const m = /^\s*(![a-z0-9_]{1,31})\b/i.exec(comment);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/** Combina um evento com as regras configuradas (função pura, sem efeitos colaterais). */
export function matchRules(event: LiveEvent, rules: EventRule[], ctx: MatchContext = {}): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const t = rule.trigger;
    switch (t.kind) {
      case 'GIFT': {
        if (event.type !== 'GIFT') break;
        const p = event.payload as unknown as GiftPayload;
        if (t.giftId && t.giftId !== p.giftId) break;
        if (t.giftName && t.giftName.toLowerCase() !== (p.giftName ?? '').toLowerCase()) break;
        if (t.minDiamonds !== undefined && (p.diamondValue ?? 0) < t.minDiamonds) break;
        if (t.maxDiamonds !== undefined && (p.diamondValue ?? 0) > t.maxDiamonds) break;
        const units = ctx.giftDelta ?? 1;
        if (units <= 0) break;
        const q = rule.scaleWithQuantity ? Math.min(units, rule.maxQuantity) : 1;
        out.push({ rule, quantity: q });
        break;
      }
      case 'LIKE_THRESHOLD': {
        if (event.type !== 'LIKE' || ctx.likesAfter === undefined) break;
        const before = ctx.likesBefore ?? 0;
        const crossed = Math.floor(ctx.likesAfter / t.every) - Math.floor(before / t.every);
        if (crossed > 0) out.push({ rule, quantity: Math.min(crossed, rule.maxQuantity) });
        break;
      }
      case 'CHAT_COMMAND': {
        if (event.type !== 'CHAT') break;
        const cmd = parseCommand(String((event.payload as { comment?: string }).comment ?? ''));
        if (cmd && cmd === t.command.toLowerCase()) out.push({ rule, quantity: 1 });
        break;
      }
      case 'CHAT_KEYWORD': {
        if (event.type !== 'CHAT') break;
        if (keywordMatches(String((event.payload as { comment?: string }).comment ?? ''), t.keyword, t.match)) out.push({ rule, quantity: 1 });
        break;
      }
      case 'CUSTOM': {
        if (event.type !== 'CUSTOM') break;
        if (String((event.payload as { name?: string }).name ?? '').toLowerCase() === t.name.toLowerCase()) out.push({ rule, quantity: 1 });
        break;
      }
      case 'VIEWERS_THRESHOLD': {
        if (event.type !== 'ROOM_USER' || ctx.viewersAfter === undefined) break;
        const before = ctx.viewersBefore ?? 0;
        const crossed = Math.floor(ctx.viewersAfter / t.every) - Math.floor(before / t.every);
        if (crossed > 0) out.push({ rule, quantity: Math.min(crossed, rule.maxQuantity) });
        break;
      }
      case 'FOLLOW':
      case 'SHARE':
      case 'MEMBER':
      case 'SUBSCRIPTION':
        if (event.type === t.kind) out.push({ rule, quantity: 1 });
        break;
    }
  }
  return out;
}
