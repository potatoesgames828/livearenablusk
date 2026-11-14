'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '@live-arena/shared';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

interface Item {
  id: string; gameId: string; gameName: string; round: number; startedAt: string; endedAt: string | null; winnerName: string | null;
  summary: Record<string, unknown>; session: { id: string; name: string; demo: boolean };
}

function duration(a: string, b: string | null): string {
  if (!b) return 'em andamento';
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`;
}

export default function HistoryPage() {
  const [gameId, setGameId] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['history', gameId, page],
    queryFn: () => api<{ total: number; page: number; pageSize: number; items: Item[] }>(`/account/history?page=${page}${gameId ? `&gameId=${gameId}` : ''}`),
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <>
      <PageHeader title="Histórico de partidas" description="Cada rodada ou partida jogada nas suas LIVES, com vencedor e duração. Partidas de demonstração aparecem marcadas." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select aria-label="Filtrar por jogo" value={gameId} onChange={(e) => { setGameId(e.target.value); setPage(1); }} className="max-w-xs">
          <option value="">Todos os jogos</option>
          {GAME_CATALOG.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        {q.data && <span className="text-sm text-slate-400">{q.data.total.toLocaleString('pt-BR')} partidas</span>}
      </div>
      {q.isLoading ? <Skeleton className="h-64" /> : q.isError ? (
        <EmptyState title="Não foi possível carregar" description={errorMessage(q.error)} action={<Button onClick={() => void q.refetch()}>Tentar de novo</Button>} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState icon={<History className="size-6" />} title="Nenhuma partida registrada" description="As partidas aparecem aqui quando uma LIVE (real ou de demonstração) termina rodadas." />
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-white/5">
            {q.data!.items.map((it) => (
              <li key={it.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-100">{it.gameName} <span className="text-slate-500">· rodada {it.round}</span> {it.session.demo && <Badge tone="warn">demonstração</Badge>}</p>
                  <p className="truncate text-xs text-slate-400">{it.session.name} · {new Date(it.startedAt).toLocaleString('pt-BR')} · {duration(it.startedAt, it.endedAt)}</p>
                </div>
                <p className="flex items-center gap-1.5 text-sm text-slate-200">
                  <Trophy className="size-4 text-amber-400" aria-hidden />
                  {it.winnerName ?? (typeof it.summary.winnerTeam === 'string' ? it.summary.winnerTeam : 'Sem vencedor')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span className="text-sm text-slate-400">Página {page} de {pages}</span>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </>
  );
}
