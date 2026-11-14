'use client';
import Link from 'next/link';
import { use, useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, Pause, Square, RotateCcw, Eraser, Megaphone, Repeat, Volume2, VolumeX, Wifi, WifiOff, Gift, Heart, UserPlus, Share2, MessageCircle, Eye } from 'lucide-react';
import type { BaseSnapshot } from '@live-arena/game-engine';
import { Badge, Button, Card, Field, Input, Modal, Select, Skeleton, Stat, Tabs, confirmAction, toast } from '@/components/ui';
import { GameCanvas, type GameCanvasHandle } from '@/components/game-canvas';
import { StatusBoard } from '@/components/session/status-board';
import { LiveFeed } from '@/components/session/live-feed';
import { SimulatorPanel } from '@/components/session/simulator-panel';
import { OutputPanel } from '@/components/session/output-panel';
import { api, errorMessage, hasPerm, useAuth } from '@/lib/api';
import { compact, timeAgo } from '@/lib/format';
import { useSessionRealtime, type FeedItem } from '@/lib/realtime';
import type { CatalogGame, GameConfig, Session } from '@/lib/types';

export default function SessionRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const canControl = hasPerm(user, 'session:control');
  const session = useQuery({ queryKey: ['session', id], queryFn: () => api<Session>(`/sessions/${id}`), refetchInterval: 10_000 });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<CatalogGame[]>('/games') });
  const configs = useQuery({ queryKey: ['configs'], queryFn: () => api<GameConfig[]>('/games/configs') });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [sound, setSound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [panel, setPanel] = useState<'feed' | 'sim' | 'output' | 'history'>('feed');
  const [aspect, setAspect] = useState<'vertical' | 'horizontal'>('vertical');
  const canvas = useRef<GameCanvasHandle | null>(null);
  const [lastSnap, setLastSnap] = useState<BaseSnapshot | null>(null);
  const snapCount = useRef(0);

  const patch = useCallback((p: Partial<Session> & { stats?: Record<string, number> }) => {
    qc.setQueryData<Session>(['session', id], (old) => {
      if (!old) return old;
      const { stats, ...rest } = p;
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<Session>;
      return { ...old, ...clean, counters: stats ? { ...old.counters, ...stats } : old.counters };
    });
  }, [qc, id]);

  const { connected } = useSessionRealtime<BaseSnapshot>(id, {
    onState: (s) => {
      canvas.current?.push(s);
      if (++snapCount.current % 15 === 0 || s.aspect !== aspect) {
        setLastSnap(s);
        setAspect(s.aspect);
      }
    },
    onStatus: (st) => {
      patch({ state: st.state, connectorState: st.connectorState, runnerState: st.runnerState, streamState: st.streamState, stats: st.stats });
      if (st.state) void qc.invalidateQueries({ queryKey: ['session', id] });
      if (st.message && (st.state || st.runnerState === 'RECOVERING' || st.connectorState === 'RECONNECTING')) toast(st.message, st.state === 'ERROR' ? 'bad' : 'info');
    },
    onEvent: (e) => setFeed((f) => [e, ...f].slice(0, 200)),
  });

  const game = useMemo(() => catalog.data?.find((g) => g.id === session.data?.gameConfig.gameId), [catalog.data, session.data]);
  const commands = useMemo(() => {
    const cfg = configs.data?.find((c) => c.id === session.data?.gameConfigId);
    return (cfg?.body.rules ?? []).flatMap((r) => (r.trigger.kind === 'CHAT_COMMAND' && r.enabled ? [r.trigger.command] : []));
  }, [configs.data, session.data]);

  if (session.isLoading) return <Skeleton className="h-96" />;
  if (session.error || !session.data) return <Card><p className="text-sm text-slate-300">{errorMessage(session.error)}</p></Card>;
  const s = session.data;
  const active = !['IDLE', 'STOPPED', 'ERROR'].includes(s.state);

  async function lifecycle(action: 'start' | 'pause' | 'resume' | 'stop') {
    if (action === 'stop' && !(await confirmAction({ title: 'Encerrar sessão', message: 'O jogo será encerrado e a fonte de eventos desconectada. A pontuação fica salva no ranking.', confirmLabel: 'Encerrar sessão' }))) return;
    setBusy(action);
    try {
      const r = await api<Session>(`/sessions/${id}/${action}`, { method: 'POST' });
      qc.setQueryData(['session', id], r);
      if (action === 'start') setFeed([]);
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setBusy(null);
    }
  }

  async function control(command: string, args?: Record<string, unknown>, label?: string) {
    if (command === 'RESET_SCORES' && !(await confirmAction({ title: 'Zerar pontuação', message: 'A pontuação dos espectadores nesta rodada será zerada (o histórico do ranking é mantido).', confirmLabel: 'Zerar' }))) return;
    setBusy(command);
    try {
      await api(`/sessions/${id}/control`, { method: 'POST', body: { command, args } });
      toast(label ?? 'Comando enviado ao jogo.', 'info');
      void qc.invalidateQueries({ queryKey: ['session', id] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setBusy(null);
    }
  }

  const c = s.counters;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/painel/lives" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong text-slate-300 hover:bg-white/5" aria-label="Voltar para Minhas LIVES">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-white sm:text-2xl">{s.name}</h1>
            <p className="truncate text-sm text-slate-400">
              {game ? `${game.emoji} ${game.name}` : s.gameConfig.gameId} · {s.gameConfig.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.demo && <Badge tone="warn">Modo demonstração</Badge>}
          <Badge tone={connected ? 'ok' : 'warn'}>
            <span className="inline-flex items-center gap-1">{connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />} {connected ? 'Tempo real' : 'Reconectando'}</span>
          </Badge>
        </div>
      </div>

      {s.lastError && s.state === 'ERROR' && (
        <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-red-200">
          <strong>Problema:</strong> {s.lastError} Você pode tentar iniciar novamente.
        </div>
      )}

      <StatusBoard session={s} />

      {/* Painel de controle */}
      {canControl && (
        <Card>
          <div className="flex flex-wrap gap-2">
            {s.availableActions.includes('start') && <Button size="lg" variant="success" icon={<Play className="size-5" />} loading={busy === 'start'} onClick={() => void lifecycle('start')}>Iniciar</Button>}
            {s.availableActions.includes('pause') && <Button size="lg" variant="secondary" icon={<Pause className="size-5" />} loading={busy === 'pause'} onClick={() => void lifecycle('pause')}>Pausar</Button>}
            {s.availableActions.includes('resume') && <Button size="lg" icon={<Play className="size-5" />} loading={busy === 'resume'} onClick={() => void lifecycle('resume')}>Retomar</Button>}
            {active && (
              <>
                <Button variant="secondary" icon={<RotateCcw className="size-4" />} loading={busy === 'RESET_ROUND'} onClick={() => void control('RESET_ROUND', undefined, 'Rodada reiniciada.')}>Reiniciar rodada</Button>
                <Button variant="secondary" icon={<Eraser className="size-4" />} loading={busy === 'RESET_SCORES'} onClick={() => void control('RESET_SCORES', undefined, 'Pontuação zerada.')}>Zerar pontos</Button>
              </>
            )}
            <Button variant="secondary" icon={<Repeat className="size-4" />} onClick={() => setSwitchOpen(true)}>Trocar jogo</Button>
            {s.availableActions.includes('stop') && <Button size="lg" variant="danger" icon={<Square className="size-5" />} loading={busy === 'stop'} onClick={() => void lifecycle('stop')} className="sm:ml-auto">Encerrar</Button>}
          </div>
          {active && (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!announce.trim()) return;
                void control('ANNOUNCE', { text: announce.trim() }, 'Anúncio exibido no jogo.');
                setAnnounce('');
              }}
            >
              <Input value={announce} onChange={(e) => setAnnounce(e.target.value)} placeholder="Anúncio rápido no overlay (ex.: Meta: 10 mil curtidas!)" maxLength={120} aria-label="Texto do anúncio" />
              <Button type="submit" variant="secondary" icon={<Megaphone className="size-4" />} loading={busy === 'ANNOUNCE'}>
                <span className="hidden sm:inline">Anunciar</span>
              </Button>
            </form>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Pré-visualização do jogo (mesma imagem que vai para a transmissão) */}
        <Card
          title="Jogo ao vivo"
          subtitle={lastSnap ? `Rodada ${lastSnap.round} · proporção ${aspect === 'vertical' ? '9:16' : '16:9'}` : 'Inicie a sessão para ver o jogo'}
          action={
            <Button variant="ghost" size="sm" onClick={() => setSound((v) => !v)} aria-pressed={sound} icon={sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}>
              <span className="hidden sm:inline">{sound ? 'Som ligado' : 'Som desligado'}</span>
            </Button>
          }
        >
          <div className={aspect === 'vertical' ? 'mx-auto aspect-[9/16] w-full max-w-[420px] overflow-hidden rounded-xl bg-black' : 'aspect-video w-full overflow-hidden rounded-xl bg-black'}>
            <GameCanvas onReady={(h) => (canvas.current = h)} sound={sound} />
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Curtidas" value={compact(c.likes)} icon={<Heart className="size-4" />} />
            <Stat label="Presentes" value={compact(c.gifts)} hint={c.diamonds ? `${compact(c.diamonds)} 💎` : undefined} icon={<Gift className="size-4" />} />
            <Stat label="Seguidores" value={compact(c.follows)} icon={<UserPlus className="size-4" />} />
            <Stat label="Compart." value={compact(c.shares)} icon={<Share2 className="size-4" />} />
            <Stat label="Comentários" value={compact(c.comments)} icon={<MessageCircle className="size-4" />} />
            <Stat label="Espectadores" value={c.viewers !== undefined ? compact(c.viewers) : '—'} hint={c.viewers === undefined ? 'quando a fonte informar' : undefined} icon={<Eye className="size-4" />} />
          </div>
          <Card>
            <Tabs
              value={panel}
              onChange={setPanel}
              items={[
                { value: 'feed', label: 'Eventos ao vivo' },
                { value: 'sim', label: 'Simulador' },
                { value: 'output', label: 'Saída de vídeo' },
                { value: 'history', label: 'Histórico' },
              ]}
            />
            {panel === 'feed' && <LiveFeed items={feed} />}
            {panel === 'sim' && <SimulatorPanel sessionId={id} commands={commands} disabled={!active} />}
            {panel === 'output' && <OutputPanel session={s} aspectVertical={aspect === 'vertical'} onChanged={() => void qc.invalidateQueries({ queryKey: ['session', id] })} />}
            {panel === 'history' && <History sessionId={id} />}
          </Card>
        </div>
      </div>

      <Modal
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        title="Trocar jogo"
        footer={<Button variant="secondary" onClick={() => setSwitchOpen(false)}>Fechar</Button>}
      >
        <SwitchGame
          configs={configs.data ?? []}
          catalog={catalog.data ?? []}
          current={s.gameConfigId}
          onPick={async (cfgId) => {
            setSwitchOpen(false);
            if (active) await control('SWITCH_GAME', { gameConfigId: cfgId }, 'Jogo trocado.');
            else {
              await api(`/sessions/${id}`, { method: 'PUT', body: { gameConfigId: cfgId } }).catch((e: unknown) => toast(errorMessage(e), 'bad'));
              void qc.invalidateQueries({ queryKey: ['session', id] });
            }
          }}
        />
      </Modal>
    </div>
  );
}

function SwitchGame({ configs, catalog, current, onPick }: { configs: GameConfig[]; catalog: CatalogGame[]; current: string; onPick: (id: string) => void }) {
  const [sel, setSel] = useState(current);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Configuração de jogo" htmlFor="switch-cfg" hint="Crie novas configurações na Central de jogos.">
        <Select id="switch-cfg" value={sel} onChange={(e) => setSel(e.target.value)}>
          {configs.map((c) => (
            <option key={c.id} value={c.id}>
              {catalog.find((g) => g.id === c.gameId)?.emoji} {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button disabled={sel === current} onClick={() => onPick(sel)}>
        Trocar agora
      </Button>
    </div>
  );
}

function History({ sessionId }: { sessionId: string }) {
  const [tab, setTab] = useState<'rounds' | 'transitions'>('rounds');
  const rounds = useQuery({ queryKey: ['rounds', sessionId], queryFn: () => api<Array<{ id: string; round: number; gameId: string; startedAt: string; endedAt: string | null; winnerName: string | null; summary: Record<string, unknown> }>>(`/sessions/${sessionId}/rounds`), refetchInterval: 15_000 });
  const transitions = useQuery({ queryKey: ['transitions', sessionId], queryFn: () => api<Array<{ id: string; fromState: string; toState: string; reason: string | null; createdAt: string }>>(`/sessions/${sessionId}/transitions`), enabled: tab === 'transitions' });
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant={tab === 'rounds' ? 'primary' : 'ghost'} onClick={() => setTab('rounds')}>Rodadas</Button>
        <Button size="sm" variant={tab === 'transitions' ? 'primary' : 'ghost'} onClick={() => setTab('transitions')}>Mudanças de estado</Button>
      </div>
      <ul className="scrollbar-thin flex max-h-96 flex-col gap-1.5 overflow-y-auto text-sm">
        {tab === 'rounds' &&
          (rounds.data ?? []).map((r) => (
            <li key={r.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="font-semibold text-slate-200">Rodada {r.round}</span> <span className="text-slate-500">· {r.gameId}</span>
              <span className="block text-xs text-slate-400">{r.endedAt ? (r.winnerName ? `🏆 ${r.winnerName}` : 'Sem vencedor') : 'Em andamento'} · {timeAgo(r.startedAt)}</span>
            </li>
          ))}
        {tab === 'transitions' &&
          (transitions.data ?? []).map((t) => (
            <li key={t.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="font-mono text-xs text-slate-300">{t.fromState} → {t.toState}</span>
              <span className="block text-xs text-slate-400">{t.reason ?? '—'} · {new Date(t.createdAt).toLocaleTimeString('pt-BR')}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
