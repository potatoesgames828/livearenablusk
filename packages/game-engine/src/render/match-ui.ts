import type { MatchBaseSnapshot, PodiumEntry } from '../match';
import { drawAvatar, hashSeed, lookFromSeed } from './characters';
import { hexToRgba, roundRect, text } from './draw';

const imgCache = new Map<string, HTMLImageElement | null>();

/** Foto de perfil (se carregável) ou iniciais com cor derivada do id. */
export function drawAvatarBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, e: { id: string; name: string; avatarUrl?: string }, ring?: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  const hue = hashSeed(e.id) % 360;
  ctx.fillStyle = `hsl(${hue} 70% 45%)`;
  ctx.fill();
  let drawn = false;
  if (e.avatarUrl && typeof Image !== 'undefined') {
    let img = imgCache.get(e.avatarUrl);
    if (img === undefined) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      const url = e.avatarUrl;
      img.onerror = () => imgCache.set(url, null);
      img.src = url;
      imgCache.set(url, img);
      if (imgCache.size > 400) imgCache.delete(imgCache.keys().next().value as string);
    }
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.clip();
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      drawn = true;
    }
  }
  ctx.restore();
  if (!drawn) {
    const initials = e.name.replace(/^Bot /, '').trim().slice(0, 2).toUpperCase();
    text(ctx, initials, x, y + r * 0.36, { size: r, weight: 900, color: '#fff', align: 'center' });
  }
  if (ring) {
    ctx.save();
    ctx.strokeStyle = ring;
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, 36);
  ctx.fillStyle = 'rgba(8,12,28,0.86)';
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.7);
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

export interface MatchChromeOpts {
  title: string;
  accent: string;
  time: number;
  /** linha extra com as regras resumidas mostradas no lobby */
  rules?: string[];
}

/** Barra de tempo da partida (topo). */
export function drawMatchTimer(ctx: CanvasRenderingContext2D, snap: MatchBaseSnapshot, x: number, y: number, accent: string): void {
  const m = snap.match;
  if (m.stage !== 'playing' || m.endsIn === undefined) return;
  const mm = Math.floor(m.endsIn / 60);
  const ss = String(m.endsIn % 60).padStart(2, '0');
  ctx.save();
  roundRect(ctx, x - 90, y - 40, 180, 60, 30);
  ctx.fillStyle = m.endsIn <= 10 ? 'rgba(220,38,38,0.85)' : 'rgba(8,12,28,0.8)';
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.6);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  text(ctx, `${mm}:${ss}`, x, y + 2, { size: 38, weight: 900, color: '#fff', align: 'center' });
}

