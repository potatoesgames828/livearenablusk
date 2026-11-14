import type { BaseSnapshot, FxMarker } from '../types';
import { ParticleSystem } from './particles';
import { SoundFx } from './audio';

export type Quality = 'low' | 'medium' | 'high';

export interface RenderKit {
  particles: ParticleSystem;
  sound: SoundFx;
  reducedMotion: boolean;
  quality: Quality;
  shake(amount: number): void;
  flash(color: string, strength?: number): void;
}

export interface RenderView<S extends BaseSnapshot> {
  snap: S;
  prev: S | null;
  /** 0..1 — progresso entre o snapshot anterior e o atual. */
  alpha: number;
  /** Tempo de renderização (segundos, contínuo). */
  time: number;
  dt: number;
  kit: RenderKit;
}

export interface GameRenderer<S extends BaseSnapshot = BaseSnapshot> {
  draw(ctx: CanvasRenderingContext2D, view: RenderView<S>): void;
  onFx?(fx: FxMarker, kit: RenderKit, snap: S): void;
}

/** Mantém os dois últimos snapshots para interpolação suave. */
export class SnapshotBuffer<S extends BaseSnapshot> {
  private cur: { s: S; at: number } | null = null;
  private prev: { s: S; at: number } | null = null;
  private interval = 66;

  push(s: S, at = performance.now()): void {
    if (this.cur) {
      const gap = at - this.cur.at;
      if (gap > 5 && gap < 1000) this.interval = this.interval * 0.8 + gap * 0.2;
      // Troca de jogo ou de proporção: não interpola entre mundos diferentes.
      this.prev = this.cur.s.gameId === s.gameId && this.cur.s.aspect === s.aspect ? this.cur : null;
    }
    this.cur = { s, at };
  }

  sample(now = performance.now()): { snap: S; prev: S | null; alpha: number } | null {
    if (!this.cur) return null;
    const alpha = this.prev ? Math.min(1, Math.max(0, (now - this.cur.at) / this.interval)) : 1;
    return { snap: this.cur.s, prev: this.prev?.s ?? null, alpha };
  }

  get latest(): S | null {
    return this.cur?.s ?? null;
  }
}

/** Interpola entidades com id entre dois snapshots. */
export function interpolateEntities<T extends { id: number | string; x: number; y: number }>(
  prev: T[] | undefined,
  cur: T[],
  alpha: number,
): T[] {
  if (!prev || alpha >= 1) return cur;
  const map = new Map(prev.map((e) => [e.id, e]));
  return cur.map((e) => {
    const p = map.get(e.id);
    if (!p) return e;
    // Teleportes grandes (reposicionamento) não são interpolados.
    if (Math.abs(p.x - e.x) > 400 || Math.abs(p.y - e.y) > 400) return e;
    return { ...e, x: p.x + (e.x - p.x) * alpha, y: p.y + (e.y - p.y) * alpha };
  });
}

export interface StageOptions {
  maxFps?: number;
  quality?: Quality | 'auto';
  /** 'contain' para pré-visualização no painel; 'exact' para overlay de transmissão. */
  fit?: 'contain' | 'exact';
  soundEnabled?: boolean;
  background?: string;
}

/**
 * Palco de renderização em Canvas 2D: ajuste de resolução (DPR), escala
 * lógica (mundo 1080×1920 ou 1920×1080), limite de FPS, qualidade
 * adaptativa, pausa fora da tela e respeito a "reduzir movimento".
 */
