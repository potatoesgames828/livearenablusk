'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Lock, Copy, Trash2, Settings2, PlayCircle, Search, Star, Users, Clock, MessageSquare } from 'lucide-react';
import { GAME_CATEGORIES } from '@live-arena/shared';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, confirmAction, toast } from '@/components/ui';
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

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [sort, setSort] = useState<'recomendados' | 'nome' | 'novos' | 'favoritos'>('recomendados');
  const [onlyAllowed, setOnlyAllowed] = useState(false);
  const games = useMemo(() => {
    const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let list = (catalog.data ?? []).filter((g) => {
      if (onlyAllowed && !g.allowed) return false;
      if (cat === 'favoritos' && !g.favorite) return false;
      if (cat && cat !== 'favoritos' && !g.meta?.categories.includes(cat as never)) return false;
      if (q && !norm(`${g.name} ${g.description} ${g.meta?.categories.join(' ') ?? ''}`).includes(norm(q))) return false;
      return true;
    });
    list = [...list].sort((a, b) =>
      sort === 'nome' ? a.name.localeCompare(b.name, 'pt-BR')
      : sort === 'novos' ? (b.meta?.badge === 'novo' ? 1 : 0) - (a.meta?.badge === 'novo' ? 1 : 0) || (a.meta?.sortOrder ?? 99) - (b.meta?.sortOrder ?? 99)
      : sort === 'favoritos' ? Number(b.favorite) - Number(a.favorite) || (a.meta?.sortOrder ?? 99) - (b.meta?.sortOrder ?? 99)
      : (a.meta?.sortOrder ?? 99) - (b.meta?.sortOrder ?? 99),
    );
    return list;
  }, [catalog.data, q, cat, sort, onlyAllowed]);

  async function toggleFavorite(g: CatalogGame) {
    // atualização otimista
    qc.setQueryData<CatalogGame[]>(['catalog'], (old) => old?.map((x) => (x.id === g.id ? { ...x, favorite: !g.favorite } : x)));
    try {
      await api(`/games/${g.id}/favorite`, { method: g.favorite ? 'DELETE' : 'POST' });
    } catch (err) {
      toast(errorMessage(err), 'bad');
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    }
  }

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
      <PageHeader title="Biblioteca de jogos" description="Escolha um jogo, veja como o público participa, teste a demonstração e crie sua configuração." />
      <section aria-labelledby="catalogo" className="mb-8">
        <h2 id="catalogo" className="sr-only">Jogos disponíveis</h2>
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Buscar jogo</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, categoria…" className="pl-9" />
          </label>
          <Select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="recomendados">Recomendados</option>
            <option value="novos">Novidades primeiro</option>
            <option value="favoritos">Favoritos primeiro</option>
            <option value="nome">Nome (A–Z)</option>
          </Select>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm text-slate-300">
            <input type="checkbox" checked={onlyAllowed} onChange={(e) => setOnlyAllowed(e.target.checked)} className="size-4 accent-violet-500" /> Só os do meu plano
          </label>
        </div>
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categorias">
          {[{ id: '', label: 'Todos' }, { id: 'favoritos', label: '★ Favoritos' }, ...GAME_CATEGORIES].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${cat === c.id ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-line text-slate-300 hover:bg-white/5'}`}>
              {c.label}
            </button>
          ))}
        </div>
        {catalog.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}</div>
        ) : catalog.isError ? (
          <EmptyState title="Não foi possível carregar a biblioteca" description={errorMessage(catalog.error)} action={<Button onClick={() => void catalog.refetch()}>Tentar de novo</Button>} />
        ) : games.length === 0 ? (
          <EmptyState title="Nenhum jogo encontrado" description="Tente outra busca ou categoria." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {games.map((g) => (
              <article key={g.id} className="card group flex flex-col overflow-hidden p-0 transition hover:-translate-y-0.5 hover:border-white/20">
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/covers/${g.id}.webp`} alt={`Prévia do jogo ${g.name}`} loading="lazy" className="size-full object-cover object-top transition duration-300 group-hover:scale-105"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  <span className="absolute left-3 top-3 text-3xl drop-shadow" aria-hidden>{g.emoji}</span>
                  <div className="absolute right-2 top-2 flex gap-1">
                    {g.meta?.badge && <Badge tone={g.meta.badge === 'novo' ? 'ok' : 'info'}>{g.meta.badge.toUpperCase()}</Badge>}
                    {!g.allowed && <Badge tone="warn"><Lock className="mr-1 inline size-3" />Plano superior</Badge>}
                  </div>
                  <button type="button" onClick={() => void toggleFavorite(g)} aria-pressed={g.favorite} aria-label={g.favorite ? `Remover ${g.name} dos favoritos` : `Favoritar ${g.name}`}
                    className="absolute bottom-2 right-2 grid size-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80">
                    <Star className={`size-5 ${g.favorite ? 'fill-amber-400 text-amber-400' : ''}`} aria-hidden />
                  </button>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-bold text-white">{g.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">{g.meta?.categories.map((c) => GAME_CATEGORIES.find((x) => x.id === c)?.label).filter(Boolean).join(' · ')}</p>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-300">{g.description}</p>
                  {g.meta && (
                    <ul className="mt-3 space-y-1 text-xs text-slate-400">
                      <li className="flex items-center gap-1.5"><Users className="size-3.5" aria-hidden /> {g.meta.players}</li>
                      <li className="flex items-center gap-1.5"><MessageSquare className="size-3.5" aria-hidden /> {g.meta.joinHow}</li>
                      <li className="flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden /> {g.meta.duration}</li>
                    </ul>
                  )}
                  <div className="mt-auto grid grid-cols-1 gap-2 pt-4">
                    {canEdit && (
                      <Button size="sm" disabled={!g.allowed} onClick={() => void createFrom(g)}>
                        Usar este jogo
                      </Button>
                    )}
                    <Link href={`/demo/${g.id}`} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl text-sm text-slate-300 hover:bg-white/5">
                      <PlayCircle className="size-4" aria-hidden /> Testar demonstração
                    </Link>
                  </div>
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
