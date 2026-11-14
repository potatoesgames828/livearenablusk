'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import type { RuleTrigger } from '@live-arena/shared';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, Switch, confirmAction, toast } from '@/components/ui';
import { TriggerEditor, triggerSummary } from '@/components/trigger-editor';
import { api, errorMessage, hasPerm, useAuth } from '@/lib/api';

interface Alert {
  id: string; name: string; enabled: boolean; trigger: RuleTrigger; message: string; emoji: string; color: string;
  soundId: string | null; volume: number; durationMs: number; cooldownMs: number;
}
type Draft = Omit<Alert, 'id'> & { id?: string };

const PRESETS: Array<{ label: string; draft: Draft }> = [
  { label: 'Presente recebido', draft: { name: 'Presente', enabled: true, trigger: { kind: 'GIFT' }, message: '{usuario} enviou {quantidade}x {presente}!', emoji: '🎁', color: '#f472b6', soundId: null, volume: 80, durationMs: 4000, cooldownMs: 0 } },
  { label: 'Presente grande (100+💎)', draft: { name: 'Presente grande', enabled: true, trigger: { kind: 'GIFT', minDiamonds: 100 }, message: '🔥 {usuario} mandou {presente}! Valeu demais!', emoji: '💎', color: '#facc15', soundId: null, volume: 90, durationMs: 6000, cooldownMs: 0 } },
  { label: 'Novo seguidor', draft: { name: 'Seguidor', enabled: true, trigger: { kind: 'FOLLOW' }, message: '{usuario} começou a seguir!', emoji: '💜', color: '#a855f7', soundId: null, volume: 70, durationMs: 3500, cooldownMs: 2000 } },
  { label: 'Meta de curtidas', draft: { name: 'Meta de curtidas', enabled: true, trigger: { kind: 'LIKE_THRESHOLD', every: 1000 }, message: 'Batemos mais 1.000 curtidas! ❤️', emoji: '❤️', color: '#ef4444', soundId: null, volume: 80, durationMs: 4000, cooldownMs: 0 } },
  { label: 'Compartilhamento', draft: { name: 'Compartilhamento', enabled: true, trigger: { kind: 'SHARE' }, message: '{usuario} compartilhou a LIVE!', emoji: '🔁', color: '#22c55e', soundId: null, volume: 70, durationMs: 3500, cooldownMs: 3000 } },
];

