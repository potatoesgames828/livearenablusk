/**
 * Utilitários de codificação de vídeo (FFmpeg) usados pelo Stream Manager.
 * Este pacote é puro (sem processos) para ser testável.
 */

export interface QualityProfile {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast';
}

/**
 * Perfis iniciais. Os bitrates seguem faixas usuais para H.264 em LIVE
 * (aprox. 0,07–0,1 bit/pixel/quadro). Ajuste conforme a capacidade do servidor,
 * a banda de upload e os limites vigentes da plataforma de destino.
 */
export const QUALITY_PROFILES: QualityProfile[] = [
  { id: 'v720p30', label: 'Vertical 720×1280 • 30fps', width: 720, height: 1280, fps: 30, videoBitrateKbps: 2500, audioBitrateKbps: 128, preset: 'veryfast' },
  { id: 'v1080p30', label: 'Vertical 1080×1920 • 30fps', width: 1080, height: 1920, fps: 30, videoBitrateKbps: 4500, audioBitrateKbps: 128, preset: 'veryfast' },
  { id: 'v1080p60', label: 'Vertical 1080×1920 • 60fps', width: 1080, height: 1920, fps: 60, videoBitrateKbps: 6500, audioBitrateKbps: 160, preset: 'superfast' },
  { id: 'h720p30', label: 'Horizontal 1280×720 • 30fps', width: 1280, height: 720, fps: 30, videoBitrateKbps: 2500, audioBitrateKbps: 128, preset: 'veryfast' },
  { id: 'h1080p30', label: 'Horizontal 1920×1080 • 30fps', width: 1920, height: 1080, fps: 30, videoBitrateKbps: 4500, audioBitrateKbps: 128, preset: 'veryfast' },
];

export interface EncoderInput {
  /** 'image2pipe' recebe quadros JPEG pelo stdin; 'testsrc' gera barras de teste. */
  kind: 'image2pipe' | 'testsrc';
  fps: number;
}

export interface EncoderOutput {
  /** rtmp(s)://… ou caminho de arquivo (.flv/.mp4) para gravação/teste. */
  target: string;
}

export interface EncoderSettings {
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  preset?: QualityProfile['preset'];
}

/** Monta os argumentos do FFmpeg (sem shell — evita injeção de comandos). */
export function buildFfmpegArgs(input: EncoderInput, output: EncoderOutput, s: EncoderSettings): string[] {
  const args: string[] = ['-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:1'];
  if (input.kind === 'image2pipe') {
    args.push('-f', 'image2pipe', '-framerate', String(input.fps), '-use_wallclock_as_timestamps', '1', '-i', 'pipe:0');
  } else {
    args.push('-re', '-f', 'lavfi', '-i', `testsrc2=size=${s.width}x${s.height}:rate=${s.fps}`);
  }
  // Áudio silencioso (plataformas costumam exigir uma faixa de áudio).
  args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  const gop = s.fps * 2; // keyframe a cada 2s (recomendação comum para LIVE)
  args.push(
    '-map', '0:v', '-map', '1:a',
    '-vf', `scale=${s.width}:${s.height}:force_original_aspect_ratio=decrease,pad=${s.width}:${s.height}:(ow-iw)/2:(oh-ih)/2,fps=${s.fps},format=yuv420p`,
    '-c:v', 'libx264', '-preset', s.preset ?? 'veryfast', '-tune', 'zerolatency',
    '-b:v', `${s.videoBitrateKbps}k`, '-maxrate', `${s.videoBitrateKbps}k`, '-bufsize', `${s.videoBitrateKbps * 2}k`,
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', `${s.audioBitrateKbps}k`, '-ar', '44100',
  );
  // O áudio silencioso é infinito: termina junto com o vídeo.
  args.push('-shortest');
  const isNetwork = /^rtmps?:\/\//i.test(output.target);
  if (isNetwork || output.target.endsWith('.flv')) args.push('-f', 'flv');
  // MP4 fragmentado: o arquivo continua reproduzível mesmo se o processo morrer.
  else if (output.target.endsWith('.mp4')) args.push('-movflags', '+frag_keyframe+empty_moov+default_base_moof');
  if (!isNetwork) args.push('-y');
  args.push(output.target);
  return args;
}

export interface EncoderProgress {
  frame?: number;
  fps?: number;
  bitrateKbps?: number;
  dropFrames?: number;
  dupFrames?: number;
  speed?: number;
  outTimeMs?: number;
  progress?: 'continue' | 'end';
}

/**
 * Lê blocos de `-progress pipe:1` (linhas chave=valor terminando em
 * progress=continue|end). Retorna um objeto por bloco completo.
 */
export class ProgressParser {
  private cur: Record<string, string> = {};
  private buf = '';

  push(chunk: string): EncoderProgress[] {
    this.buf += chunk;
    const out: EncoderProgress[] = [];
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq);
      const v = line.slice(eq + 1);
      this.cur[k] = v;
      if (k === 'progress') {
        out.push(toProgress(this.cur));
        this.cur = {};
      }
    }
    if (this.buf.length > 10_000) this.buf = '';
    return out;
  }
}

function toProgress(r: Record<string, string>): EncoderProgress {
  const n = (k: string) => {
    const v = Number(r[k]);
    return Number.isFinite(v) ? v : undefined;
  };
  const br = r.bitrate?.replace('kbits/s', '').trim();
  const bitrate = br && br !== 'N/A' ? Number(br) : undefined;
  return {
    frame: n('frame'),
    fps: n('fps'),
    bitrateKbps: Number.isFinite(bitrate) ? bitrate : undefined,
    dropFrames: n('drop_frames'),
    dupFrames: n('dup_frames'),
    speed: r.speed ? Number(r.speed.replace('x', '')) || undefined : undefined,
    outTimeMs: n('out_time_us') !== undefined ? Math.round((n('out_time_us') as number) / 1000) : undefined,
    progress: r.progress === 'end' ? 'end' : 'continue',
  };
}

export type StreamHealth = 'healthy' | 'degraded' | 'failing';

/** Classifica a saúde do encoder com base no progresso recente. */
export function assessHealth(p: EncoderProgress, targetFps: number): StreamHealth {
  if (p.fps === undefined) return 'degraded';
  if (p.fps < targetFps * 0.5 || (p.speed !== undefined && p.speed < 0.7)) return 'failing';
  if (p.fps < targetFps * 0.85 || (p.speed !== undefined && p.speed < 0.95)) return 'degraded';
  return 'healthy';
}

/** Remove a chave de transmissão de URLs antes de registrar em log. */
export function redactRtmpUrl(url: string): string {
  return url.replace(/^(rtmps?:\/\/[^/]+\/[^/]+\/).+$/i, '$1••••');
}
