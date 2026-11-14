'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { GAME_CATALOG } from '@live-arena/shared';
import { Badge, Card, EmptyState, Field, PageHeader, Select, Skeleton, Switch, toast } from '@/components/ui';
import { api, errorMessage, hasPerm, useAuth } from '@/lib/api';
import type { Session } from '@/lib/types';

interface Lb {
  settings: { visibility: 'PUBLIC_NAMES' | 'ANONYMIZED' | 'HIDDEN'; showAvatars: boolean; accumulateAcrossSessions: boolean };
  items: Array<{ rank: number; name: string; realName: string | null; score: number; wins: number; participations: number; simulated: boolean }>;
}

export default function RankingPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [scope, setScope] = useState('all');
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/sessions') });
  const lb = useQuery({ queryKey: ['leaderboard', scope], queryFn: () => api<Lb>(`/leaderboard?scope=${encodeURIComponent(scope)}&limit=50`) });
  const update = async (patch: Partial<Lb['settings']>) => {
    try {
      await api('/leaderboard/settings', { method: 'PUT', body: patch });
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
      toast('Preferências do ranking salvas.');
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  };
  return (
    <>
      <PageHeader title="Ranking" description="Quem mais participou das suas LIVES. Espectadores são identificados pelo ID estável da fonte, não pelo nome." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          title="Classificação"
          action={
            <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Escopo do ranking" className="min-w-48">
              <option value="all">Geral (todas as LIVES)</option>
              {GAME_CATALOG.map((g) => <option key={g.id} value={`game:${g.id}`}>Jogo: {g.name}</option>)}
              {(sessions.data ?? []).map((s) => <option key={s.id} value={`session:${s.id}`}>LIVE: {s.name}</option>)}
            </Select>
          }
        >
          {lb.isLoading ? (
            <Skeleton className="h-60" />
          ) : (lb.data?.items ?? []).length === 0 ? (
            <EmptyState icon={<Trophy className="size-8" />} title="Ninguém pontuou ainda" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-2 font-medium">#</th>
                    <th className="py-2 pr-2 font-medium">Espectador</th>
                    <th className="py-2 pr-2 text-right font-medium">Pontos</th>
                    <th className="py-2 pr-2 text-right font-medium">Vitórias</th>
                    <th className="py-2 text-right font-medium">Participações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {lb.data!.items.map((r) => (
                    <tr key={`${r.rank}-${r.realName}`}>
                      <td className="py-2 pr-2 font-bold text-slate-300">{r.rank}</td>
                      <td className="py-2 pr-2 text-slate-100">
                        {r.realName ?? r.name} {r.simulated && <Badge tone="warn">simulado</Badge>}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums font-semibold text-white">{r.score.toLocaleString('pt-BR')}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{r.wins}</td>
                      <td className="py-2 text-right tabular-nums">{r.participations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {hasPerm(user, 'tenant:manage') && lb.data && (
          <Card title="Privacidade" subtitle="Controle o que é exibido publicamente.">
            <div className="flex flex-col gap-4">
              <Field label="Nomes em telas públicas" htmlFor="vis">
                <Select id="vis" value={lb.data.settings.visibility} onChange={(e) => void update({ visibility: e.target.value as Lb['settings']['visibility'] })}>
                  <option value="PUBLIC_NAMES">Mostrar nomes</option>
                  <option value="ANONYMIZED">Abreviar nomes (ex.: an****)</option>
                  <option value="HIDDEN">Ocultar ranking</option>
                </Select>
              </Field>
              <Switch checked={lb.data.settings.showAvatars} onChange={(v) => void update({ showAvatars: v })} label="Mostrar fotos de perfil" />
              <Switch checked={lb.data.settings.accumulateAcrossSessions} onChange={(v) => void update({ accumulateAcrossSessions: v })} label="Acumular pontos entre LIVES" description="Desligado: só ranking por LIVE e por jogo." />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
