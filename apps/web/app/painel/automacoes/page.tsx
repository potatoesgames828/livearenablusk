'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Workflow } from 'lucide-react';
import {
  AUTOMATION_ACTION_LABELS, AUTOMATION_TRIGGER_LABELS, type AutomationAction, type AutomationTrigger,
} from '@live-arena/automation';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, Switch, confirmAction, toast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { GameConfig, Session } from '@/lib/types';

interface Automation { id: string; name: string; enabled: boolean; sessionId: string | null; lastRunAt: string | null; rules: Array<{ id: string; trigger: AutomationTrigger; action: AutomationAction }> }

function describe(t: AutomationTrigger, a: AutomationAction, configs: GameConfig[]): string {
  const trig = t.kind === 'INTERVAL' ? `A cada ${t.minutes} min` : t.kind === 'COUNTER_THRESHOLD' ? `A cada ${t.every} ${t.counter}` : AUTOMATION_TRIGGER_LABELS[t.kind];
  const cfg = (id: string) => configs.find((c) => c.id === id)?.name ?? id;
  const act = a.kind === 'ANNOUNCE' || a.kind === 'NOTIFY_OWNER' ? `${AUTOMATION_ACTION_LABELS[a.kind]}: “${a.text}”` : a.kind === 'SWITCH_GAME' ? `Trocar para ${cfg(a.gameConfigId)}` : a.kind === 'ROTATE_GAMES' ? `Alternar: ${a.gameConfigIds.map(cfg).join(' → ')}` : AUTOMATION_ACTION_LABELS[a.kind];
  return `${trig} → ${act}`;
}

