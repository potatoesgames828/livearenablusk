'use client';
import { use, useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { socketEvents } from '@live-arena/shared';
import type { BaseSnapshot } from '@live-arena/game-engine';
import { GameCanvas, type GameCanvasHandle } from '@/components/game-canvas';
import { connectOverlaySocket } from '@/lib/realtime';

/**
 * Página de overlay (Browser Source). Somente leitura: recebe snapshots do
 * jogo de UMA sessão. Sem dados administrativos, sem controles.
 */
function Overlay({ sessionId }: { sessionId: string }) {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const capture = params.get('capture') === '1';
  const canvas = useRef<GameCanvasHandle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'invalid' | 'offline'>('loading');
  // Som ligado no OBS (Browser Source); desligado na captura do servidor (áudio é silencioso no encoder).
  const sound = !capture;

  useEffect(() => {
    let socket: ReturnType<typeof connectOverlaySocket> | null = null;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/public/overlay/${encodeURIComponent(sessionId)}/bootstrap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
      if (!res || !res.ok) {
        setStatus(res?.status === 401 ? 'invalid' : 'offline');
        if (res?.status !== 401 && !cancelled) setTimeout(() => window.location.reload(), 10_000);
        return;
      }
      const b = (await res.json()) as { ticket: string; realtimeUrl: string; lastState: BaseSnapshot | null };
      if (b.lastState) canvas.current?.push(b.lastState);
      socket = connectOverlaySocket(process.env.NEXT_PUBLIC_REALTIME_URL ?? b.realtimeUrl, b.ticket);
      socket.on('connect', () => {
        setStatus('ok');
        socket?.emit(socketEvents.subscribeSession, sessionId);
      });
      socket.on(socketEvents.state, (s: BaseSnapshot) => canvas.current?.push(s));
      socket.on(socketEvents.error, () => setStatus('invalid'));
      socket.on('connect_error', () => setStatus('offline'));
    })();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [sessionId, token, capture]);

  return (
    <main className="fixed inset-0 bg-black">
      <GameCanvas onReady={(h) => (canvas.current = h)} mode="exact" sound={sound} maxFps={capture ? 30 : 60} className="h-full w-full" label="Jogo da LIVE" />
      {status === 'invalid' && <p className="absolute inset-x-0 top-1/2 text-center text-lg font-semibold text-white">Link de overlay inválido ou revogado.</p>}
      {status === 'offline' && <p className="absolute bottom-4 right-4 rounded bg-black/60 px-3 py-1 text-xs text-amber-300">Reconectando…</p>}
    </main>
  );
}

export default function OverlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  return (
    <Suspense>
      <Overlay sessionId={sessionId} />
    </Suspense>
  );
}
