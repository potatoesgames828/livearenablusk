import http from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyRealtimeTicket } from '@live-arena/security';
import { getPrisma, disconnectPrisma } from '@live-arena/database';
import { createRedis, installProcessHandlers, keys, redisHealthy, serviceIdentity, startHeartbeat } from '@live-arena/runtime';
import { createLogger, initMetrics, initTracing, metrics, registry, startEventLoopMonitor } from '@live-arena/observability';
import { REALTIME_PATTERN, roomFor, socketEvents, tenantRoomFor } from '@live-arena/shared';

const logger = createLogger('realtime');
const PORT = Number(process.env.REALTIME_PORT ?? 4001);
const ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim());
const MAX_PER_TENANT = Number(process.env.REALTIME_MAX_CONNECTIONS_PER_TENANT ?? 200);
const MAX_SUBSCRIPTIONS = 5;

interface SocketData {
  tenantId: string;
  kind: 'dashboard' | 'overlay';
  userId?: string;
  overlayId?: string;
  overlaySessionId?: string;
  rooms: Set<string>;
  msgTimes: number[];
}

async function main(): Promise<void> {
  await initTracing('realtime');
  initMetrics('realtime');
  const prisma = getPrisma();
  const pub = createRedis('realtime-pub');
  const sub = createRedis('realtime-sub');
  const events = createRedis('realtime-events'); // somente assinatura (pub/sub)
  const cmd = createRedis('realtime-cmd'); // comandos normais (GET etc.)
  const identity = serviceIdentity('realtime');
  const tenantCounts = new Map<string, number>();
  const sessionOwner = new Map<string, { tenantId: string; at: number }>();

  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.url?.startsWith('/health/live')) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'ok' }));
      } else if (req.url?.startsWith('/health/ready')) {
        const ok = await redisHealthy(pub);
        res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify({ status: ok ? 'ok' : 'fail' }));
      } else if (req.url?.startsWith('/metrics')) {
        const token = process.env.METRICS_TOKEN;
        if (token && req.headers.authorization !== `Bearer ${token}`) return void res.writeHead(401).end();
        res.writeHead(200, { 'content-type': registry.contentType }).end(await registry.metrics());
      } else if (!req.url?.startsWith('/socket.io')) {
        res.writeHead(404).end();
      }
    })();
  });

  const io = new Server(server, {
    cors: { origin: ORIGINS, credentials: false },
    maxHttpBufferSize: 16 * 1024, // clientes só enviam comandos pequenos
    pingInterval: 20_000,
    pingTimeout: 20_000,
    transports: ['websocket', 'polling'],
    serveClient: false,
  });
  io.adapter(createAdapter(pub, sub.duplicate()));

  /** Verifica (com cache) se a sessão pertence ao tenant. */
  async function sessionBelongs(tenantId: string, sessionId: string): Promise<boolean> {
    const c = sessionOwner.get(sessionId);
    if (c && Date.now() - c.at < 30_000) return c.tenantId === tenantId;
    const s = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { tenantId: true } });
    if (!s) return false;
    sessionOwner.set(sessionId, { tenantId: s.tenantId, at: Date.now() });
    if (sessionOwner.size > 20_000) sessionOwner.clear();
    return s.tenantId === tenantId;
  }

  // Autenticação no handshake: ticket curto emitido pela API.
  io.use((socket, next) => {
    void (async () => {
      const token = (socket.handshake.auth as { ticket?: string } | undefined)?.ticket;
      if (!token || typeof token !== 'string') return next(new Error('AUTH_REQUIRED'));
      let claims;
      try {
        claims = verifyRealtimeTicket(token);
      } catch {
        return next(new Error('AUTH_REQUIRED'));
      }
      const data: SocketData = { tenantId: claims.tid, kind: 'dashboard', rooms: new Set(), msgTimes: [] };
      if (claims.sub.startsWith('overlay:')) {
        const [, overlayId, sessionId] = claims.sub.split(':');
        if (!overlayId || !sessionId) return next(new Error('AUTH_REQUIRED'));
        const o = await prisma.overlay.findUnique({ where: { id: overlayId } });
        // Overlay do usuário ("*"): pode assinar qualquer LIVE do próprio tenant (troca de LIVE sem reconfigurar o OBS).
        const userOverlay = sessionId === '*' && o?.kind === 'USER';
        if (!o || o.revokedAt || o.tenantId !== claims.tid || (!userOverlay && o.sessionId !== sessionId)) return next(new Error('AUTH_REQUIRED'));
        data.kind = 'overlay';
        data.overlayId = overlayId;
        data.overlaySessionId = sessionId;
      } else {
        data.userId = claims.sub;
      }
      const n = tenantCounts.get(data.tenantId) ?? 0;
      if (n >= MAX_PER_TENANT) return next(new Error('RATE_LIMITED'));
      socket.data = data;
      next();
    })().catch(() => next(new Error('INTERNAL')));
  });

  function allowMessage(socket: Socket): boolean {
    const d = socket.data as SocketData;
    const now = Date.now();
    d.msgTimes = d.msgTimes.filter((t) => now - t < 10_000);
    d.msgTimes.push(now);
    return d.msgTimes.length <= 20;
  }

  io.on('connection', (socket) => {
    const d = socket.data as SocketData;
    tenantCounts.set(d.tenantId, (tenantCounts.get(d.tenantId) ?? 0) + 1);
    metrics.realtimeConnections.inc({ kind: d.kind });
    if (d.kind === 'dashboard') void socket.join(tenantRoomFor(d.tenantId));

    const subscribe = async (sessionId: unknown, ack?: (r: unknown) => void) => {
      if (!allowMessage(socket)) return ack?.({ ok: false, error: 'RATE_LIMITED' });
      if (typeof sessionId !== 'string' || sessionId.length > 64) return ack?.({ ok: false, error: 'VALIDATION' });
      // Overlay só pode assinar a própria sessão; painel só sessões do próprio tenant.
      if (d.kind === 'overlay' && d.overlaySessionId !== '*' && sessionId !== d.overlaySessionId) return ack?.({ ok: false, error: 'FORBIDDEN' });
      // Overlay do usuário acompanha uma LIVE por vez.
      if (d.kind === 'overlay' && d.overlaySessionId === '*') {
        for (const r of d.rooms) void socket.leave(r);
        d.rooms.clear();
      }
      if (!(await sessionBelongs(d.tenantId, sessionId))) return ack?.({ ok: false, error: 'FORBIDDEN' });
      if (d.rooms.size >= MAX_SUBSCRIPTIONS) return ack?.({ ok: false, error: 'LIMIT' });
      const room = roomFor(d.tenantId, sessionId);
      d.rooms.add(room);
      await socket.join(room);
      const last = await cmd.get(keys.lastState(sessionId)).catch(() => null);
      if (last) socket.emit(socketEvents.state, JSON.parse(last) as unknown);
      ack?.({ ok: true });
    };
    socket.on(socketEvents.subscribeSession, (sid: unknown, ack?: (r: unknown) => void) => {
      subscribe(sid, ack).catch(() => ack?.({ ok: false, error: 'INTERNAL' }));
    });
    socket.on(socketEvents.unsubscribeSession, (sessionId: unknown) => {
      if (!allowMessage(socket) || typeof sessionId !== 'string') return;
      const room = roomFor(d.tenantId, sessionId);
      d.rooms.delete(room);
      void socket.leave(room);
    });
    socket.on('disconnect', () => {
      tenantCounts.set(d.tenantId, Math.max(0, (tenantCounts.get(d.tenantId) ?? 1) - 1));
      metrics.realtimeConnections.dec({ kind: d.kind });
    });
  });

  // Ponte Redis → sockets. Cada instância entrega apenas aos seus sockets locais.
  await events.psubscribe(REALTIME_PATTERN);
  events.on('pmessage', (_p: string, channel: string, message: string) => {
    // rt:<tenant>:<session>:<kind>  |  rt:<tenant>:tenant
    const parts = channel.split(':');
    const tenantId = parts[1];
    if (!tenantId) return;
    if (parts[2] === 'tenant') {
      io.local.to(tenantRoomFor(tenantId)).emit(socketEvents.tenant, JSON.parse(message) as unknown);
      return;
    }
    const sessionId = parts[2];
    const kind = parts[3];
    if (!sessionId || !kind) return;
    const room = roomFor(tenantId, sessionId);
    const payload = JSON.parse(message) as unknown;
    if (kind === 'state') {
      // Snapshots são voláteis: clientes lentos perdem quadros em vez de acumular fila (backpressure).
      io.local.to(room).volatile.emit(socketEvents.state, payload);
    } else if (kind === 'events') {
      // Overlays não recebem o feed de eventos (dados desnecessários).
      for (const s of io.of('/').adapter.rooms.get(room) ?? []) {
        const sock = io.of('/').sockets.get(s);
        if (sock && (sock.data as SocketData).kind === 'dashboard') sock.emit(socketEvents.events, payload);
      }
    } else if (kind === 'status') {
      io.local.to(room).emit(socketEvents.status, payload);
    } else if (kind === 'fx') {
      io.local.to(room).emit(socketEvents.fx, payload);
    }
  });
  // Revogação de overlay: derruba sockets conectados com aquele token.
  await events.subscribe('la:overlay:revoked');
  events.on('message', (channel: string, message: string) => {
    if (channel !== 'la:overlay:revoked') return;
    const { overlayId } = JSON.parse(message) as { overlayId: string };
    for (const [, sock] of io.of('/').sockets) {
      if ((sock.data as SocketData).overlayId === overlayId) {
        sock.emit(socketEvents.error, { code: 'REVOKED' });
        sock.disconnect(true);
      }
    }
  });

  server.listen(PORT, process.env.REALTIME_HOST ?? '0.0.0.0');
  const stopHb = startHeartbeat(pub, identity, () => ({ connections: io.engine.clientsCount }));
  startEventLoopMonitor((lag) => logger.warn({ lagMs: Math.round(lag) }, 'event loop lento'));
  installProcessHandlers(logger, [
    async () => {
      await new Promise<void>((r) => io.close(() => r()));
    },
    stopHb,
    () => {
      pub.disconnect();
      sub.disconnect();
      events.disconnect();
      cmd.disconnect();
    },
    disconnectPrisma,
  ]);
  logger.info({ port: PORT }, 'realtime pronto');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'falha ao iniciar realtime');
  process.exit(1);
});
