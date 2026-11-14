'use client';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { socketEvents, type SessionStatusPayload } from '@live-arena/shared';
import { api } from './api';

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;

/** Uma conexão WebSocket por aba, autenticada com ticket curto. */
async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  connecting ??= (async () => {
    const { ticket, url } = await api<{ ticket: string; url: string }>('/auth/realtime-ticket', { method: 'POST' });
    const s = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? url, {
      auth: async (cb) => {
        // Reconexões pedem um ticket novo (o anterior expira em 60s).
        try {
          const t = await api<{ ticket: string }>('/auth/realtime-ticket', { method: 'POST' });
          cb({ ticket: t.ticket });
        } catch {
          cb({ ticket });
        }
      },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socket = s;
    return s;
  })().finally(() => {
    connecting = null;
  });
  return connecting;
}

export interface FeedItem {
  id: string;
  type: string;
  user: string | null;
  detail: string;
  status: string;
  actions: number;
  throttled: number;
  simulated: boolean;
  at: string;
}

export interface RealtimeHandlers<S> {
  onState?: (s: S) => void;
  onStatus?: (s: SessionStatusPayload) => void;
  onEvent?: (e: FeedItem) => void;
}

/** Assina os canais de uma sessão. Retorna o estado da conexão. */
export function useSessionRealtime<S = unknown>(sessionId: string | null | undefined, handlers: RealtimeHandlers<S>) {
  const [connected, setConnected] = useState(false);
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let s: Socket | null = null;
    const onState = (p: S) => ref.current.onState?.(p);
    const onStatus = (p: SessionStatusPayload) => p.sessionId === sessionId && ref.current.onStatus?.(p);
    const onEvent = (p: FeedItem) => ref.current.onEvent?.(p);
    const onConnect = () => {
      setConnected(true);
      s?.emit(socketEvents.subscribeSession, sessionId);
    };
    const onDisconnect = () => setConnected(false);
    void getSocket().then((sock) => {
      if (!active) return;
      s = sock;
      sock.on(socketEvents.state, onState);
      sock.on(socketEvents.status, onStatus);
      sock.on(socketEvents.events, onEvent);
      sock.on('connect', onConnect);
      sock.on('disconnect', onDisconnect);
      if (sock.connected) onConnect();
    });
    return () => {
      active = false;
      if (s) {
        s.emit(socketEvents.unsubscribeSession, sessionId);
        s.off(socketEvents.state, onState);
        s.off(socketEvents.status, onStatus);
        s.off(socketEvents.events, onEvent);
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
      }
    };
  }, [sessionId]);

  return { connected };
}

/** Conexão do overlay (ticket restrito à sessão, emitido pelo bootstrap público). */
export function connectOverlaySocket(url: string, ticket: string): Socket {
  return io(url, { auth: { ticket }, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
}
