'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { MonitorPlay, Trash2, Plug, Play, Square, Server, Info } from 'lucide-react';
import { Badge, Button, CopyField, EmptyState, Field, Input, Select, StatusPill, Tabs, confirmAction, toast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo, streamTone, labelStream } from '@/lib/format';
import { ObsBridge } from '@/lib/obs';
import type { Session } from '@/lib/types';

interface OverlayRow {
  id: string;
  name: string;
  tokenPrefix: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

function OverlaysTab({ session, onUrl }: { session: Session; onUrl: (u: string) => void }) {
  const qc = useQueryClient();
  const [created, setCreated] = useState<{ url: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['overlays', session.id], queryFn: () => api<OverlayRow[]>(`/overlays?sessionId=${session.id}`) });
  const create = useMutation({
    mutationFn: () => api<{ url: string }>('/overlays', { method: 'POST', body: { sessionId: session.id, name: 'OBS' } }),
    onSuccess: async (r) => {
      setCreated(r);
      onUrl(r.url);
      setQr(await QRCode.toDataURL(r.url, { margin: 1, width: 220 }));
      void qc.invalidateQueries({ queryKey: ['overlays', session.id] });
    },
    onError: (e) => toast(errorMessage(e), 'bad'),
  });
  const revoke = async (id: string) => {
    if (!(await confirmAction({ title: 'Revogar link do overlay', message: 'O link deixará de funcionar imediatamente no OBS e em qualquer lugar onde estiver aberto.', confirmLabel: 'Revogar' }))) return;
    try {
      await api(`/overlays/${id}`, { method: 'DELETE' });
      toast('Link revogado.');
      void qc.invalidateQueries({ queryKey: ['overlays', session.id] });
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  };
  const active = (list.data ?? []).filter((o) => !o.revokedAt && !o.name.includes('interno'));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">
        O overlay é uma página com o jogo na proporção de vídeo configurada. Adicione-o como <strong>Fonte de Navegador</strong> no OBS ou no TikTok LIVE Studio.
      </p>
      <Button icon={<MonitorPlay className="size-4" />} onClick={() => create.mutate()} loading={create.isPending}>
        Gerar novo link de overlay
      </Button>
      {created && (
        <div className="flex flex-col gap-3 rounded-xl border border-brand/40 bg-brand-soft p-3">
          <CopyField label="Link do overlay (copie agora — por segurança ele não será exibido de novo)" value={created.url} />
          <div className="flex flex-wrap items-center gap-4">
            {qr && <img src={qr} alt="QR code do link do overlay" className="size-32 rounded-lg bg-white p-1" />}
            <p className="max-w-xs text-xs text-slate-300">
              Tamanho recomendado da fonte no OBS: <strong>1080 × 1920</strong> (vertical) ou <strong>1920 × 1080</strong> (horizontal). Marque “Controlar áudio pelo OBS” para ouvir os efeitos.
            </p>
          </div>
        </div>
      )}
      {active.length === 0 ? (
        <EmptyState title="Nenhum link ativo" description="Gere um link para usar o jogo no OBS." />
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium text-slate-200">
                  {o.name} <span className="font-mono text-xs text-slate-500">{o.tokenPrefix}…</span>
                </p>
                <p className="text-xs text-slate-500">Criado {timeAgo(o.createdAt)} · último uso {timeAgo(o.lastUsedAt)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void revoke(o.id)} aria-label="Revogar link" icon={<Trash2 className="size-4" />}>
                Revogar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ObsTab({ overlayUrl, aspectVertical }: { overlayUrl: string | null; aspectVertical: boolean }) {
  const bridge = useRef<ObsBridge | null>(null);
  const [url, setUrl] = useState('ws://localhost:4455');
  const [password, setPassword] = useState('');
  const [connected, setConnected] = useState(false);
  const [scenes, setScenes] = useState<{ current: string; list: string[] } | null>(null);
  const [scene, setScene] = useState('');
  const [status, setStatus] = useState<{ active: boolean; reconnecting: boolean; congestion: number; skipped: number; total: number } | null>(null);
  const [stats, setStats] = useState<{ fps: number; cpu: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(overlayUrl ?? '');
  useEffect(() => {
    if (overlayUrl) setSourceUrl(overlayUrl);
  }, [overlayUrl]);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => {
      void bridge.current?.streamStatus().then(setStatus).catch(() => undefined);
      void bridge.current?.stats().then(setStats).catch(() => undefined);
    }, 2000);
    return () => clearInterval(t);
  }, [connected]);
  useEffect(() => () => void bridge.current?.disconnect().catch(() => undefined), []);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(`OBS: ${errorMessage(e)}`, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 rounded-lg border border-line bg-white/[0.02] p-3 text-xs text-slate-400">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-400" aria-hidden />
        <p>
          Disponível no <strong>computador</strong> onde o OBS está aberto (OBS 28+ → Ferramentas → Configurações do WebSocket). A senha fica só no seu navegador.
          A chave de transmissão é configurada no próprio OBS, com a credencial que a plataforma forneceu a você.
        </p>
      </div>
      {!connected ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Endereço do OBS WebSocket" htmlFor="obs-url">
            <Input id="obs-url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="Senha do WebSocket" htmlFor="obs-pw">
            <Input id="obs-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </Field>
          <div className="sm:col-span-2">
            <Button
              icon={<Plug className="size-4" />}
              loading={busy}
              onClick={() =>
                void run(async () => {
                  bridge.current = new ObsBridge();
                  await bridge.current.connect(url, password);
                  const sc = await bridge.current.scenes();
                  setScenes(sc);
                  setScene(sc.current);
                  setConnected(true);
                }, 'Conectado ao OBS.')
              }
            >
              Conectar ao OBS
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="ok">OBS conectado</StatusPill>
            {status && <StatusPill tone={status.active ? (status.reconnecting ? 'warn' : 'ok') : 'neutral'}>{status.active ? (status.reconnecting ? 'Reconectando' : 'Transmitindo') : 'Sem transmissão'}</StatusPill>}
            {stats && <Badge>{stats.fps.toFixed(0)} fps · CPU {stats.cpu.toFixed(0)}%</Badge>}
            {status?.active && <Badge tone={status.congestion > 0.2 ? 'warn' : 'neutral'}>Congestionamento {(status.congestion * 100).toFixed(0)}% · quadros perdidos {status.skipped}</Badge>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cena" htmlFor="obs-scene">
              <Select id="obs-scene" value={scene} onChange={(e) => setScene(e.target.value)}>
                {scenes?.list.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Link do overlay" htmlFor="obs-src" hint="Gere um link na aba Overlay.">
              <Input id="obs-src" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…/overlay/…" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!sourceUrl}
              loading={busy}
              onClick={() => void run(() => bridge.current!.upsertBrowserSource(scene, sourceUrl, aspectVertical ? 1080 : 1920, aspectVertical ? 1920 : 1080), 'Fonte “LIVE ARENA” adicionada à cena.')}
            >
              Adicionar jogo à cena
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => void run(() => bridge.current!.setScene(scene), 'Cena ativada.')}>
              Ativar cena
            </Button>
            {status?.active ? (
              <Button
                variant="danger"
                icon={<Square className="size-4" />}
                loading={busy}
                onClick={async () => {
                  if (await confirmAction({ title: 'Encerrar transmissão no OBS', message: 'A transmissão ao vivo será interrompida.', confirmLabel: 'Encerrar transmissão' })) void run(() => bridge.current!.stopStream(), 'Transmissão encerrada.');
                }}
              >
                Parar transmissão
              </Button>
            ) : (
              <Button variant="success" icon={<Play className="size-4" />} loading={busy} onClick={() => void run(() => bridge.current!.startStream(), 'Transmissão iniciada no OBS.')}>
                Iniciar transmissão no OBS
              </Button>
            )}
            <Button variant="ghost" onClick={() => void run(async () => { await bridge.current?.disconnect(); setConnected(false); })}>
              Desconectar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ServerStreamTab({ session, onChanged }: { session: Session; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ['stream-status', session.id],
    queryFn: () => api<{ state: string; stats: Record<string, number | string> | null; processes: Array<{ id: string; status: string; startedAt: string; endedAt: string | null; restarts: number; lastStats: Record<string, unknown> }> }>(`/streams/sessions/${session.id}/status`),
    refetchInterval: 3000,
  });
  if (!session.streamConfigId) {
    return <EmptyState icon={<Server className="size-8" />} title="Sem saída de vídeo do servidor" description="Opcional: configure em Configurações → Saída de vídeo (requer URL e chave RTMP fornecidas legitimamente pela plataforma, ou use o modo Gravação para testes). Depois vincule à sessão." />;
  }
  const act = async (path: 'start' | 'stop') => {
    if (path === 'stop' && !(await confirmAction({ title: 'Parar transmissão do servidor', message: 'O envio de vídeo pelo servidor será interrompido.', confirmLabel: 'Parar' }))) return;
    setBusy(true);
    try {
      await api(`/streams/sessions/${session.id}/${path}`, { method: 'POST' });
      toast(path === 'start' ? 'Iniciando a transmissão pelo servidor…' : 'Parando a transmissão…', 'info');
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  };
  const st = status.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={streamTone(st?.state ?? session.streamState)}>{labelStream(st?.state ?? session.streamState)}</StatusPill>
        {st?.stats && (
          <Badge>
            {Number(st.stats.fps ?? 0).toFixed(0)} fps · {Math.round(Number(st.stats.bitrateKbps ?? 0))} kbps · reinícios {String(st.stats.restarts ?? 0)}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" icon={<Play className="size-4" />} loading={busy} onClick={() => void act('start')}>
          Iniciar pelo servidor
        </Button>
        <Button variant="secondary" icon={<Square className="size-4" />} loading={busy} onClick={() => void act('stop')}>
          Parar
        </Button>
      </div>
      {st?.processes?.length ? (
        <ul className="flex flex-col gap-1 text-xs text-slate-400">
          {st.processes.map((p) => (
            <li key={p.id}>
              {new Date(p.startedAt).toLocaleString('pt-BR')} — {p.status} · reinícios {p.restarts}
              {typeof p.lastStats.output === 'string' && <span className="block truncate text-slate-500">Arquivo: {String(p.lastStats.output)}</span>}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OutputPanel({ session, aspectVertical, onChanged }: { session: Session; aspectVertical: boolean; onChanged: () => void }) {
  const [tab, setTab] = useState<'overlay' | 'obs' | 'server'>('overlay');
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  return (
    <div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'overlay', label: 'Overlay' }, { value: 'obs', label: 'OBS (PC)' }, { value: 'server', label: 'Servidor' }]} />
      {tab === 'overlay' && <OverlaysTab session={session} onUrl={setOverlayUrl} />}
      {tab === 'obs' && <ObsTab overlayUrl={overlayUrl} aspectVertical={aspectVertical} />}
      {tab === 'server' && <ServerStreamTab session={session} onChanged={onChanged} />}
    </div>
  );
}
