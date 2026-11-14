'use client';
import { useQuery } from '@tanstack/react-query';
import { Check, CreditCard, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

interface Usage {
  plan: { code: string; name: string };
  usage: Array<{ key: string; label: string; used: number; limit: number }>;
  features: { streamOutput: boolean; liveConnector: boolean; allowedGames: string[]; maxSessionMinutes: number; statsRetentionDays: number };
  plans: Array<{ code: string; name: string; limits: Record<string, unknown> }>;
  billing: { available: boolean; message: string };
}

export default function SubscriptionPage() {
  const q = useQuery({ queryKey: ['usage'], queryFn: () => api<Usage>('/account/usage') });
  if (q.isLoading) return <><PageHeader title="Assinatura" /><Skeleton className="h-64" /></>;
  if (q.isError) return <><PageHeader title="Assinatura" /><EmptyState title="Não foi possível carregar" description={errorMessage(q.error)} action={<Button onClick={() => void q.refetch()}>Tentar de novo</Button>} /></>;
  const d = q.data!;
  return (
    <>
      <PageHeader title="Assinatura" description="Seu plano, o uso atual e os limites. Os limites são verificados no servidor." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card title={<span className="flex items-center gap-2">Plano atual <Badge tone="info">{d.plan.name}</Badge></span>}>
          <ul className="space-y-4">
            {d.usage.map((u) => {
              const pct = u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 100;
              return (
                <li key={u.key}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-slate-300">{u.label}</span><span className="font-semibold text-white">{u.used} / {u.limit}</span></div>
                  <div className="h-2 rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={u.label}>
                    <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-400' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <ul className="mt-5 space-y-1.5 text-sm text-slate-300">
            <li className="flex items-center gap-2">{d.features.liveConnector ? <Check className="size-4 text-emerald-400" /> : <X className="size-4 text-slate-500" />} Conexão com a LIVE</li>
            <li className="flex items-center gap-2">{d.features.streamOutput ? <Check className="size-4 text-emerald-400" /> : <X className="size-4 text-slate-500" />} Vídeo gerado pelo servidor (RTMP/gravação)</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-emerald-400" /> LIVES de até {d.features.maxSessionMinutes} min</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-emerald-400" /> Estatísticas guardadas por {d.features.statsRetentionDays} dias</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-emerald-400" /> Jogos: {d.features.allowedGames.includes('*') ? 'todos' : `${d.features.allowedGames.length} liberados`}</li>
          </ul>
        </Card>
        <Card title="Planos" subtitle="Comparativo dos limites de cada plano.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {d.plans.map((p) => {
              const l = p.limits as Record<string, number | boolean | string[]>;
              const current = p.code === d.plan.code;
              return (
                <div key={p.code} className={`rounded-xl border p-3 ${current ? 'border-violet-400 bg-violet-500/10' : 'border-line'}`}>
                  <p className="font-semibold text-white">{p.name} {current && <Badge tone="info">atual</Badge>}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-300">
                    <li>{String(l.maxConcurrentSessions)} LIVE(s) ao mesmo tempo</li>
                    <li>{Array.isArray(l.allowedGames) && l.allowedGames.includes('*') ? 'Todos os jogos' : `${Array.isArray(l.allowedGames) ? l.allowedGames.length : 0} jogos`}</li>
                    <li>{String(l.maxGameConfigs)} configurações · {String(l.maxAutomations)} automações</li>
                    <li>{String(l.maxSounds ?? 10)} sons · {String(l.maxAlerts ?? 10)} alertas</li>
                    <li>{l.streamOutput ? 'Com' : 'Sem'} vídeo pelo servidor</li>
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{d.billing.message}</p>
          </div>
        </Card>
      </div>
    </>
  );
}
