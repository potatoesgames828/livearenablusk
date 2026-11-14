import type { BaseSnapshot } from '../types';

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function glowCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, glow = 24): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const FONT_STACK = `"Inter", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif`;

export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  opts: { size?: number; weight?: number; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; stroke?: string; maxWidth?: number } = {},
): void {
  ctx.save();
  ctx.font = `${opts.weight ?? 700} ${opts.size ?? 32}px ${FONT_STACK}`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.baseline ?? 'alphabetic';
  if (opts.stroke) {
    ctx.lineWidth = Math.max(3, (opts.size ?? 32) / 7);
    ctx.strokeStyle = opts.stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(value, x, y, opts.maxWidth);
  }
  ctx.fillStyle = opts.color ?? '#fff';
  ctx.fillText(value, x, y, opts.maxWidth);
  ctx.restore();
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Fundo padrão com gradiente e grade sutil. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, snap: BaseSnapshot, time: number, grid = 90): void {
  const { width: W, height: H, theme } = snap;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, theme.background);
  g.addColorStop(1, '#02040a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W * 0.5, H * 0.35, 50, W * 0.5, H * 0.35, Math.max(W, H) * 0.8);
  rg.addColorStop(0, hexToRgba(theme.secondary, 0.22));
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  if (grid > 0) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(theme.primary, 0.07);
    ctx.lineWidth = 2;
    const off = (time * 20) % grid;
    ctx.beginPath();
    for (let x = 0; x <= W; x += grid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = -grid + off; y <= H; y += grid) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * HUD padrão: título/rodada, ranking, avisos e faixa de demonstração.
 * O layout se adapta a 9:16 e 16:9.
 */
export function drawHud(ctx: CanvasRenderingContext2D, snap: BaseSnapshot, title: string, accent: string, time: number): void {
  const { width: W, height: H } = snap;
  const vertical = snap.aspect === 'vertical';
  const pad = vertical ? 40 : 36;

  // Título + rodada
  ctx.save();
  roundRect(ctx, pad, pad, vertical ? 560 : 520, 96, 24);
  ctx.fillStyle = 'rgba(8,12,28,0.72)';
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.6);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  text(ctx, title.toUpperCase(), pad + 28, pad + 48, { size: 38, weight: 900, color: '#fff' });
  text(ctx, `RODADA ${snap.round}`, pad + 28, pad + 80, { size: 22, weight: 700, color: accent });

  // Ranking
  const lbW = vertical ? 420 : 420;
  const lbX = W - lbW - pad;
  const lbY = pad;
  const rows = snap.leaderboard.length;
  const lbH = 70 + Math.max(1, rows) * 52;
  ctx.save();
  roundRect(ctx, lbX, lbY, lbW, lbH, 24);
  ctx.fillStyle = 'rgba(8,12,28,0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  text(ctx, 'RANKING', lbX + 24, lbY + 44, { size: 24, weight: 900, color: '#cbd5e1' });
  if (rows === 0) {
    text(ctx, 'Interaja para pontuar!', lbX + 24, lbY + 96, { size: 22, weight: 600, color: '#94a3b8' });
  }
  const medals = ['#facc15', '#e2e8f0', '#f59e0b'];
  snap.leaderboard.forEach((e, i) => {
    const y = lbY + 96 + i * 52;
    text(ctx, `${i + 1}`, lbX + 28, y, { size: 26, weight: 900, color: medals[i] ?? '#94a3b8' });
    text(ctx, e.name, lbX + 64, y, { size: 26, weight: 700, color: '#f8fafc', maxWidth: lbW - 190 });
    text(ctx, String(e.score), lbX + lbW - 24, y, { size: 26, weight: 800, color: accent, align: 'right' });
  });

  // Avisos (feed)
  const nx = pad;
  let ny = vertical ? H - 360 : H - 300;
  for (const n of snap.notices.slice(-4)) {
    ctx.save();
    ctx.font = `700 28px ${FONT_STACK}`;
    const w = Math.min(ctx.measureText(n.text).width + 48, W - pad * 2);
    roundRect(ctx, nx, ny, w, 56, 18);
    ctx.fillStyle = 'rgba(8,12,28,0.78)';
    ctx.fill();
    ctx.fillStyle = n.color;
    ctx.fillRect(nx, ny + 10, 6, 36);
    ctx.restore();
    text(ctx, n.text, nx + 24, ny + 38, { size: 28, weight: 700, color: '#f8fafc', maxWidth: W - pad * 2 - 48 });
    ny += 66;
  }

  if (snap.phase === 'intermission') {
    ctx.save();
    ctx.fillStyle = 'rgba(2,4,10,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const pulse = 1 + Math.sin(time * 4) * 0.03;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(pulse, pulse);
    text(ctx, 'PRÓXIMA RODADA', 0, -30, { size: vertical ? 72 : 80, weight: 900, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
    text(ctx, `em ${snap.phaseEndsIn ?? 0}s`, 0, 50, { size: 48, weight: 800, color: accent, align: 'center' });
    ctx.restore();
  }
  if (snap.phase === 'paused') {
    ctx.save();
    ctx.fillStyle = 'rgba(2,4,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    text(ctx, '⏸ PAUSADO', W / 2, H / 2, { size: 90, weight: 900, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
  }
  if (snap.phase === 'stopped') {
    ctx.save();
    ctx.fillStyle = 'rgba(2,4,10,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    text(ctx, 'AGUARDANDO INÍCIO', W / 2, H / 2, { size: 72, weight: 900, color: '#fff', align: 'center' });
  }

  if (snap.simulated) {
    ctx.save();
    roundRect(ctx, W / 2 - 170, H - 70, 340, 44, 22);
    ctx.fillStyle = 'rgba(234,179,8,0.85)';
    ctx.fill();
    ctx.restore();
    text(ctx, 'MODO DEMONSTRAÇÃO', W / 2, H - 40, { size: 22, weight: 900, color: '#1c1917', align: 'center' });
  }
}