export class Stage<S extends BaseSnapshot = BaseSnapshot> {
  readonly buffer = new SnapshotBuffer<S>();
  readonly kit: RenderKit;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private visible = true;
  private seenFx = new Set<number>();
  private shakeAmt = 0;
  private flashColor: string | null = null;
  private flashAlpha = 0;
  private frameTimes: number[] = [];
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private qualityMode: Quality | 'auto';
  fps = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private renderer: GameRenderer<S>,
    private readonly opts: StageOptions = {},
  ) {
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D não suportado neste navegador.');
    this.ctx = ctx;
    const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.qualityMode = opts.quality ?? 'auto';
    const sound = new SoundFx();
    sound.enabled = opts.soundEnabled ?? false;
    this.kit = {
      particles: new ParticleSystem(reducedMotion ? 150 : 600),
      sound,
      reducedMotion,
      quality: this.qualityMode === 'auto' ? 'high' : this.qualityMode,
      shake: (amount: number) => {
        if (!reducedMotion) this.shakeAmt = Math.min(40, this.shakeAmt + amount);
      },
      flash: (color: string, strength = 0.35) => {
        const s2 = reducedMotion ? strength * 0.3 : strength;
        this.flashColor = color;
        this.flashAlpha = Math.max(this.flashAlpha, s2);
      },
    };
    this.applyQuality();
  }

  setRenderer(r: GameRenderer<S>): void {
    this.renderer = r;
    this.seenFx.clear();
  }

  setSound(enabled: boolean): void {
    this.kit.sound.enabled = enabled;
  }

  private applyQuality(): void {
    const q = this.kit.quality;
    const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.dpr = Math.min(deviceDpr, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    this.kit.particles.setBudget(this.kit.reducedMotion ? 150 : q === 'high' ? 600 : q === 'medium' ? 300 : 120);
    this.resize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const parent = this.canvas.parentElement;
    if (typeof ResizeObserver !== 'undefined' && parent) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(parent);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
      });
      this.io.observe(this.canvas);
    }
    this.resize();
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const maxFps = this.opts.maxFps ?? 60;
      const minDelta = 1000 / maxFps - 1;
      const delta = now - this.last;
      if (delta < minDelta) return;
      this.last = now;
      if (!this.visible || (typeof document !== 'undefined' && document.hidden)) return;
      this.frame(Math.min(delta / 1000, 0.1), now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.kit.sound.dispose();
  }

  push(s: S): void {
    this.buffer.push(s);
    for (const fx of s.fx) {
      if (this.seenFx.has(fx.id)) continue;
      this.seenFx.add(fx.id);
      this.renderer.onFx?.(fx, this.kit, s);
    }
    if (this.seenFx.size > 2000) this.seenFx = new Set([...this.seenFx].slice(-500));
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    // O canvas ocupa 100% do contêiner via CSS (nunca dita o layout); aqui só
    // ajustamos a resolução interna ao tamanho real exibido.
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    const rect = parent.getBoundingClientRect();
    this.cssW = Math.max(1, Math.floor(rect.width));
    this.cssH = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
  }

  private adaptQuality(frameMs: number): void {
    if (this.qualityMode !== 'auto') return;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    const q = this.kit.quality;
    if (avg > 22 && q !== 'low') {
      this.kit.quality = q === 'high' ? 'medium' : 'low';
      this.applyQuality();
    } else if (avg < 8 && q !== 'high') {
      this.kit.quality = q === 'low' ? 'medium' : 'high';
      this.applyQuality();
    }
  }

  private frame(dt: number, now: number): void {
    const t0 = performance.now();
    this.time += dt;
    this.fps = this.fps * 0.9 + (1 / Math.max(dt, 0.001)) * 0.1;
    const ctx = this.ctx;
    const sample = this.buffer.sample(now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.opts.background ?? '#02040a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!sample) {
      this.drawWaiting();
      return;
    }
    const { snap } = sample;
    const scale = Math.min(this.canvas.width / snap.width, this.canvas.height / snap.height);
    const ox = (this.canvas.width - snap.width * scale) / 2;
    const oy = (this.canvas.height - snap.height * scale) / 2;
    let sx = 0;
    let sy = 0;
    if (this.shakeAmt > 0.5) {
      sx = (Math.random() - 0.5) * this.shakeAmt;
      sy = (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.pow(0.02, dt);
    }
    ctx.setTransform(scale, 0, 0, scale, ox + sx * scale, oy + sy * scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, snap.width, snap.height);
    ctx.clip();
    this.kit.particles.update(dt);
    try {
      this.renderer.draw(ctx, { snap, prev: sample.prev, alpha: sample.alpha, time: this.time, dt, kit: this.kit });
    } catch (err) {
      // Um erro de desenho não pode travar o loop; registramos e seguimos.
      console.error('[render]', err);
    }
    if (this.flashAlpha > 0.01 && this.flashColor) {
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, snap.width, snap.height);
      ctx.globalAlpha = 1;
      this.flashAlpha *= Math.pow(0.01, dt);
    }
    ctx.restore();
    this.adaptQuality(performance.now() - t0);
  }

  private drawWaiting(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${Math.max(14, Math.floor(w / 28))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const dots = '.'.repeat(1 + (Math.floor(this.time * 2) % 3));
    ctx.fillText(`Aguardando o jogo${dots}`, w / 2, h / 2);
  }
}
