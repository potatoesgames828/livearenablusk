'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Copy, Trash2, Settings2, PlayCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, confirmAction, toast } from '@/components/ui';
import { api, errorMessage, hasPerm, useAuth } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { CatalogGame, GameConfig } from '@/lib/types';

export default function GamesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const canEdit = hasPerm(user, 'game:configure');
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<CatalogGame[]>('/games') });
  const configs = useQuery({ queryKey: ['configs'], queryFn: () => api<GameConfig[]>('/games/configs') });

  async function createFrom(g: CatalogGame) {
    try {
      const c = await api<GameConfig>('/games/configs', { method: 'POST', body: { gameId: g.id, name: g.name } });
      void qc.invalidateQueries({ queryKey: ['configs'] });
      router.push(`/painel/jogos/${c.id}`);
    } catch (err) {
      toast(errorMessage(err), 'bad');
    }
  }
  async function duplicate(c: GameConfig) {
    try {
      await api(`/games/configs/${c.id}/duplicate`, { method: 'POST' });
      toast('Configuração duplicada.');
      void qc.invalidateQueries({ queryKey: ['configs'] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    }
  }
  async function remove(c: GameConfig) {
    if (!(await confirmAction({ title: 'Excluir configuração', message: `"${c.name}" será excluída.`, confirmLabel: 'Excluir' }))) return;
    try {
      await api(`/games/configs/${c.id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['configs'] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    }
  }

  return (
    <>
      <PageHeader title="Central de jogos" description="Escolha um jogo, ajuste presentes, curtidas e comandos, e teste antes de entrar ao vivo." />
      <section aria-labelledby="catalogo" className="mb-8">
        <h2 id="catalogo" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Jogos disponíveis</h2>
        {catalog.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {(catalog.data ?? []).map((g) => (
              <article key={g.id} className="card flex flex-col p-4" style={{ borderTopColor: g.accent, borderTopWidth: 3 }}>
                <div className="flex items-center justify-between">
                  <span className="text-3xl" aria-hidden>{g.emoji}</span>
                  {!g.allowed && <Badge tone="warn"><Lock className="mr-1 inline size-3" />Plano superior</Badge>}
                </div>
                <h3 className="mt-2 font-bold text-white">{g.name}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-slate-400">{g.description}</p>
                <div className="mt-auto flex flex-col gap-2 pt-4">
                  {canEdit && (
                    <Button size="sm" disabled={!g.allowed} onClick={() => void createFrom(g)}>
                      Usar este jogo
                    </Button>
                  )}
                  <Link href={`/demo/${g.id}`} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl text-sm text-slate-300 hover:bg-white/5">
                    <PlayCircle className="size-4" aria-hidden /> Testar demonstração
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="minhas">
        <h2 id="minhas" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Minhas configurações e presets</h2>
        {configs.isLoading ? (
          <Skeleton className="h-32" />
        ) : (configs.data ?? []).length === 0 ? (
          <EmptyState title="Nenhuma configuração ainda" description="Clique em “Usar este jogo” para criar uma configuração com as regras padrão." />
        ) : (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-white/5">
              {configs.data!.map((c) => {
                const g = catalog.data?.find((x) => x.id === c.gameId);
                return (
                  <li key={c.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/painel/jogos/${c.id}`} className="flex min-w-0 items-center gap-3">
                      <span className="text-2xl" aria-hidden>{g?.emoji}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-100">
                          {c.name} {c.isPreset && <Badge tone="info">Preset</Badge>}
                        </p>
                        <p className="text-xs text-slate-400">{g?.name} · {c.body.rules.length} regras · atualizado {timeAgo(c.updatedAt)}</p>
                      </div>
                    </Link>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Link href={`/painel/jogos/${c.id}`} className="inline-flex min-h-9 items-center gap-1 rounded-xl px-3 text-sm text-slate-200 hover:bg-white/5">
                          <Settings2 className="size-4" aria-hidden /> Configurar
                        </Link>
                        <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => void duplicate(c)}>Duplicar</Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove(c)} aria-label={`Excluir ${c.name}`} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
