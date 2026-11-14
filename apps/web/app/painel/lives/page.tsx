'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Radio, Trash2, ChevronRight } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusPill, Switch, confirmAction, toast } from '@/components/ui';
import { api, errorMessage, hasPerm, useAuth } from '@/lib/api';
import { compact, labelSession, sessionTone, timeAgo } from '@/lib/format';
import type { Connection, GameConfig, Session, StreamConfig } from '@/lib/types';

export default function LivesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/sessions'), refetchInterval: 5000 });
  const configs = useQuery({ queryKey: ['configs'], queryFn: () => api<GameConfig[]>('/games/configs') });
  const connections = useQuery({ queryKey: ['connections'], queryFn: () => api<Connection[]>('/connections') });
  const streams = useQuery({ queryKey: ['streams'], queryFn: () => api<StreamConfig[]>('/streams') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', gameConfigId: '', connectionId: '', streamConfigId: '', autoMode: true });
  const [saving, setSaving] = useState(false);
  // Se o diálogo abrir antes da lista de configurações carregar, seleciona a primeira assim que chegar.
  useEffect(() => {
    if (open && !form.gameConfigId && configs.data?.length) setForm((f) => ({ ...f, gameConfigId: configs.data![0]!.id }));
  }, [open, form.gameConfigId, configs.data]);

  async function create() {
    setSaving(true);
    try {
      const s = await api<Session>('/sessions', {
        method: 'POST',
        body: { name: form.name || 'Minha LIVE', gameConfigId: form.gameConfigId, connectionId: form.connectionId || null, streamConfigId: form.streamConfigId || null, autoMode: form.autoMode },
      });
      toast('LIVE criada! Agora é só iniciar.');
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      router.push(`/painel/lives/${s.id}`);
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Session) {
    if (!(await confirmAction({ title: 'Excluir LIVE', message: `"${s.name}" e seu histórico de eventos serão excluídos. Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir' }))) return;
    try {
      await api(`/sessions/${s.id}`, { method: 'DELETE' });
      toast('LIVE excluída.');
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    }
  }

  const noConfigs = configs.data && configs.data.length === 0;
  return (
    <>
      <PageHeader
        title="Minhas LIVES"
        description="Cada LIVE reúne um jogo, uma fonte de eventos (TikTok ou simulador) e, opcionalmente, uma saída de vídeo."
        actions={
          hasPerm(user, 'session:manage') && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setForm((f) => ({ ...f, gameConfigId: configs.data?.[0]?.id ?? '' }));
                setOpen(true);
              }}
              disabled={noConfigs}
            >
              Nova LIVE
            </Button>
          )
        }
      />
      {noConfigs && (
        <Card className="mb-4">
          <p className="text-sm text-slate-300">
            Primeiro escolha um jogo na <Link href="/painel/jogos" className="font-semibold text-blue-300 underline">Central de jogos</Link>.
          </p>
        </Card>
      )}
      {sessions.isLoading ? (
        <Skeleton className="h-40" />
      ) : (sessions.data ?? []).length === 0 ? (
        <EmptyState icon={<Radio className="size-8" />} title="Nenhuma LIVE criada" description="Crie uma LIVE para começar. Você pode testar tudo com o simulador antes de entrar ao vivo." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sessions.data!.map((s) => (
            <li key={s.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/painel/lives/${s.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white hover:text-blue-200">{s.name}</p>
                  <p className="truncate text-sm text-slate-400">{s.gameConfig.name}</p>
                </Link>
                {s.demo && <Badge tone="warn">Demo</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={sessionTone(s.state)} pulse={s.state === 'RUNNING'}>{labelSession(s.state)}</StatusPill>
                <span className="text-xs text-slate-500">{s.startedAt ? `iniciada ${timeAgo(s.startedAt)}` : 'nunca iniciada'}</span>
              </div>
              <p className="text-xs text-slate-400">
                {s.connection ? `${s.connection.label}${s.connection.tiktokUsername ? ` · @${s.connection.tiktokUsername}` : ''}` : 'Sem fonte de eventos (simulador manual)'} · {compact(s.counters.gifts)} presentes · {compact(s.counters.likes)} curtidas
              </p>
              <div className="mt-auto flex gap-2">
                <Link href={`/painel/lives/${s.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-soft px-3 text-sm font-semibold text-blue-100 hover:bg-brand/25">
                  Abrir sala de controle <ChevronRight className="size-4" aria-hidden />
                </Link>
                {hasPerm(user, 'session:manage') && (
                  <Button variant="ghost" aria-label={`Excluir ${s.name}`} onClick={() => void remove(s)} icon={<Trash2 className="size-4" />} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova LIVE"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => void create()} loading={saving} disabled={!form.gameConfigId}>Criar LIVE</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nome" htmlFor="l-name">
            <Input id="l-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: LIVE de sexta" maxLength={80} />
          </Field>
          <Field label="Jogo" htmlFor="l-game">
            <Select id="l-game" value={form.gameConfigId} onChange={(e) => setForm({ ...form, gameConfigId: e.target.value })}>
              {(configs.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fonte de eventos" htmlFor="l-conn" hint="Sem fonte, os eventos vêm apenas do simulador. Cadastre conexões em Configurações → Conexões.">
            <Select id="l-conn" value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value })}>
              <option value="">Nenhuma — apenas simulador manual</option>
              {(connections.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.label} ({c.provider === 'SIMULATOR' ? 'simulador automático' : `@${c.tiktokUsername}`})</option>
              ))}
            </Select>
          </Field>
          <Field label="Saída de vídeo do servidor (opcional)" htmlFor="l-stream" hint="A forma mais comum é usar o link de overlay no OBS — não precisa configurar nada aqui.">
            <Select id="l-stream" value={form.streamConfigId} onChange={(e) => setForm({ ...form, streamConfigId: e.target.value })}>
              <option value="">Nenhuma — usarei OBS com o link de overlay</option>
              {(streams.data ?? []).filter((s) => s.mode !== 'OBS').map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.mode === 'RTMP' ? 'RTMP' : 'Gravação'})</option>
              ))}
            </Select>
          </Field>
          <Switch checked={form.autoMode} onChange={(v) => setForm({ ...form, autoMode: v })} label="Modo automático" description="Novas rodadas começam sozinhas após cada vitória." />
        </div>
      </Modal>
    </>
  );
}
