'use client';
import { useEffect, useRef, useState } from 'react';
import { socketEvents } from '@live-arena/shared';
import type { BaseSnapshot } from '@live-arena/game-engine';
import { GameCanvas, type GameCanvasHandle } from '@/components/game-canvas';
import { connectOverlaySocket } from '@/lib/realtime';

interface Settings {
  showGame: boolean;
  showAlerts: boolean;
  playSounds: boolean;
  volume: number;
  alertPosition: 'top' | 'center' | 'bottom';
  idleCard: boolean;
}
interface Bootstrap {
  ticket: string;
  realtimeUrl: string;
  sessionId: string | null;
  lastState: BaseSnapshot | null;
  settings: Settings;
  soundBindings: Array<{ slot: string; soundId: string; volume: number }>;
}
interface AlertFx {
  type: 'alert';
  alertId: string;
  title: string;
  emoji: string;
  color: string;
  soundId?: string;
  volume: number;
  durationMs: number;
  user?: { name: string; avatarUrl?: string };
  simulated: boolean;
}

const POLL_MS = 15_000;

/**
 * Overlay único do criador (Browser Source). Acompanha a LIVE ativa e a troca
 * de jogo sem reconfigurar o OBS. Fundo transparente fora do jogo; camada de
 * alertas com som. Somente leitura.
 */
export function UserOverlay({ token, capture }: { token: string; capture: boolean }) {
  const canvas = useRef<GameCanvasHandle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'invalid' | 'offline'>('loading');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasState, setHasState] = useState(false);
  const [alert, setAlert] = useState<AlertFx | null>(null);
  const queue = useRef<AlertFx[]>([]);
  const bindings = useRef<Bootstrap['soundBindings']>([]);
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  const play = (soundId: string, volume: number) => {
    const st = settingsRef.current;
    if (capture || !st?.playSounds) return;
    try {
      const a = new Audio(`/api/public/overlay-user/sound/${encodeURIComponent(soundId)}?token=${encodeURIComponent(token)}`);
      a.volume = Math.max(0, Math.min(1, (volume / 100) * (st.volume / 100)));
      void a.play().catch(() => undefined);
    } catch {
      /* navegador sem áudio */
    }
  };

  // fila de alertas: um por vez
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (alert || !queue.current.length) return;
    const next = queue.current.shift()!;
    setAlert(next);
    if (next.soundId) play(next.soundId, next.volume);
    const t = setTimeout(() => {
      setAlert(null);
      setPending((n) => n + 1);
    }, next.durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert, pending]);

  useEffect(() => {
    let socket: ReturnType<typeof connectOverlaySocket> | null = null;
    let current: string | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const subscribe = (sid: string | null) => {
      if (sid === current) return;
      current = sid;
      setSessionId(sid);
      setHasState(false);
      if (sid && socket?.connected) socket.emit(socketEvents.subscribeSession, sid);
    };

    const boot = async () => {
      const res = await fetch('/api/public/overlay-user/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
      if (stopped) return;
      if (!res || !res.ok) {
        setStatus(res?.status === 401 ? 'invalid' : 'offline');
        if (res?.status !== 401) timer = setTimeout(() => void boot(), 10_000);
        return;
      }
      const b = (await res.json()) as Bootstrap;
      setSettings(b.settings);
      bindings.current = b.soundBindings;
      if (!socket) {
        socket = connectOverlaySocket(process.env.NEXT_PUBLIC_REALTIME_URL ?? b.realtimeUrl, b.ticket);
        socket.on('connect', () => {
          setStatus('ok');
          if (current) socket?.emit(socketEvents.subscribeSession, current);
        });
        socket.on(socketEvents.state, (s: BaseSnapshot) => {
          setHasState(true);
          canvas.current?.push(s);
        });
        socket.on(socketEvents.fx, (fx: { type?: string; slot?: string }) => {
          const st = settingsRef.current;
          if (fx.type === 'alert' && st?.showAlerts) {
            if (queue.current.length < 20) queue.current.push(fx as unknown as AlertFx);
            setPending((n) => n + 1);
          } else if (fx.type === 'sound' && fx.slot) {
            const bnd = bindings.current.find((x) => x.slot === fx.slot);
            if (bnd) play(bnd.soundId, bnd.volume);
          }
        });
        socket.on(socketEvents.error, () => setStatus('invalid'));
        socket.on('connect_error', () => setStatus('offline'));
      } else {
        (socket as unknown as { auth: { ticket: string } }).auth = { ticket: b.ticket };
      }
      if (b.lastState && b.sessionId !== current) {
        canvas.current?.push(b.lastState);
        setHasState(true);
      }
      subscribe(b.sessionId);
      timer = setTimeout(() => void boot(), POLL_MS);
    };
    void boot();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, capture]);

  const showGame = settings?.showGame !== false && !!sessionId;
  const pos = settings?.alertPosition ?? 'top';
  return (
    <main className="fixed inset-0" style={{ background: 'transparent' }}>
      <div className="absolute inset-0" style={{ visibility: showGame && hasState ? 'visible' : 'hidden' }}>
        <GameCanvas onReady={(h) => (canvas.current = h)} mode="exact" sound={!capture} maxFps={capture ? 30 : 60} className="h-full w-full" label="Jogo da LIVE" />
      </div>
      {!sessionId && settings?.idleCard && status === 'ok' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-black/60 px-5 py-3 text-center text-sm font-semibold text-white">Aguardando a LIVE começar…</div>
      )}
      {alert && (
        <div
          role="status"
          className={`la-alert absolute left-1/2 z-10 w-[min(90vw,640px)] -translate-x-1/2 ${pos === 'top' ? 'top-[8%]' : pos === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-[10%]'}`}
        >
          <div className="flex items-center gap-4 rounded-3xl border-4 bg-slate-950/90 px-6 py-5 shadow-2xl" style={{ borderColor: alert.color }}>
            <span className="text-5xl" aria-hidden>{alert.emoji}</span>
            <div className="min-w-0">
              <p className="text-2xl font-black leading-tight text-white [overflow-wrap:anywhere]">{alert.title}</p>
              {alert.simulated && <p className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-300">Simulação</p>}
            </div>
          </div>
        </div>
      )}
      {status === 'invalid' && <p className="absolute inset-x-0 top-1/2 text-center text-lg font-semibold text-white [text-shadow:0_2px_6px_#000]">Link de overlay inválido ou revogado.</p>}
      {status === 'offline' && <p className="absolute bottom-4 right-4 rounded bg-black/60 px-3 py-1 text-xs text-amber-300">Reconectando…</p>}
      <style>{`html,body{background:transparent!important}.la-alert{animation:la-pop .45s cubic-bezier(.2,1.4,.4,1)}@keyframes la-pop{from{opacity:0;transform:translate(-50%,-20px) scale(.9)}to{opacity:1}}@media (prefers-reduced-motion:reduce){.la-alert{animation:none}}`}</style>
    </main>
  );
}