export default function AlertsPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const canEdit = hasPerm(user, 'game:configure');
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api<Alert[]>('/alerts') });
  const sounds = useQuery({ queryKey: ['sounds'], queryFn: () => api<{ items: Array<{ id: string; name: string }> }>('/sounds') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const { id, ...body } = draft;
      await api(id ? `/alerts/${id}` : '/alerts', { method: id ? 'PUT' : 'POST', body });
      toast('Alerta salvo.');
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setSaving(false);
    }
  }
  async function remove(a: Alert) {
    if (!(await confirmAction({ title: 'Excluir alerta', message: `"${a.name}" será excluído.`, confirmLabel: 'Excluir', danger: true }))) return;
    await api(`/alerts/${a.id}`, { method: 'DELETE' }).catch((e: unknown) => toast(errorMessage(e), 'bad'));
    void qc.invalidateQueries({ queryKey: ['alerts'] });
  }
  async function test(a: Alert) {
    try {
      const r = await api<{ deliveredTo: number }>(`/alerts/${a.id}/test`, { method: 'POST' });
      toast(r.deliveredTo ? `Teste enviado para ${r.deliveredTo} LIVE(s) ativa(s). Veja no overlay.` : 'Nenhuma LIVE ativa: inicie uma LIVE (pode ser de demonstração) para ver o teste no overlay.', r.deliveredTo ? 'ok' : 'warn');
    } catch (err) {
      toast(errorMessage(err), 'bad');
    }
  }
  async function toggle(a: Alert, enabled: boolean) {
    try {
      const { id, ...rest } = a;
      await api(`/alerts/${id}`, { method: 'PUT', body: { ...rest, enabled } });
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    }
  }

  return (
    <>
      <PageHeader title="Alertas" description="Mensagens animadas no overlay quando chegam presentes, seguidores, metas ou palavras no chat. Podem tocar um som do soundboard." actions={canEdit && <Button icon={<Plus className="size-4" />} onClick={() => setDraft(PRESETS[0]!.draft)}>Novo alerta</Button>} />
      {alerts.isLoading ? <Skeleton className="h-48" /> : alerts.isError ? (
        <EmptyState title="Não foi possível carregar" description={errorMessage(alerts.error)} />
      ) : (alerts.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={<Bell className="size-6" />} title="Nenhum alerta configurado" description="Comece por um modelo pronto:" />
          {canEdit && <div className="mt-2 flex flex-wrap justify-center gap-2">{PRESETS.map((p) => <Button key={p.label} variant="secondary" size="sm" onClick={() => setDraft(p.draft)}>{p.label}</Button>)}</div>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {alerts.data!.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${a.color}33`, border: `2px solid ${a.color}` }} aria-hidden>{a.emoji}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-white">{a.name}</h3>
                  <p className="text-xs text-slate-400">{triggerSummary(a.trigger)}</p>
                </div>
                <Badge tone={a.enabled ? 'ok' : 'neutral'}>{a.enabled ? 'ativo' : 'pausado'}</Badge>
              </div>
              <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-200">{a.message}</p>
              <p className="mt-2 text-xs text-slate-500">{(a.durationMs / 1000).toFixed(1)} s na tela{a.soundId ? ` · som: ${sounds.data?.items.find((s) => s.id === a.soundId)?.name ?? '—'}` : ' · sem som'}{a.cooldownMs ? ` · intervalo ${a.cooldownMs / 1000}s` : ''}</p>
              {canEdit && (
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
                  <Switch checked={a.enabled} onChange={(v) => void toggle(a, v)} label="Ativo" />
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" icon={<Send className="size-4" />} onClick={() => void test(a)}>Testar</Button>
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setDraft(a)} aria-label={`Editar ${a.name}`} />
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove(a)} aria-label={`Excluir ${a.name}`} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Editar alerta' : 'Novo alerta'} wide
        footer={<><Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button><Button loading={saving} onClick={() => void save()}>Salvar</Button></>}>
        {draft && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!draft.id && (
              <Field label="Modelo" htmlFor="al-preset">
                <Select id="al-preset" onChange={(e) => setDraft(PRESETS[Number(e.target.value)]!.draft)} defaultValue="0">
                  {PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Nome" htmlFor="al-name"><Input id="al-name" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <TriggerEditor id="al" value={draft.trigger} onChange={(trigger) => setDraft({ ...draft, trigger })} />
            <div className="sm:col-span-2">
              <Field label="Mensagem" htmlFor="al-msg" hint="Variáveis: {usuario} {presente} {quantidade} {diamantes} {comentario} {curtidas} {espectadores}">
                <Input id="al-msg" value={draft.message} maxLength={140} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
              </Field>
            </div>
            <Field label="Emoji" htmlFor="al-emoji"><Input id="al-emoji" value={draft.emoji} maxLength={8} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} /></Field>
            <Field label="Cor" htmlFor="al-color"><Input id="al-color" type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="h-11 p-1" /></Field>
            <Field label="Som" htmlFor="al-sound" hint="Envie sons em Soundboard.">
              <Select id="al-sound" value={draft.soundId ?? ''} onChange={(e) => setDraft({ ...draft, soundId: e.target.value || null })}>
                <option value="">Sem som</option>
                {(sounds.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={`Volume (${draft.volume}%)`} htmlFor="al-vol"><input id="al-vol" type="range" min={0} max={100} value={draft.volume} onChange={(e) => setDraft({ ...draft, volume: Number(e.target.value) })} className="w-full accent-violet-500" /></Field>
            <Field label="Tempo na tela (s)" htmlFor="al-dur"><Input id="al-dur" type="number" min={1} max={15} step={0.5} value={draft.durationMs / 1000} onChange={(e) => setDraft({ ...draft, durationMs: Math.round(Math.min(15, Math.max(1, Number(e.target.value))) * 1000) })} /></Field>
            <Field label="Intervalo mínimo (s)" htmlFor="al-cd" hint="Evita repetição em rajadas."><Input id="al-cd" type="number" min={0} max={600} value={draft.cooldownMs / 1000} onChange={(e) => setDraft({ ...draft, cooldownMs: Math.round(Math.max(0, Number(e.target.value)) * 1000) })} /></Field>
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Prévia</p>
              <div className="flex items-center gap-4 rounded-3xl border-4 bg-slate-950 px-5 py-4" style={{ borderColor: draft.color }}>
                <span className="text-4xl" aria-hidden>{draft.emoji}</span>
                <p className="text-lg font-black text-white">{draft.message.replace('{usuario}', 'ana_gamer').replace('{presente}', 'Rosa').replace('{quantidade}', '5').replace('{diamantes}', '1').replace('{curtidas}', '1000')}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
