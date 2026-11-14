'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Gift, Heart, MessageSquare, SlidersHorizontal, UserPlus } from 'lucide-react';
import type { RuleTrigger } from '@live-arena/shared';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { triggerSummary } from '@/components/trigger-editor';
import { api } from '@/lib/api';
import type { CatalogGame, GameConfig } from '@/lib/types';

function TriggerIcon({ t }: { t: RuleTrigger }) {
  const cls = 'size-4 shrink-0';
  if (t.kind === 'GIFT') return <Gift className={`${cls} text-pink-400`} aria-hidden />;
  if (t.kind === 'LIKE_THRESHOLD') return <Heart className={`${cls} text-rose-400`} aria-hidden />;
  if (t.kind === 'CHAT_COMMAND' || t.kind === 'CHAT_KEYWORD') return <MessageSquare className={`${cls} text-sky-400`} aria-hidden />;
  if (t.kind === 'FOLLOW' || t.kind === 'MEMBER') return <UserPlus className={`${cls} text-emerald-400`} aria-hidden />;
  return <SlidersHorizontal className={`${cls} text-slate-400`} aria-hidden />;
}

/**
 * Visão geral do mapeamento de eventos: o que cada presente, curtida,
 * comentário e seguidor faz em cada configuração de jogo, mais os alertas.
 */
export default function MappingPage() {
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<CatalogGame[]>('/games') });
  const configs = useQuery({ queryKey: ['configs'], queryFn: () => api<GameConfig[]>('/games/configs') });
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api<Array<{ id: string; name: string; enabled: boolean; trigger: RuleTrigger; message: string }>>('/alerts') });
  return (
    <>
      <PageHeader title="Configuração de eventos" description="O que cada presente, curtida, comentário e seguidor faz. As regras ficam em cada configuração de jogo; os alertas valem para todos os jogos." />
      <Card className="mb-5">
        <ol className="grid grid-cols-1 gap-3 text-sm text-slate-300 md:grid-cols-4">
          <li><strong className="text-white">1. Evento</strong><br />Presente, curtida, comentário, seguidor, compartilhamento ou meta.</li>
          <li><strong className="text-white">2. Validação</strong><br />Duplicados são descartados; sequências de presentes contam só as unidades novas.</li>
          <li><strong className="text-white">3. Regra</strong><br />Gatilho + limites (intervalo, por pessoa, por minuto).</li>
          <li><strong className="text-white">4. Ação</strong><br />O jogo ativo recebe a ação; o overlay mostra os alertas.</li>
        </ol>
      </Card>
      {configs.isLoading || catalog.isLoading ? <Skeleton className="h-64" /> : (configs.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma configuração de jogo" description="Escolha um jogo na biblioteca para criar uma configuração com regras prontas." action={<Link href="/painel/jogos" className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 font-semibold text-white hover:bg-blue-500">Abrir biblioteca</Link>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {configs.data!.map((c) => {
            const g = catalog.data?.find((x) => x.id === c.gameId);
            return (
              <Card key={c.id} title={<span className="flex items-center gap-2"><span aria-hidden>{g?.emoji}</span>{c.name}</span>} subtitle={g?.name}
                action={<Link href={`/painel/jogos/${c.id}`} className="inline-flex min-h-9 items-center gap-1 rounded-xl px-3 text-sm text-blue-300 hover:bg-white/5">Editar <ArrowRight className="size-4" aria-hidden /></Link>}>
                {c.body.rules.length === 0 ? <p className="text-sm text-slate-400">Sem regras: só o ranking por participação.</p> : (
                  <ul className="space-y-1.5">
                    {c.body.rules.map((r) => {
                      const action = g?.actions.find((a) => a.id === r.action);
                      return (
                        <li key={r.id} className={`flex items-center gap-2 text-sm ${r.enabled ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                          <TriggerIcon t={r.trigger} />
                          <span className="min-w-0 flex-1 truncate">{triggerSummary(r.trigger)}</span>
                          <ArrowRight className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                          <span className="min-w-0 truncate font-medium">{action?.label ?? r.action}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <div className="mt-4">
        <Card title={<span className="flex items-center gap-2"><Bell className="size-4" aria-hidden /> Alertas (todos os jogos)</span>} action={<Link href="/painel/alertas" className="inline-flex min-h-9 items-center gap-1 rounded-xl px-3 text-sm text-blue-300 hover:bg-white/5">Gerenciar <ArrowRight className="size-4" aria-hidden /></Link>}>
            {(alerts.data ?? []).length === 0 ? <p className="text-sm text-slate-400">Nenhum alerta. Crie em Alertas.</p> : (
              <ul className="space-y-1.5">
                {alerts.data!.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm text-slate-200">
                    <TriggerIcon t={a.trigger} /><span className="min-w-0 flex-1 truncate">{triggerSummary(a.trigger)}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-slate-500" aria-hidden /><span className="truncate">{a.name}</span>{!a.enabled && <Badge>pausado</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
      </div>
    </>
  );
}
