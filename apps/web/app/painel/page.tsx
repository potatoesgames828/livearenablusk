'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Radio, Gamepad2, Heart, Gift, UserPlus, Share2, Activity, ArrowRight, Users, Trophy, MonitorPlay, Bell, Music, AlertTriangle } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader, Skeleton, Stat, StatusPill } from '@/components/ui';
import { api, useAuth } from '@/lib/api';
import { compact, connectorTone, labelConnector, labelRunner, labelSession, labelStream, runnerTone, sessionTone, streamTone } from '@/lib/format';
import type { GameConfig, Session } from '@/lib/types';

interface Overview {
  sessions: number;
  activeSessions: number;
  rounds: number;
  viewers: number;
  events7d: Array<{ type: string; simulated: boolean; count: number }>;
}

export default function OverviewPage() {
  const user = useAuth((s) => s.user);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/sessions'), refetchInterval: 5000 });
  const configs = useQuery({ queryKey: ['configs'], queryFn: () => api<GameConfig[]>('/games/configs') });
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/stats/overview'), refetchInterval: 30_000 });
  const overlays = useQuery({ queryKey: ['overlays-all'], queryFn: () => api<Array<{ id: string }>>('/overlays') });
  const recent = useQuery({ queryKey: ['history', '', 'recent'], queryFn: () => api<{ items: Array<{ id: string; gameName: string; round: number; startedAt: string; winnerName: string | null; session: { demo: boolean } }> }>('/account/history?pageSize=5') });
  const usage = useQuery({ queryKey: ['usage'], queryFn: () => api<{ plan: { name: string }; usage: Array<{ key: string; label: string; used: number; limit: number }> }>('/account/usage') });
  const nearLimit = (usage.data?.usage ?? []).filter((u) => u.limit > 0 && u.used / u.limit >= 0.8);

  const active = (sessions.data ?? []).filter((s) => !['IDLE', 'STOPPED'].includes(s.state));
  const ev = overview.data?.events7d ?? [];
  const sum = (type: string, simulated?: boolean) => ev.filter((e) => e.type === type && (simulated === undefined || e.simulated === simulated)).reduce((a, b) => a + b.count, 0);
  const realEvents = ev.filter((e) => !e.simulated).reduce((a, b) => a + b.count, 0);
  const simEvents = ev.filter((e) => e.simulated).reduce((a, b) => a + b.count, 0);

  const steps = [
    { done: (configs.data?.length ?? 0) > 0, label: 'Escolha e configure um jogo', href: '/painel/jogos' },
    { done: (sessions.data?.length ?? 0) > 0, label: 'Crie sua primeira LIVE', href: '/painel/lives' },
    { done: (sessions.data ?? []).some((s) => s.startedAt), label: 'Inicie a sessão e teste com o simulador', href: '/painel/lives' },
    { done: (overlays.data?.length ?? 0) > 0, label: 'Gere o link de overlay e adicione no OBS', href: '/painel/overlays' },
  ];
  const onboarding = steps.some((s) => !s.done);

  return (
    <>
      <PageHeader title={`Olá, ${user?.name.split(' ')[0] ?? ''}!`} description="Acompanhe suas LIVES, o jogo ativo e os eventos do público." />

      {onboarding && (
        <Card className="mb-5" title="Primeiros passos" subtitle="Siga estes passos para colocar o jogo na sua LIVE.">
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link href={s.href} className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2 hover:border-brand/40">
                  {s.done ? <CheckCircle2 className="size-5 shrink-0 text-green-400" aria-label="Concluído" /> : <Circle className="size-5 shrink-0 text-slate-500" aria-label="Pendente" />}
                  <span className={s.done ? 'text-slate-400 line-through' : 'text-slate-200'}>
                    {i + 1}. {s.label}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <section aria-labelledby="ativas" className="mb-6">
        <h2 id="ativas" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Sessões ativas
        </h2>
        {sessions.isLoading ? (
          <Skeleton className="h-36" />
        ) : active.length === 0 ? (
          <EmptyState icon={<Radio className="size-8" />} title="Nenhuma LIVE em andamento" description="Crie ou inicie uma sessão para ver o estado em tempo real." action={<Link href="/painel/lives" className="min-h-11 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Ir para Minhas LIVES</Link>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {active.map((s) => (
              <Link key={s.id} href={`/painel/lives/${s.id}`} className="card group block p-4 transition hover:border-brand/40 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{s.name}</p>
                    <p className="truncate text-sm text-slate-400">
                      <Gamepad2 className="mr-1 inline size-4" aria-hidden />
                      {s.gameConfig.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.demo && <Badge tone="warn">Demo</Badge>}
                    <ArrowRight className="size-5 text-slate-500 group-hover:text-blue-300" aria-hidden />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill tone={sessionTone(s.state)} pulse={s.state === 'RUNNING'}>{labelSession(s.state)}</StatusPill>
                  <StatusPill tone={connectorTone(s.connectorState)}>{labelConnector(s.connectorState)}</StatusPill>
                  <StatusPill tone={runnerTone(s.runnerState)}>{labelRunner(s.runnerState)}</StatusPill>
                  <StatusPill tone={streamTone(s.streamState)}>{labelStream(s.streamState)}</StatusPill>
                </div>
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ['Curtidas', s.counters.likes],
                    ['Presentes', s.counters.gifts],
                    ['Seguid.', s.counters.follows],
                    ['Coment.', s.counters.comments],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-lg bg-white/[0.03] py-2">
                      <dt className="text-[11px] text-slate-400">{k}</dt>
                      <dd className="font-bold tabular-nums text-white">{compact(v as number)}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="atalhos" className="mb-6">
        <h2 id="atalhos" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Atalhos</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { href: '/painel/jogos', label: 'Biblioteca de jogos', icon: Gamepad2, desc: 'Escolher e testar jogos' },
            { href: '/painel/overlays', label: 'Overlay', icon: MonitorPlay, desc: 'Link único para o OBS' },
            { href: '/painel/alertas', label: 'Alertas', icon: Bell, desc: 'Mensagens na tela' },
            { href: '/painel/sons', label: 'Soundboard', icon: Music, desc: 'Sons dos jogos e alertas' },
          ].map(({ href, label, icon: Icon, desc }) => (
            <Link key={href} href={href} className="card flex min-h-20 items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-white/20">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300"><Icon className="size-5" aria-hidden /></span>
              <span className="min-w-0"><span className="block truncate font-semibold text-white">{label}</span><span className="block truncate text-xs text-slate-400">{desc}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Partidas recentes" action={<Link href="/painel/historico" className="text-sm text-blue-300 hover:underline">Ver histórico</Link>}>
          {recent.isLoading ? <Skeleton className="h-24" /> : (recent.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma partida ainda. Inicie uma LIVE de demonstração para testar.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {recent.data!.items.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-200">{r.gameName} · rodada {r.round} {r.session.demo && <Badge tone="warn">demo</Badge>}</span>
                  <span className="flex shrink-0 items-center gap-1 text-slate-300"><Trophy className="size-4 text-amber-400" aria-hidden />{r.winnerName ?? '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Avisos" subtitle={usage.data ? `Plano ${usage.data.plan.name}` : undefined} action={<Link href="/painel/assinatura" className="text-sm text-blue-300 hover:underline">Assinatura</Link>}>
          {nearLimit.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-slate-300"><CheckCircle2 className="size-4 text-green-400" aria-hidden /> Tudo certo: nenhum limite do plano perto de acabar.</p>
          ) : (
            <ul className="space-y-2">
              {nearLimit.map((u) => (
                <li key={u.key} className="flex items-center gap-2 text-sm text-amber-200"><AlertTriangle className="size-4 shrink-0" aria-hidden /> {u.label}: {u.used} de {u.limit}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section aria-labelledby="resumo">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="resumo" className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Últimos 7 dias
          </h2>
          {simEvents > 0 && <Badge tone="warn">{compact(simEvents)} eventos simulados não entram nos totais reais</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="Eventos reais" value={compact(realEvents)} icon={<Activity className="size-4" />} />
          <Stat label="Presentes" value={compact(sum('GIFT', false))} icon={<Gift className="size-4" />} />
          <Stat label="Lotes de curtidas" value={compact(sum('LIKE', false))} icon={<Heart className="size-4" />} />
          <Stat label="Seguidores" value={compact(sum('FOLLOW', false))} icon={<UserPlus className="size-4" />} />
          <Stat label="Compart." value={compact(sum('SHARE', false))} icon={<Share2 className="size-4" />} />
          <Stat label="Sessões" value={overview.data?.sessions ?? '—'} icon={<Radio className="size-4" />} />
          <Stat label="Rodadas" value={overview.data?.rounds ?? '—'} icon={<Trophy className="size-4" />} />
          <Stat label="Espectadores" value={compact(overview.data?.viewers)} hint="com participação" icon={<Users className="size-4" />} />
        </div>
      </section>
    </>
  );
}
