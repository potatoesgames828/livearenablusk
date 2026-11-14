import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Redis } from 'ioredis';
import { chromium, type Browser, type CDPSession, type Page } from 'playwright-core';
import { buildFfmpegArgs, ProgressParser, assessHealth, redactRtmpUrl, type EncoderProgress } from '@live-arena/stream-engine';
import { decryptSecret, generateOpaqueToken } from '@live-arena/security';
import { getPrisma, toJson } from '@live-arena/database';
import { keys, Lease, raiseAlert, updateSessionStatus, resolveAlerts } from '@live-arena/runtime';
import { metrics, type Logger } from '@live-arena/observability';
import type { StreamState } from '@live-arena/shared';

const INTERNAL_WEB_URL = process.env.INTERNAL_WEB_URL ?? 'http://127.0.0.1:3000';
const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? path.resolve('recordings');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
const MAX_RESTARTS = 5;

/**
 * Pipeline de vídeo de UMA sessão:
 *   renderer (Chromium headless abrindo o overlay) → quadros JPEG (CDP screencast)
 *   → FFmpeg (H.264/AAC) → RTMP autorizado ou arquivo (gravação).
 * Renderer e encoder são processos separados e monitorados; falhas reiniciam
 * apenas o componente afetado, com limite de tentativas.
 */
export class StreamPipeline {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private ffmpeg: ChildProcessWithoutNullStreams | null = null;
  private parser = new ProgressParser();
  private restarts = 0;
  private stopped = false;
  private processId = '';
  private overlayId = '';
  private lastProgress: EncoderProgress = {};
  private lastFrameAt = 0;
  private frames = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private lastDbWrite = 0;
  private target = '';
  private settings = { width: 1080, height: 1920, fps: 30, videoBitrateKbps: 4500, audioBitrateKbps: 128 };
  private state: StreamState = 'STARTING';

  constructor(
    readonly tenantId: string,
    readonly sessionId: string,
    private readonly redis: Redis,
    private readonly lease: Lease,
    private readonly log: Logger,
    private readonly onFinished: (id: string) => void,
  ) {}

  async start(): Promise<void> {
    const prisma = getPrisma();
    const s = await prisma.liveSession.findFirst({ where: { id: this.sessionId, tenantId: this.tenantId }, include: { streamConfig: true } });
    if (!s?.streamConfig) throw new Error('sessão sem saída de vídeo configurada');
    const cfg = s.streamConfig;
    this.settings = { width: cfg.width, height: cfg.height, fps: cfg.fps, videoBitrateKbps: cfg.videoBitrateKbps, audioBitrateKbps: cfg.audioBitrateKbps };
    if (cfg.mode === 'RTMP') {
      if (!cfg.rtmpUrl || !cfg.streamKeyEnc) throw new Error('RTMP sem URL ou chave');
      this.target = `${cfg.rtmpUrl.replace(/\/$/, '')}/${decryptSecret(cfg.streamKeyEnc)}`;
    } else {
      // Gravação local isolada por tenant.
      const dir = path.join(RECORDINGS_DIR, this.tenantId);
      mkdirSync(dir, { recursive: true });
      this.target = path.join(dir, `${this.sessionId}-${Date.now()}.mp4`);
    }
    const proc = await prisma.streamProcess.create({ data: { tenantId: this.tenantId, sessionId: this.sessionId, streamConfigId: cfg.id, status: 'STARTING', workerId: this.lease.token } });
    this.processId = proc.id;
    // Overlay interno de curta duração (revogado ao parar).
    const t = generateOpaqueToken('ovl', 32);
    const overlay = await prisma.overlay.create({
      data: { tenantId: this.tenantId, sessionId: this.sessionId, name: 'Stream Manager (interno)', tokenHash: t.hash, tokenPrefix: t.prefix, expiresAt: new Date(Date.now() + 24 * 3600_000) },
    });
    this.overlayId = overlay.id;
    await this.setState('STARTING');
    await this.startRenderer(`${INTERNAL_WEB_URL}/overlay/${this.sessionId}?token=${encodeURIComponent(t.token)}&capture=1`);
    this.startEncoder();
    this.watchdog = setInterval(() => void this.checkHealth(), 2000);
  }

