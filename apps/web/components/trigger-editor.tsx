'use client';
import type { RuleTrigger } from '@live-arena/shared';
import { Field, Input, Select } from '@/components/ui';

export const TRIGGER_LABELS: Record<RuleTrigger['kind'], string> = {
  GIFT: 'Presente',
  LIKE_THRESHOLD: 'Meta de curtidas',
  CHAT_KEYWORD: 'Palavra no chat (sem !)',
  CHAT_COMMAND: 'Comando no chat (com !)',
  FOLLOW: 'Novo seguidor',
  SHARE: 'Compartilhamento',
  MEMBER: 'Entrada na LIVE',
  SUBSCRIPTION: 'Assinatura',
  VIEWERS_THRESHOLD: 'Meta de espectadores',
  CUSTOM: 'Evento personalizado',
};

const DEFAULTS: Record<RuleTrigger['kind'], RuleTrigger> = {
  GIFT: { kind: 'GIFT' },
  LIKE_THRESHOLD: { kind: 'LIKE_THRESHOLD', every: 1000 },
  CHAT_KEYWORD: { kind: 'CHAT_KEYWORD', keyword: 'entrar', match: 'word' },
  CHAT_COMMAND: { kind: 'CHAT_COMMAND', command: '!comando' },
  FOLLOW: { kind: 'FOLLOW' },
  SHARE: { kind: 'SHARE' },
  MEMBER: { kind: 'MEMBER' },
  SUBSCRIPTION: { kind: 'SUBSCRIPTION' },
  VIEWERS_THRESHOLD: { kind: 'VIEWERS_THRESHOLD', every: 100 },
  CUSTOM: { kind: 'CUSTOM', name: 'meta_batida' },
};

/** Resumo legível do gatilho ("Presente (≥ 100💎)"). */
export function triggerSummary(t: RuleTrigger): string {
  const base = TRIGGER_LABELS[t.kind];
  switch (t.kind) {
    case 'GIFT': {
      const range = t.minDiamonds !== undefined && t.maxDiamonds !== undefined ? ` (${t.minDiamonds}–${t.maxDiamonds}💎)` : t.minDiamonds ? ` (≥${t.minDiamonds}💎)` : t.maxDiamonds !== undefined ? ` (≤${t.maxDiamonds}💎)` : '';
      return `${base}${t.giftName ? ` "${t.giftName}"` : ''}${range}`;
    }
    case 'LIKE_THRESHOLD':
    case 'VIEWERS_THRESHOLD':
      return `${base}: a cada ${t.every.toLocaleString('pt-BR')}`;
    case 'CHAT_COMMAND':
      return `${base} ${t.command}`;
    case 'CHAT_KEYWORD':
      return `Comentário "${t.keyword}"`;
    case 'CUSTOM':
      return `${base} "${t.name}"`;
    default:
      return base;
  }
}

/** Editor de gatilho reutilizado pelas regras de jogo e pelos alertas. */
export function TriggerEditor({ id, value, onChange }: { id: string; value: RuleTrigger; onChange: (t: RuleTrigger) => void }) {
  const t = value;
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)));
  return (
    <>
      <Field label="Quando acontecer…" htmlFor={`${id}-trigger`}>
        <Select id={`${id}-trigger`} value={t.kind} onChange={(e) => onChange(DEFAULTS[e.target.value as RuleTrigger['kind']])}>
          {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      {t.kind === 'GIFT' && (
        <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
          <Field label="Mínimo de diamantes" htmlFor={`${id}-min`} hint="Vazio = qualquer.">
            <Input id={`${id}-min`} type="number" min={0} value={t.minDiamonds ?? ''} onChange={(e) => onChange({ ...t, minDiamonds: num(e.target.value) })} />
          </Field>
          <Field label="Máximo de diamantes" htmlFor={`${id}-max`} hint="Vazio = sem limite.">
            <Input id={`${id}-max`} type="number" min={0} value={t.maxDiamonds ?? ''} onChange={(e) => onChange({ ...t, maxDiamonds: num(e.target.value) })} />
          </Field>
          <Field label="Nome do presente" htmlFor={`${id}-gname`} hint="Ex.: Rose. Vazio = qualquer.">
            <Input id={`${id}-gname`} value={t.giftName ?? ''} onChange={(e) => onChange({ ...t, giftName: e.target.value || undefined })} />
          </Field>
        </div>
      )}
      {(t.kind === 'LIKE_THRESHOLD' || t.kind === 'VIEWERS_THRESHOLD') && (
        <Field label={t.kind === 'LIKE_THRESHOLD' ? 'A cada quantas curtidas' : 'A cada quantos espectadores'} htmlFor={`${id}-every`}>
          <Input id={`${id}-every`} type="number" min={1} value={t.every} onChange={(e) => onChange({ ...t, every: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
      )}
      {t.kind === 'CHAT_COMMAND' && (
        <Field label="Comando" htmlFor={`${id}-cmd`} hint="Começa com ! (ex.: !join)">
          <Input id={`${id}-cmd`} value={t.command} onChange={(e) => onChange({ ...t, command: e.target.value.trim().slice(0, 32) })} />
        </Field>
      )}
      {t.kind === 'CHAT_KEYWORD' && (
        <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
          <Field label="Palavra ou frase" htmlFor={`${id}-kw`} hint="Maiúsculas e acentos são ignorados.">
            <Input id={`${id}-kw`} value={t.keyword} onChange={(e) => onChange({ ...t, keyword: e.target.value.slice(0, 40) })} />
          </Field>
          <Field label="Como comparar" htmlFor={`${id}-match`}>
            <Select id={`${id}-match`} value={t.match} onChange={(e) => onChange({ ...t, match: e.target.value as 'word' | 'contains' | 'exact' })}>
              <option value="word">Primeira palavra do comentário</option>
              <option value="contains">Em qualquer parte</option>
              <option value="exact">Comentário exatamente igual</option>
            </Select>
          </Field>
        </div>
      )}
      {t.kind === 'CUSTOM' && (
        <Field label="Nome do evento" htmlFor={`${id}-custom`} hint="Letras, números, _ . - (enviado por automações ou pela API).">
          <Input id={`${id}-custom`} value={t.name} onChange={(e) => onChange({ ...t, name: e.target.value.replace(/[^a-z0-9_.-]/gi, '').slice(0, 40) })} />
        </Field>
      )}
    </>
  );
}
