'use client';
import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Select, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { EVENT_LABELS } from '@/lib/format';
import type { Session } from '@/lib/types';

interface EventRow {
  id: string;
  type: string;
  viewerName: string | null;
  payload: Record<string, unknown>;
  simulated: boolean;
  status: string;
  actions: number;
  occurredAt: string;
}

function detail(e: EventRow): string {
  const p = e.payload;
  if (e.type === 'GIFT') return `${String(p.giftName ?? p.giftId)} x${String(p.repeatCount ?? 1)}${p.diamondValue ? ` · ${String(p.diamondValue)}💎` : ''}`;
  if (e.type === 'LIKE') return `${String(p.count)} curtidas`;
  if (e.type === 'CHAT') return String(p.comment ?? '');
  return '';
}

export default function EventsPage() {
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/sessions') });
  const [sessionId, setSessionId] = useState('');
  const [type, setType] = useState('');
  useEffect(() => {
    if (!sessionId && sessions.data?.[0]) setSessionId(sessions.data[0].id);
  }, [sessions.data, sessionId]);
  const events = useInfiniteQuery({
    queryKey: ['events', sessionId, type],
    enabled: !!sessionId,
    initialPageParam: '',
    queryFn: ({ pageParam }) => api<{ items: EventRow[]; nextCursor: string | null }>(`/sessions/${sessionId}/events?limit=50${type ? `&type=${type}` : ''}${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = events.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageHeader title="Eventos" description="Histórico de eventos registrados (presentes, seguidores, comandos e lotes de curtidas). A retenção segue a configuração do seu espaço." />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="LIVE" htmlFor="ev-session">
            <Select id="ev-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {(sessions.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Tipo" htmlFor="ev-type">
            <Select id="ev-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos</option>
              {['GIFT', 'LIKE', 'CHAT', 'FOLLOW', 'SHARE', 'SUBSCRIPTION', 'STREAM_START', 'STREAM_END'].map((t) => <option key={t} value={t}>{EVENT_LABELS[t]}</option>)}
            </Select>
          </Field>
        </div>
        {events.isLoading ? (
          <Skeleton className="h-60" />
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum evento registrado" />
        ) : (
          <>
            <ul className="divide-y divide-white/5">
              {rows.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-36 shrink-0 text-xs text-slate-500">{new Date(e.occurredAt).toLocaleString('pt-BR')}</span>
                  <span className="w-32 shrink-0 text-sm font-medium text-slate-300">{EVENT_LABELS[e.type] ?? e.type}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    <strong>{e.viewerName ?? '—'}</strong> {detail(e)}
                  </span>
                  <span className="flex gap-1">
                    {e.actions > 0 && <Badge tone="ok">{e.actions} ação</Badge>}
                    {e.simulated && <Badge tone="warn">simulado</Badge>}
                  </span>
                </li>
              ))}
            </ul>
            {events.hasNextPage && (
              <Button variant="secondary" className="mt-4 w-full" loading={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()}>Carregar mais</Button>
            )}
          </>
        )}
      </Card>
    </>
  );
}