  private async startRenderer(url: string): Promise<void> {
    this.browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    });
    this.browser.on('disconnected', () => {
      if (!this.stopped) void this.recover('renderer', 'navegador do renderer encerrou');
    });
    this.page = await this.browser.newPage({ viewport: { width: this.settings.width, height: this.settings.height }, deviceScaleFactor: 1 });
    this.page.on('crash', () => void this.recover('renderer', 'página do renderer travou'));
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number }) => {
      void this.cdp?.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
      this.lastFrameAt = Date.now();
      this.frames++;
      if (this.ffmpeg?.stdin.writable && !this.ffmpeg.stdin.writableNeedDrain) {
        this.ffmpeg.stdin.write(Buffer.from(f.data, 'base64'));
      } else {
        metrics.eventsDropped.inc({ type: 'video_frame', reason: 'encoder_backpressure' });
      }
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: this.settings.width, maxHeight: this.settings.height, everyNthFrame: 1 });
  }

  private startEncoder(): void {
    const args = buildFfmpegArgs({ kind: 'image2pipe', fps: this.settings.fps }, { target: this.target }, { ...this.settings, preset: 'veryfast' });
    this.log.info({ sessionId: this.sessionId, target: redactRtmpUrl(this.target) }, 'iniciando encoder');
    const ff = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.ffmpeg = ff;
    ff.stdin.on('error', () => undefined);
    ff.stdout.on('data', (chunk: Buffer) => {
      for (const p of this.parser.push(chunk.toString())) void this.onProgress(p);
    });
    let errTail = '';
    ff.stderr.on('data', (chunk: Buffer) => {
      errTail = (errTail + chunk.toString()).slice(-2000);
    });
    ff.on('exit', (code, signal) => {
      if (this.ffmpeg !== ff) return;
      this.ffmpeg = null;
      if (!this.stopped) {
        // Nunca registra a chave de transmissão.
        const tail = errTail.replaceAll(this.target, redactRtmpUrl(this.target)).slice(-300);
        void this.recover('encoder', `encoder saiu (code=${code} signal=${signal}) ${tail}`);
      }
    });
  }

  private async onProgress(p: EncoderProgress): Promise<void> {
    if (this.stopped) return; // durante o encerramento o FPS cai naturalmente
    this.lastProgress = p;
    if (p.fps !== undefined) metrics.streamFps.set({ session: this.sessionId }, p.fps);
    if (p.bitrateKbps !== undefined) metrics.streamBitrate.set({ session: this.sessionId }, p.bitrateKbps);
    const health = assessHealth(p, this.settings.fps);
    const stats = { ...p, health, restarts: this.restarts, target: this.target.startsWith('rtmp') ? redactRtmpUrl(this.target) : path.basename(this.target), at: Date.now() };
    await this.redis.set(keys.streamStats(this.sessionId), JSON.stringify(stats), 'EX', 60).catch(() => undefined);
    const next: StreamState = health === 'healthy' ? 'LIVE' : 'DEGRADED';
    if (next !== this.state) await this.setState(next, health === 'healthy' ? undefined : 'Encoder abaixo do FPS alvo (CPU ou rede insuficiente).');
    if (Date.now() - this.lastDbWrite > 10_000) {
      this.lastDbWrite = Date.now();
      await getPrisma().streamProcess.update({ where: { id: this.processId }, data: { status: next, lastStats: toJson(stats), restarts: this.restarts } }).catch(() => undefined);
      if (health === 'healthy') await resolveAlerts('STREAM_DEGRADED', 'stream-manager', this.sessionId);
      else await raiseAlert({ tenantId: this.tenantId, sessionId: this.sessionId, severity: 'WARNING', component: 'stream-manager', code: 'STREAM_DEGRADED', message: `FPS do encoder: ${p.fps ?? '?'} (alvo ${this.settings.fps}).` });
    }
  }

  private async checkHealth(): Promise<void> {
    if (this.stopped) return;
    // Renderer congelado: sem quadros novos por 10s (o jogo sempre anima).
    if (this.lastFrameAt && Date.now() - this.lastFrameAt > 10_000) await this.recover('renderer', 'renderer sem quadros há 10s');
  }

  private async recover(component: 'renderer' | 'encoder', reason: string): Promise<void> {
    if (this.stopped) return;
    this.restarts++;
    metrics.streamRestarts.inc({ reason: component });
    this.log.warn({ sessionId: this.sessionId, component, reason, restarts: this.restarts }, 'recuperando pipeline de vídeo');
    if (this.restarts > MAX_RESTARTS) {
      await raiseAlert({ tenantId: this.tenantId, sessionId: this.sessionId, severity: 'CRITICAL', component: 'stream-manager', code: 'STREAM_FAILED', message: `Transmissão interrompida após ${MAX_RESTARTS} tentativas: ${reason}` });
      await this.setState('ERROR', 'A transmissão falhou repetidamente. Verifique a URL/chave RTMP e a capacidade do servidor.');
      await this.stop(false);
      return;
    }
    await this.setState('RESTARTING', `Reiniciando ${component === 'renderer' ? 'renderizador' : 'encoder'}…`);
    await new Promise((r) => setTimeout(r, Math.min(10_000, 1000 * 2 ** (this.restarts - 1))));
    if (this.stopped) return;
    try {
      if (component === 'encoder') {
        this.startEncoder();
      } else {
        const url = this.page?.url();
        await this.browser?.close().catch(() => undefined);
        this.lastFrameAt = 0;
        if (url) await this.startRenderer(url);
      }
    } catch (err) {
      await this.recover(component, (err as Error).message);
    }
  }

  private async setState(state: StreamState, message?: string): Promise<void> {
    this.state = state;
    await updateSessionStatus(this.redis, this.tenantId, this.sessionId, { streamState: state, message }).catch(() => undefined);
  }

  async stop(graceful = true): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.watchdog) clearInterval(this.watchdog);
    await this.cdp?.send('Page.stopScreencast').catch(() => undefined);
    const ff = this.ffmpeg;
    this.ffmpeg = null;
    if (ff) {
      // Fecha o stdin para o FFmpeg finalizar o arquivo/stream corretamente.
      ff.stdin.end();
      await new Promise<void>((resolve) => {
        // SIGINT faz o FFmpeg finalizar o arquivo/stream; SIGKILL só como último recurso.
        const soft = setTimeout(() => ff.kill('SIGINT'), 3000);
        const hard = setTimeout(() => {
          ff.kill('SIGKILL');
          resolve();
        }, 10_000);
        ff.once('exit', () => {
          clearTimeout(soft);
          clearTimeout(hard);
          resolve();
        });
      });
    }
    await this.browser?.close().catch(() => undefined);
    const prisma = getPrisma();
    if (this.overlayId) await prisma.overlay.update({ where: { id: this.overlayId }, data: { revokedAt: new Date() } }).catch(() => undefined);
    if (this.processId) {
      await prisma.streamProcess
        .update({ where: { id: this.processId }, data: { status: graceful ? 'STOPPED' : 'ERROR', endedAt: new Date(), lastStats: toJson({ ...this.lastProgress, frames: this.frames, output: this.target.startsWith('rtmp') ? null : this.target }) } })
        .catch(() => undefined);
    }
    if (graceful) await this.setState('STOPPED');
    await this.lease.release();
    this.onFinished(this.sessionId);
  }

  status() {
    return { sessionId: this.sessionId, state: this.state, frames: this.frames, restarts: this.restarts, fps: this.lastProgress.fps };
  }
}
