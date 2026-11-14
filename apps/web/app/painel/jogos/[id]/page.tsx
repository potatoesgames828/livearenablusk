'use client';
import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Save, RotateCcw, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import type { EventRule, GameConfigBody } from '@live-arena/shared';
import type { ActionDef, ParamDef } from '@live-arena/game-engine';
import { Badge, Button, Card, Field, Input, Select, Skeleton, Switch, Tabs, confirmAction, toast } from '@/components/ui';
import { GameCanvas } from '@/components/game-canvas';
import { DemoControls } from '@/components/demo-controls';
import { api, ApiError, errorMessage, hasPerm, useAuth } from '@/lib/api';
import { useLocalGame } from '@/lib/local-game';
import type { CatalogGame, GameConfig } from '@/lib/types';
import { TriggerEditor, triggerSummary } from '@/components/trigger-editor';


function ParamInput({ def, value, onChange, id }: { def: ParamDef; value: unknown; onChange: (v: number | boolean | string) => void; id: string }) {
  if (def.type === 'boolean') return <Switch checked={Boolean(value ?? def.default)} onChange={onChange} label={def.label} description={def.help} />;
  if (def.type === 'select')
    return (
      <Field label={def.label} htmlFor={id} hint={def.help}>
        <Select id={id} value={String(value ?? def.default)} onChange={(e) => onChange(e.target.value)}>
          {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
    );
  return (
    <Field label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`} htmlFor={id} hint={def.help ?? (def.min !== undefined ? `Entre ${def.min} e ${def.max}` : undefined)}>
      <Input
        id={id}
        type={def.type === 'number' ? 'number' : 'text'}
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        min={def.min}
        max={def.max}
        step={def.step ?? (def.type === 'number' ? 1 : undefined)}
        value={String(value ?? def.default)}
        onChange={(e) => onChange(def.type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </Field>
  );
}

function RuleEditor({ rule, actions, onChange, onRemove, index }: { rule: EventRule; actions: ActionDef[]; onChange: (r: EventRule) => void; onRemove: () => void; index: number }) {
  const [open, setOpen] = useState(index < 2);
  const action = actions.find((a) => a.id === rule.action);
  const t = rule.trigger;
  const summary = `${triggerSummary(t)} → ${action?.label ?? rule.action}`;
  const id = `r${index}`;
  return (
    <li className="rounded-xl border border-line bg-white/[0.02]">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          {open ? <ChevronUp className="size-4 shrink-0" aria-hidden /> : <ChevronDown className="size-4 shrink-0" aria-hidden />}
          <span className={`truncate text-sm ${rule.enabled ? 'text-slate-100' : 'text-slate-500 line-through'}`}>{rule.label || summary}</span>
        </button>
        <Badge tone={rule.enabled ? 'ok' : 'neutral'}>{rule.enabled ? 'ativa' : 'desligada'}</Badge>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remover regra" icon={<Trash2 className="size-4" />} />
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-4 border-t border-line p-3 sm:grid-cols-2">
          <Field label="Nome da regra (opcional)" htmlFor={`${id}-label`}>
            <Input id={`${id}-label`} value={rule.label ?? ''} onChange={(e) => onChange({ ...rule, label: e.target.value || undefined })} placeholder={summary} maxLength={80} />
          </Field>
          <Switch checked={rule.enabled} onChange={(v) => onChange({ ...rule, enabled: v })} label="Regra ativa" />
          <TriggerEditor id={id} value={t} onChange={(trigger) => onChange({ ...rule, trigger })} />
          <Field label="…faça no jogo" htmlFor={`${id}-action`} hint={action?.description}>
            <Select id={`${id}-action`} value={rule.action} onChange={(e) => onChange({ ...rule, action: e.target.value, params: {} })}>
              {actions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
          {action?.params.map((p) => (
            <ParamInput key={p.key} id={`${id}-p-${p.key}`} def={p} value={rule.params[p.key]} onChange={(v) => onChange({ ...rule, params: { ...rule.params, [p.key]: v } })} />
          ))}
          <Field label="Intervalo mínimo entre disparos (s)" htmlFor={`${id}-cd`} hint="0 = sem intervalo (recomendado para presentes).">
            <Input id={`${id}-cd`} type="number" min={0} value={rule.cooldownMs / 1000} onChange={(e) => onChange({ ...rule, cooldownMs: Math.max(0, Number(e.target.value) * 1000) })} />
          </Field>
          <Field label="Intervalo por espectador (s)" htmlFor={`${id}-ucd`} hint="Evita que uma pessoa repita o comando sem parar.">
            <Input id={`${id}-ucd`} type="number" min={0} value={rule.perUserCooldownMs / 1000} onChange={(e) => onChange({ ...rule, perUserCooldownMs: Math.max(0, Number(e.target.value) * 1000) })} />
          </Field>
          {t.kind === 'GIFT' && (
            <Switch checked={rule.scaleWithQuantity} onChange={(v) => onChange({ ...rule, scaleWithQuantity: v })} label="Repetir pela quantidade" description="10 presentes = ação aplicada 10 vezes (até o limite)." />
          )}
          <Field label="Máximo de repetições por evento" htmlFor={`${id}-max`}>
            <Input id={`${id}-max`} type="number" min={1} max={1000} value={rule.maxQuantity} onChange={(e) => onChange({ ...rule, maxQuantity: Math.max(1, Number(e.target.value)) })} />
          </Field>
        </div>
      )}
    </li>
  );
}

export default function ConfigEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const canEdit = hasPerm(user, 'game:configure');
  const cfg = useQuery({ queryKey: ['config', id], queryFn: () => api<GameConfig>(`/games/configs/${id}`) });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<CatalogGame[]>('/games') });
  const [name, setName] = useState('');
  const [isPreset, setIsPreset] = useState(false);
  const [body, setBody] = useState<GameConfigBody | null>(null);
  const [tab, setTab] = useState<'rules' | 'settings' | 'look' | 'test'>('rules');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewBody, setPreviewBody] = useState<GameConfigBody | null>(null);

  useEffect(() => {
    if (cfg.data) {
      setName(cfg.data.name);
      setIsPreset(cfg.data.isPreset);
      setBody(cfg.data.body);
      setPreviewBody(cfg.data.body);
    }
  }, [cfg.data]);

  const game = useMemo(() => catalog.data?.find((g) => g.id === cfg.data?.gameId), [catalog.data, cfg.data]);
  const local = useLocalGame(tab === 'test' && game ? game.id : null, tab === 'test' ? previewBody : null);
  const dirty = !!cfg.data && !!body && (JSON.stringify(body) !== JSON.stringify(cfg.data.body) || name !== cfg.data.name || isPreset !== cfg.data.isPreset);

  if (cfg.isLoading || catalog.isLoading || !body) return <Skeleton className="h-96" />;
  if (!cfg.data || !game) return <Card><p className="text-sm text-slate-300">{errorMessage(cfg.error) || 'Configuração não encontrada.'}</p></Card>;

  async function save() {
    setSaving(true);
    setErrors([]);
    try {
      const r = await api<GameConfig>(`/games/configs/${id}`, { method: 'PUT', body: { name, isPreset, body } });
      qc.setQueryData(['config', id], r);
      void qc.invalidateQueries({ queryKey: ['configs'] });
      toast('Configuração salva. Sessões ativas com este jogo foram atualizadas.');
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) setErrors((err.details as Array<{ message: string }>).map((d) => d.message));
      toast(errorMessage(err), 'bad');
    } finally {
      setSaving(false);
    }
  }

  const commands = body.rules.flatMap((r) => (r.trigger.kind === 'CHAT_COMMAND' && r.enabled ? [r.trigger.command] : []));
  return (
    <div className="flex flex-col gap-5 pb-20">
      <div className="flex items-center gap-3">
        <Link href="/painel/jogos" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong text-slate-300 hover:bg-white/5" aria-label="Voltar para a Central de jogos">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-white sm:text-2xl">{game.emoji} {name || game.name}</h1>
          <p className="text-sm text-slate-400">{game.name} · versão {cfg.data.version}</p>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome da configuração" htmlFor="cfg-name">
            <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!canEdit} />
          </Field>
          <div className="flex flex-col justify-end gap-3">
            <Switch checked={isPreset} onChange={setIsPreset} label="Salvar como preset" description="Presets aparecem destacados para reutilizar em outras LIVES." disabled={!canEdit} />
          </div>
        </div>
      </Card>

      {errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-red-200">
          <ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={(v) => {
          if (v === 'test') setPreviewBody(body);
          setTab(v);
        }}
        items={[
          { value: 'rules', label: `Presentes, curtidas e comandos (${body.rules.length})` },
          { value: 'settings', label: 'Regras do jogo' },
          { value: 'look', label: 'Aparência' },
          { value: 'test', label: 'Testar' },
        ]}
      />

      {tab === 'rules' && (
        <Card title="Regras de interação" subtitle="Defina o que cada presente, meta de curtidas ou comando faz no jogo.">
          <ul className="flex flex-col gap-2">
            {body.rules.map((r, i) => (
              <RuleEditor
                key={r.id}
                index={i}
                rule={r}
                actions={game.actions}
                onChange={(nr) => setBody({ ...body, rules: body.rules.map((x, j) => (j === i ? nr : x)) })}
                onRemove={() => setBody({ ...body, rules: body.rules.filter((_, j) => j !== i) })}
              />
            ))}
          </ul>
          {canEdit && (
            <Button
              className="mt-3"
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={() =>
                setBody({
                  ...body,
                  rules: [
                    ...body.rules,
                    { id: `r-${Date.now().toString(36)}`, enabled: true, trigger: { kind: 'GIFT' }, action: game.actions[0]!.id, params: {}, cooldownMs: 0, perUserCooldownMs: 0, maxPerMinute: 0, scaleWithQuantity: true, maxQuantity: 50 },
                  ],
                })
              }
            >
              Adicionar regra
            </Button>
          )}
        </Card>
      )}

      {tab === 'settings' && (
        <Card title="Regras do jogo" subtitle="Velocidade, dificuldade e outras opções específicas deste jogo.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {game.settings.map((s) => (
              <ParamInput key={s.key} id={`set-${s.key}`} def={s} value={body.settings[s.key]} onChange={(v) => setBody({ ...body, settings: { ...body.settings, [s.key]: v } })} />
            ))}
            <Switch checked={body.autoMode} onChange={(v) => setBody({ ...body, autoMode: v })} label="Modo automático" description="Nova rodada começa sozinha após o intervalo." />
          </div>
        </Card>
      )}

      {tab === 'look' && (
        <Card title="Aparência" subtitle="Formato do vídeo, cores e sons.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Formato do vídeo" htmlFor="aspect">
              <Select id="aspect" value={body.aspect} onChange={(e) => setBody({ ...body, aspect: e.target.value as 'vertical' | 'horizontal' })}>
                <option value="vertical">Vertical 9:16 (TikTok, celular)</option>
                <option value="horizontal">Horizontal 16:9</option>
              </Select>
            </Field>
            <Switch checked={body.soundEnabled} onChange={(v) => setBody({ ...body, soundEnabled: v })} label="Efeitos sonoros" description="Sons sintetizados no overlay." />
            {(['primary', 'secondary', 'background'] as const).map((k) => (
              <Field key={k} label={k === 'primary' ? 'Cor principal' : k === 'secondary' ? 'Cor secundária' : 'Cor de fundo'} htmlFor={`c-${k}`}>
                <div className="flex gap-2">
                  <input id={`c-${k}`} type="color" value={body.theme[k]} onChange={(e) => setBody({ ...body, theme: { ...body.theme, [k]: e.target.value } })} className="h-11 w-14 cursor-pointer rounded-lg border border-line-strong bg-transparent" />
                  <Input value={body.theme[k]} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setBody({ ...body, theme: { ...body.theme, [k]: e.target.value } })} aria-label="Código da cor" />
                </div>
              </Field>
            ))}
          </div>
        </Card>
      )}

      {tab === 'test' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card title="Pré-visualização local" subtitle="Roda no seu navegador com as regras desta tela (mesmo sem salvar). Dados 100% simulados.">
            <div className={previewBody?.aspect === 'horizontal' ? 'aspect-video w-full overflow-hidden rounded-xl bg-black' : 'mx-auto aspect-[9/16] w-full max-w-[400px] overflow-hidden rounded-xl bg-black'}>
              <GameCanvas key={previewBody?.aspect} onReady={local.attach} sound={body.soundEnabled} />
            </div>
          </Card>
          <Card title="Disparar eventos de teste">
            <DemoControls onFire={local.fire} onControl={local.control} commands={commands} />
            <Button className="mt-4 w-full" variant="ghost" size="sm" onClick={() => setPreviewBody({ ...body })}>Aplicar alterações na pré-visualização</Button>
          </Card>
        </div>
      )}

      {canEdit && (
        <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 border-t border-line bg-ink-950/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-[76px] lg:left-64">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
            {dirty && <span className="mr-auto text-sm text-amber-300">Alterações não salvas</span>}
            <Button
              variant="ghost"
              icon={<RotateCcw className="size-4" />}
              onClick={async () => {
                if (!(await confirmAction({ title: 'Restaurar padrões', message: 'Todas as regras e opções voltarão aos valores padrão do jogo.', confirmLabel: 'Restaurar' }))) return;
                const r = await api<GameConfig>(`/games/configs/${id}/restore-defaults`, { method: 'POST' }).catch((e: unknown) => {
                  toast(errorMessage(e), 'bad');
                  return null;
                });
                if (r) {
                  qc.setQueryData(['config', id], r);
                  toast('Padrões restaurados.');
                }
              }}
            >
              Restaurar padrões
            </Button>
            <Button
              variant="secondary"
              icon={<Copy className="size-4" />}
              onClick={async () => {
                await api(`/games/configs/${id}/duplicate`, { method: 'POST' }).then(() => toast('Cópia criada na Central de jogos.')).catch((e: unknown) => toast(errorMessage(e), 'bad'));
                void qc.invalidateQueries({ queryKey: ['configs'] });
              }}
            >
              Duplicar
            </Button>
            <Button icon={<Save className="size-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