/** Telas de lobby e de resultado, comuns a todos os jogos de partida. */
export function drawMatchChrome(ctx: CanvasRenderingContext2D, snap: MatchBaseSnapshot, o: MatchChromeOpts): void {
  const m = snap.match;
  const W = snap.width;
  const H = snap.height;
  const vertical = snap.aspect === 'vertical';
  if (snap.phase !== 'playing') return;
  if (m.stage === 'lobby') {
    const w = vertical ? W - 120 : 1100;
    const h = vertical ? 900 : 920;
    const x = (W - w) / 2;
    const y = vertical ? H * 0.2 : (H - h) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(2,4,10,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    panel(ctx, x, y, w, h, o.accent);
    text(ctx, o.title.toUpperCase(), W / 2, y + 96, { size: vertical ? 72 : 70, weight: 900, color: '#fff', align: 'center', maxWidth: w - 60 });
    const pulse = 1 + Math.sin(o.time * 5) * 0.04;
    ctx.save();
    ctx.translate(W / 2, y + 200);
    ctx.scale(pulse, pulse);
    text(ctx, m.joinHint.toUpperCase(), 0, 0, { size: vertical ? 44 : 42, weight: 900, color: o.accent, align: 'center', maxWidth: w - 60 });
    ctx.restore();
    const status = m.waitingManualStart
      ? 'Aguardando o criador iniciar'
      : m.participants < m.minToStart
        ? `Aguardando jogadores (${m.participants}/${m.minToStart})`
        : `Começa em ${m.endsIn ?? 0}s`;
    text(ctx, status, W / 2, y + 290, { size: 48, weight: 800, color: '#f8fafc', align: 'center' });
    text(ctx, `${m.participants}/${m.max} participantes`, W / 2, y + 350, { size: 32, weight: 700, color: '#94a3b8', align: 'center' });
    if (m.teams) {
      const tw = (w - 120) / m.teams.length;
      m.teams.forEach((t, i) => {
        const tx = x + 60 + i * tw;
        ctx.save();
        roundRect(ctx, tx + 10, y + 390, tw - 20, 100, 24);
        ctx.fillStyle = hexToRgba(t.color, 0.25);
        ctx.fill();
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        text(ctx, t.name.toUpperCase(), tx + tw / 2, y + 436, { size: 34, weight: 900, color: '#fff', align: 'center', maxWidth: tw - 40 });
        text(ctx, `${t.count} jogadores · ${t.wins} vitórias`, tx + tw / 2, y + 474, { size: 24, weight: 700, color: '#e2e8f0', align: 'center', maxWidth: tw - 40 });
      });
    }
    // últimos inscritos
    const ry = y + (m.teams ? 540 : 420);
    text(ctx, m.recent.length ? 'ACABARAM DE ENTRAR' : 'Seja o primeiro a entrar!', W / 2, ry, { size: 26, weight: 800, color: '#cbd5e1', align: 'center' });
    const n = Math.min(m.recent.length, vertical ? 6 : 8);
    const gap = Math.min(150, (w - 80) / Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const e = m.recent[i]!;
      const cx = W / 2 + (i - (n - 1) / 2) * gap;
      const ring = e.team !== undefined && m.teams ? m.teams[e.team]?.color : o.accent;
      drawAvatarBadge(ctx, cx, ry + 80, 46, e, ring);
      text(ctx, e.name, cx, ry + 160, { size: 22, weight: 700, color: '#f8fafc', align: 'center', maxWidth: gap - 10 });
    }
    if (o.rules?.length) {
      o.rules.slice(0, 3).forEach((r, i) => text(ctx, `• ${r}`, x + 50, y + h - 130 + i * 40, { size: 26, weight: 600, color: '#cbd5e1', maxWidth: w - 100 }));
    }
    return;
  }
  if (m.stage === 'results') {
    ctx.save();
    ctx.fillStyle = 'rgba(2,4,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const cy = vertical ? H * 0.32 : H * 0.2;
    const winColor = m.winnerTeam !== undefined && m.teams ? m.teams[m.winnerTeam]?.color ?? o.accent : '#facc15';
    text(ctx, m.resultTitle ?? 'Fim de partida', W / 2, cy, { size: vertical ? 78 : 84, weight: 900, color: winColor, align: 'center', stroke: 'rgba(0,0,0,0.7)', maxWidth: W - 80 });
    if (m.resultSubtitle) text(ctx, m.resultSubtitle, W / 2, cy + 70, { size: 38, weight: 700, color: '#e2e8f0', align: 'center', maxWidth: W - 80 });
    drawPodium(ctx, m.podium, W / 2, vertical ? H * 0.72 : H * 0.8, vertical ? 1 : 0.85, o.time, m.teams);
    text(ctx, `Próxima partida em ${m.endsIn ?? 0}s`, W / 2, vertical ? H * 0.82 : H * 0.87, { size: 34, weight: 800, color: '#94a3b8', align: 'center' });
  }
}

export function drawPodium(ctx: CanvasRenderingContext2D, podium: PodiumEntry[], cx: number, baseY: number, scale: number, time: number, teams?: Array<{ color: string }>): void {
  const slots = [
    { idx: 1, dx: -280, h: 230, color: '#cbd5e1', label: '2º' },
    { idx: 0, dx: 0, h: 300, color: '#facc15', label: '1º' },
    { idx: 2, dx: 280, h: 190, color: '#f59e0b', label: '3º' },
  ];
  for (const sl of slots) {
    const e = podium[sl.idx];
    const x = cx + sl.dx * scale;
    const w = 240 * scale;
    const h = sl.h * scale;
    ctx.save();
    const g = ctx.createLinearGradient(0, baseY - h, 0, baseY);
    g.addColorStop(0, sl.color);
    g.addColorStop(1, hexToRgba(sl.color, 0.35));
    ctx.fillStyle = g;
    roundRect(ctx, x - w / 2, baseY - h, w, h, 18);
    ctx.fill();
    ctx.restore();
    text(ctx, sl.label, x, baseY - h + 70 * scale, { size: 64 * scale, weight: 900, color: '#1c1917', align: 'center' });
    if (!e) continue;
    const look = lookFromSeed(e.id);
    drawAvatar(ctx, x, baseY - h - 4, 190 * scale, look, { action: 'cheer', phase: time * 6 + sl.idx, crown: sl.idx === 0, teamColor: e.team !== undefined ? teams?.[e.team]?.color : undefined });
    drawAvatarBadge(ctx, x, baseY - h - 250 * scale, 40 * scale, e, sl.color);
    text(ctx, e.name, x, baseY - h + 130 * scale, { size: 30 * scale, weight: 900, color: '#0f172a', align: 'center', maxWidth: w - 20 });
    text(ctx, String(e.score), x, baseY - h + 172 * scale, { size: 30 * scale, weight: 800, color: '#0f172a', align: 'center' });
  }
}
