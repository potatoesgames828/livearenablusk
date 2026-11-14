'use client';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorPlay, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, confirmAction, toast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Session } from '@/lib/types';

interface OverlayRow { id: string; sessionId: string; name: string; tokenPrefix: string; revokedAt: string | null; expiresAt: string | null; lastUsedAt: string | null; createdAt: string }

export default function OverlaysPage() {
  const qc = useQueryClient();
  const overlays = useQuery({ queryKey: ['overlays-all'], queryFn: () => api<OverlayRow[]>('/overlays') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/sessions') });
  const name = (id: string) => sessions.data?.find((s) => s.id === id)?.name ?? 'LIVE';
  return (
    <>
      <PageHeader title="Overlays" description="Links de Fonte de Navegador para OBS / TikTok LIVE Studio. Cada link só mostra o jogo de uma LIVE, não expõe dados do painel e pode ser revogado a qualquer momento." />
      <Card className="mb-5">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>Abra a LIVE em <Link href="/painel/lives" className="text-blue-300 underline">Minhas LIVES</Link> → aba <strong>Saída de vídeo</strong> → <strong>Gerar novo link</strong>.</li>
          <li>No OBS: <strong>Fontes → + → Navegador</strong>, cole o link e use 1080×1920 (vertical) ou 1920×1080 (horizontal).</li>
          <li>Marque “Controlar áudio pelo OBS” para os efeitos sonoros. No PC, a aba “OBS” do painel faz isso automaticamente.</li>
        </ol>
      </Card>
      {overlays.isLoading ? (
        <Skeleton className="h-40" />
      ) : (overlays.data ?? []).length === 0 ? (
        <EmptyState icon={<MonitorPlay className="size-8" />} title="Nenhum link criado" />
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-white/5">
            {overlays.data!.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{name(o.sessionId)} · {o.name} <span className="font-mono text-xs text-slate-500">{o.tokenPrefix}…</span></p>
                  <p className="text-xs text-slate-500">Criado {timeAgo(o.createdAt)} · último uso {timeAgo(o.lastUsedAt)}</p>
                </div>
                {o.revokedAt ? (
                  <Badge>revogado</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="size-4" />}
                    onClick={async () => {
                      if (!(await confirmAction({ title: 'Revogar link', message: 'O link deixa de funcionar imediatamente.', confirmLabel: 'Revogar' }))) return;
                      await api(`/overlays/${o.id}`, { method: 'DELETE' }).then(() => toast('Revogado.')).catch((e: unknown) => toast(errorMessage(e), 'bad'));
                      void qc.invalidateQueries({ queryKey: ['overlays-all'] });
                    }}
                  >
                    Revogar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