export default function AutomationsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['automations'], queryFn: () => api<Automation[]>('/automations') });
  const configs = useQuery({ queryKey: ['configs'], queryFn: () => api<GameConfig[]>('/games/configs') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/sessions') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', sessionId: '', trigger: 'INTERVAL' as AutomationTrigger['kind'], minutes: 10, counter: 'likes', every: 1000, action: 'RESET_ROUND' as AutomationAction['kind'], text: '', gameConfigId: '', rotate: [] as string[] });

  function build(): { trigger: AutomationTrigger; action: AutomationAction } {
    const trigger: AutomationTrigger =
      form.trigger === 'INTERVAL' ? { kind: 'INTERVAL', minutes: form.minutes } : form.trigger === 'COUNTER_THRESHOLD' ? { kind: 'COUNTER_THRESHOLD', counter: form.counter as 'likes', every: form.every } : ({ kind: form.trigger } as AutomationTrigger);
    const action: AutomationAction =
      form.action === 'ANNOUNCE' || form.action === 'NOTIFY_OWNER' ? { kind: form.action, text: form.text } : form.action === 'SWITCH_GAME' ? { kind: 'SWITCH_GAME', gameConfigId: form.gameConfigId } : form.action === 'ROTATE_GAMES' ? { kind: 'ROTATE_GAMES', gameConfigIds: form.rotate } : ({ kind: form.action } as AutomationAction);
    return { trigger, action };
  }

  async function save() {
    try {
      await api('/automations', { method: 'POST', body: { name: form.name || 'Automação', enabled: true, sessionId: form.sessionId || null, rules: [build()] } });
      toast('Automação criada.');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['automations'] });
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  async function toggle(a: Automation, enabled: boolean) {
    await api(`/automations/${a.id}`, { method: 'PUT', body: { name: a.name, enabled, sessionId: a.sessionId, rules: a.rules.map((r) => ({ trigger: r.trigger, action: r.action })) } }).catch((e: unknown) => toast(errorMessage(e), 'bad'));
    void qc.invalidateQueries({ queryKey: ['automations'] });
  }

  return (
    <>
      <PageHeader title="Automações" description="Deixe a LIVE rodar sozinha: troque jogos, reinicie rodadas e faça anúncios automaticamente." actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Nova automação</Button>} />
      {list.isLoading ? (
        <Skeleton className="h-40" />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState icon={<Workflow className="size-8" />} title="Nenhuma automação" description="Exemplo: a cada 15 minutos, alternar entre Snake Live e Plinko Live." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data!.map((a) => (
            <Card key={a.id} title={a.name} subtitle={a.sessionId ? `Somente: ${sessions.data?.find((s) => s.id === a.sessionId)?.name ?? 'LIVE'}` : 'Todas as LIVES'} action={<Badge tone={a.enabled ? 'ok' : 'neutral'}>{a.enabled ? 'ativa' : 'pausada'}</Badge>}>
              <ul className="mb-3 space-y-1 text-sm text-slate-300">
                {a.rules.map((r) => <li key={r.id}>{describe(r.trigger, r.action, configs.data ?? [])}</li>)}
              </ul>
              <p className="mb-3 text-xs text-slate-500">Última execução: {a.lastRunAt ? new Date(a.lastRunAt).toLocaleString('pt-BR') : 'nunca'}</p>
              <div className="flex items-center justify-between gap-2">
                <Switch checked={a.enabled} onChange={(v) => void toggle(a, v)} label="Ativa" />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="size-4" />}
                  onClick={async () => {
                    if (!(await confirmAction({ title: 'Excluir automação', message: `“${a.name}” será excluída.`, confirmLabel: 'Excluir' }))) return;
                    await api(`/automations/${a.id}`, { method: 'DELETE' }).catch((e: unknown) => toast(errorMessage(e), 'bad'));
                    void qc.invalidateQueries({ queryKey: ['automations'] });
                  }}
                >
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nova automação" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => void save()}>Criar</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Nome" htmlFor="a-name"><Input id="a-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Ex.: Rotação de jogos" /></Field>
          <Field label="Aplicar em" htmlFor="a-sess">
            <Select id="a-sess" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}>
              <option value="">Todas as LIVES</option>
              {(sessions.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Quando" htmlFor="a-trig">
            <Select id="a-trig" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as AutomationTrigger['kind'] })}>
              {Object.entries(AUTOMATION_TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {form.trigger === 'INTERVAL' && <Field label="Minutos" htmlFor="a-min"><Input id="a-min" type="number" min={1} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} /></Field>}
          {form.trigger === 'COUNTER_THRESHOLD' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contador" htmlFor="a-counter">
                <Select id="a-counter" value={form.counter} onChange={(e) => setForm({ ...form, counter: e.target.value })}>
                  <option value="likes">Curtidas</option><option value="gifts">Presentes</option><option value="diamonds">Diamantes</option><option value="follows">Seguidores</option><option value="shares">Compartilhamentos</option><option value="comments">Comentários</option>
                </Select>
              </Field>
              <Field label="A cada" htmlFor="a-every"><Input id="a-every" type="number" min={1} value={form.every} onChange={(e) => setForm({ ...form, every: Number(e.target.value) })} /></Field>
            </div>
          )}
          <Field label="Faça" htmlFor="a-act">
            <Select id="a-act" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as AutomationAction['kind'] })}>
              {Object.entries(AUTOMATION_ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {(form.action === 'ANNOUNCE' || form.action === 'NOTIFY_OWNER') && <Field label="Texto" htmlFor="a-text"><Input id="a-text" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} maxLength={120} /></Field>}
          {form.action === 'SWITCH_GAME' && (
            <Field label="Jogo" htmlFor="a-cfg">
              <Select id="a-cfg" value={form.gameConfigId} onChange={(e) => setForm({ ...form, gameConfigId: e.target.value })}>
                <option value="">Escolha…</option>
                {(configs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          {form.action === 'ROTATE_GAMES' && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-200">Jogos na rotação (escolha 2 ou mais)</legend>
              {(configs.data ?? []).map((c) => (
                <label key={c.id} className="flex min-h-10 items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" className="size-5" checked={form.rotate.includes(c.id)} onChange={(e) => setForm({ ...form, rotate: e.target.checked ? [...form.rotate, c.id] : form.rotate.filter((x) => x !== c.id) })} />
                  {c.name}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </Modal>
    </>
  );
}
