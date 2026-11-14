'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, PageHeader, Skeleton, Stat, Switch } from '@/components/ui';
import { api } from '@/lib/api';
import { EVENT_LABELS, compact } from '@/lib/format';

interface Overview {
  sessions: number;
  activeSessions: number;
  rounds: number;
  viewers: number;
  perDay: Array<{ day: string; type: string; simulated: boolean; count: number }>;
}

/** Barras verticais de uma série (total diário), com dica ao passar o mouse/tocar. */
function DailyBars({ data }: { data: Array<{ day: string; total: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.total));
  const W = 700;
  const H = 220;
  const pad = { l: 40, r: 8, t: 12, b: 28 };
  const bw = (W - pad.l - pad.r) / data.length;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Eventos reais por dia nos últimos 7 dias">
        {ticks.map((t) => {
          const y = pad.t + (H - pad.t - pad.b) * (1 - t / max);
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="rgba(148,163,184,0.15)" strokeWidth={1} />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize={11} fill="#94a3b8">{compact(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = ((H - pad.t - pad.b) * d.total) / max;
          const x = pad.l + i * bw + 1;
          const y = H - pad.b - h;
          const w = Math.max(2, bw - 2 - bw * 0.4);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && <path d={`M${x + bw * 0.2},${H - pad.b} V${y + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - pad.b} Z`} fill={hover === i ? '#60a5fa' : '#3b82f6'} />}
              <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#94a3b8">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line-strong bg-ink-850 px-3 py-2 text-xs shadow-lg" style={{ left: `${Math.min(80, ((hover + 0.5) / data.length) * 100)}%` }}>
          <p className="text-slate-400">{new Date(data[hover].day + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
          <p className="font-semibold text-slate-100">{data[hover].total.toLocaleString('pt-BR')} eventos</p>
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/stats/overview') });
  const [withSim, setWithSim] = useState(false);
  const { days, byType } = useMemo(() => {
    const rows = (q.data?.perDay ?? []).filter((r) => withSim || !r.simulated);
    const dayList: string[] = [];
    for (let i = 6; i >= 0; i--) dayList.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
    const days = dayList.map((day) => ({ day, total: rows.filter((r) => r.day === day).reduce((a, b) => a + b.count, 0) }));
    const byType = new Map<string, number>();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + r.count);
    return { days, byType: [...byType.entries()].sort((a, b) => b[1] - a[1]) };
  }, [q.data, withSim]);

  return (
    <>
      <PageHeader title="Estatísticas" description="Desempenho das suas LIVES. Por padrão mostramos apenas eventos reais — dados de simulação ficam separados." />
      {q.isLoading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Sessões" value={q.data?.sessions ?? 0} />
            <Stat label="Ativas agora" value={q.data?.activeSessions ?? 0} />
            <Stat label="Rodadas jogadas" value={q.data?.rounds ?? 0} />
            <Stat label="Espectadores participantes" value={compact(q.data?.viewers)} />
          </div>
          <Card title="Eventos por dia" subtitle={withSim ? 'Inclui eventos simulados' : 'Somente eventos reais'} action={<Switch checked={withSim} onChange={setWithSim} label="Incluir simulados" />}>
            {days.every((d) => d.total === 0) ? <EmptyState title="Sem eventos no período" description="Quando sua LIVE receber eventos, eles aparecem aqui." /> : <DailyBars data={days} />}
          </Card>
          <Card title="Por tipo de evento">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Total de eventos por tipo nos últimos 7 dias</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 text-right font-medium">Total (7 dias)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {byType.map(([type, n]) => (
                    <tr key={type}>
                      <td className="py-2 pr-4 text-slate-200">{EVENT_LABELS[type] ?? type}</td>
                      <td className="py-2 text-right tabular-nums text-slate-100">{n.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">Curtidas são registradas em lotes agregados (não uma linha por curtida). Entradas e contagem de espectadores ficam apenas nos contadores em tempo real.</p>
          </Card>
        </div>
      )}
    </>
  );
}
