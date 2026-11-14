'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorPlay, RefreshCw, Trash2, Link2 } from 'lucide-react';
import { Badge, Button, Card, CopyField, EmptyState, Field, PageHeader, Select, Skeleton, Switch, confirmAction, toast } from '@/components/ui';
import { api, errorMessage, hasPerm, useAuth } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Session } from '@/lib/types';

interface OverlaySettings { showGame: boolean; showAlerts: boolean; playSounds: boolean; volume: number; alertPosition: 'top' | 'center' | 'bottom'; idleCard: boolean }
interface UserOverlay { exists: boolean; id?: string; tokenPrefix?: string; createdAt?: string; lastUsedAt?: string | null; settings: OverlaySettings }
interface OverlayRow { id: string; kind: string; sessionId: string | null; name: string; tokenPrefix: string; revokedAt: string | null; expiresAt: string | null; lastUsedAt: string | null; createdAt: string }

export default function OverlaysPage() {
  const qc = useQueryClient();
  const overlays = useQuery({ queryKey: ['overlays-all'], queryFn: () => api<OverlayRow[]>('/overlays') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/sessions') });
  const name = (o: OverlayRow) => (o.kind === 'USER' ? 'Overlay do criador' : sessions.data?.find((s) => s.id === o.sessionId)?.name ?? 'LIVE');
  const user = useAuth((s) => s.user);
  const canManage = hasPerm(user, 'overlay:manage');
  const mine = useQuery({ queryKey: ['overlay-user'], queryFn: () => api<UserOverlay>('/overlays/user') });
  const [fresh, setFresh] = useState<{ url: string; warning: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function rotate() {
    if (mine.data?.exists && !(await confirmAction({ title: 'Gerar novo link', message: 'O link atual para de funcionar imediatamente. Você terá que colar o novo link no OBS.', confirmLabel: 'Gerar novo link' }))) return;
    setBusy(true);
    try {
      const r = await api<{ url: string; warning: string }>('/overlays/user', { method: 'POST' });
      setFresh(r);
      void qc.invalidateQueries({ queryKey: ['overlay-user'] });
      void qc.invalidateQueries({ queryKey: ['overlays-all'] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(patch: Partial<OverlaySettings>) {
    if (!mine.data) return;
    const next = { ...mine.data.settings, ...patch };
    qc.setQueryData<UserOverlay>(['overlay-user'], { ...mine.data, settings: next });
    try {
      await api('/overlays/user/settings', { method: 'PUT', body: next });
    } catch (err) {
      toast(errorMessage(err), 'bad');
      void qc.invalidateQueries({ queryKey: ['overlay-user'] });
    }
  }
  const st = mine.data?.settings;
  return (
    <>
      <PageHeader title="Overlay" description="Um único link de Fonte de Navegador para OBS / TikTok LIVE Studio. Ele acompanha a LIVE ativa e a troca de jogo sozinho: configure uma vez e não mexa mais." />
      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Seu link do overlay" subtitle="Somente leitura, sem dados do painel, revogável a qualquer momento.">
          {mine.isLoading ? <Skeleton className="h-24" /> : (
            <div className="space-y-4">
              {fresh ? (
                <>
                  <CopyField value={fresh.url} label="Link do overlay (copie agora)" />
                  <p className="text-sm text-amber-300">{fresh.warning}</p>
                </>
              ) : mine.data?.exists ? (
                <p className="text-sm text-slate-300">
                  Link ativo <span className="font-mono text-slate-400">{mine.data.tokenPrefix}…</span> · criado {timeAgo(mine.data.createdAt ?? null)} · último uso {timeAgo(mine.data.lastUsedAt ?? null)}.
                  <br /><span className="text-slate-500">Por segurança o link completo só aparece na criação. Perdeu? Gere um novo.</span>
                </p>
              ) : (
                <EmptyState icon={<Link2 className="size-6" />} title="Você ainda não tem um link de overlay" description="Crie o link e cole no OBS uma única vez." />
              )}
              {canManage && (
                <Button icon={<RefreshCw className="size-4" />} loading={busy} onClick={() => void rotate()} variant={mine.data?.exists ? 'secondary' : 'primary'}>
                  {mine.data?.exists ? 'Gerar novo link (revoga o atual)' : 'Criar meu link de overlay'}
                </Button>
              )}
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
                <li>No OBS: <strong>Fontes → + → Navegador</strong> e cole o link.</li>
                <li>Use 1080×1920 (vertical) ou 1920×1080 (horizontal), conforme o formato do jogo.</li>
                <li>Marque <strong>“Controlar áudio pelo OBS”</strong> para ouvir os sons e alertas.</li>
                <li>O fundo é transparente quando não há jogo na tela: o overlay pode ficar sempre ligado.</li>
              </ol>
            </div>
          )}
        </Card>
        <Card title="O que aparece no overlay">
          {!st ? <Skeleton className="h-40" /> : (
            <div className="space-y-3">
              <Switch checked={st.showGame} onChange={(v) => void saveSettings({ showGame: v })} label="Mostrar o jogo" disabled={!canManage || !mine.data?.exists} />
              <Switch checked={st.showAlerts} onChange={(v) => void saveSettings({ showAlerts: v })} label="Mostrar alertas" description="Configure em Alertas." disabled={!canManage || !mine.data?.exists} />
              <Switch checked={st.playSounds} onChange={(v) => void saveSettings({ playSounds: v })} label="Tocar sons do soundboard" disabled={!canManage || !mine.data?.exists} />
              <Switch checked={st.idleCard} onChange={(v) => void saveSettings({ idleCard: v })} label="Aviso “Aguardando a LIVE” sem jogo ativo" disabled={!canManage || !mine.data?.exists} />
              <Field label={`Volume geral (${st.volume}%)`} htmlFor="ov-vol">
                <input id="ov-vol" type="range" min={0} max={100} defaultValue={st.volume} disabled={!canManage || !mine.data?.exists} className="w-full accent-violet-500"
                  onMouseUp={(e) => void saveSettings({ volume: Number((e.target as HTMLInputElement).value) })} onTouchEnd={(e) => void saveSettings({ volume: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => void saveSettings({ volume: Number((e.target as HTMLInputElement).value) })} />
              </Field>
              <Field label="Posição dos alertas" htmlFor="ov-pos">
                <Select id="ov-pos" value={st.alertPosition} disabled={!canManage || !mine.data?.exists} onChange={(e) => void saveSettings({ alertPosition: e.target.value as OverlaySettings['alertPosition'] })}>
                  <option value="top">Topo</option><option value="center">Centro</option><option value="bottom">Rodapé</option>
                </Select>
              </Field>
              <p className="text-xs text-slate-500">As mudanças chegam ao overlay em até 15 segundos, sem recarregar o OBS.</p>
            </div>
          )}
        </Card>
      </div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Todos os links (incluindo links avulsos por LIVE)</h2>
      <p className="mb-3 text-sm text-slate-400">Links de uma LIVE específica continuam disponíveis em <Link href="/painel/lives" className="text-blue-300 underline">Minha transmissão</Link> → Saída de vídeo.</p>
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
                  <p className="truncate text-sm font-medium text-slate-100">{name(o)} · {o.name} <span className="font-mono text-xs text-slate-500">{o.tokenPrefix}…</span></p>
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
