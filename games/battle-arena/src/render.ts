import type { FxMarker } from '@live-arena/game-engine';
import {
  drawAvatar, drawMatchChrome, drawMatchTimer, glowCircle, hexToRgba, interpolateEntities, lookFromSeed, roundRect, shade, text,
  type GameRenderer, type RenderKit, type RenderView,
} from '@live-arena/game-engine/render';
import type { BattleSnapshot, FighterView } from './sim';

const RULES = ['Entre digitando o nome do time', 'Presentes = rajadas, vida e golens', 'Curtidas = fúria e meteoros'];

function drawArena(ctx: CanvasRenderingContext2D, s: BattleSnapshot, time: number): void {
  const { x0, y0, x1, y1, vertical } = s.arena;
  const W = s.width;
  const H = s.height;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(1, '#05070f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const [ta, tb] = s.teamsLive;
  // piso de pedra com metades coloridas
  ctx.save();
  roundRect(ctx, x0 - 30, y0 - 30, x1 - x0 + 60, y1 - y0 + 60, 48);
  ctx.fillStyle = '#1e2433';
  ctx.fill();
  ctx.clip();
  const tile = 90;
  for (let y = y0 - 30; y < y1 + 30; y += tile) {
    for (let x = x0 - 30; x < x1 + 30; x += tile) {
      const odd = ((x / tile) | 0) + ((y / tile) | 0);
      ctx.fillStyle = odd % 2 ? '#232a3b' : '#1b2130';
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }
  const tint = (team: number, a: number) => hexToRgba(s.teamsLive[team]?.color ?? '#ffffff', a);
  if (vertical) {
    const mid = (y0 + y1) / 2;
    let g = ctx.createLinearGradient(0, mid, 0, y1 + 30);
    g.addColorStop(0, tint(0, 0.05));
    g.addColorStop(1, tint(0, 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(x0 - 30, mid, x1 - x0 + 60, y1 - mid + 30);
    g = ctx.createLinearGradient(0, mid, 0, y0 - 30);
    g.addColorStop(0, tint(1, 0.05));
    g.addColorStop(1, tint(1, 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(x0 - 30, y0 - 30, x1 - x0 + 60, mid - y0 + 30);
    // linha central energizada
    ctx.strokeStyle = `rgba(250,250,250,${0.35 + Math.sin(time * 4) * 0.15})`;
    ctx.setLineDash([30, 20]);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x0 - 30, mid);
    ctx.lineTo(x1 + 30, mid);
    ctx.stroke();
  } else {
    const mid = (x0 + x1) / 2;
    let g = ctx.createLinearGradient(mid, 0, x0 - 30, 0);
    g.addColorStop(0, tint(0, 0.05));
    g.addColorStop(1, tint(0, 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(x0 - 30, y0 - 30, mid - x0 + 30, y1 - y0 + 60);
    g = ctx.createLinearGradient(mid, 0, x1 + 30, 0);
    g.addColorStop(0, tint(1, 0.05));
    g.addColorStop(1, tint(1, 0.3));
    ctx.fillStyle = g;
    ctx.fillRect(mid, y0 - 30, x1 - mid + 30, y1 - y0 + 60);
    ctx.strokeStyle = `rgba(250,250,250,${0.35 + Math.sin(time * 4) * 0.15})`;
    ctx.setLineDash([30, 20]);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(mid, y0 - 30);
    ctx.lineTo(mid, y1 + 30);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (s.sudden) {
    ctx.fillStyle = `rgba(249,115,22,${0.12 + Math.sin(time * 6) * 0.06})`;
    ctx.fillRect(x0 - 30, y0 - 30, x1 - x0 + 60, y1 - y0 + 60);
  }
  ctx.restore();
  // borda
  ctx.save();
  roundRect(ctx, x0 - 30, y0 - 30, x1 - x0 + 60, y1 - y0 + 60, 48);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.restore();
  // escudos de time (cúpula)
  for (const [i, t] of [ta, tb].entries()) {
    if (!t?.shield) continue;
    ctx.save();
    ctx.fillStyle = hexToRgba('#38bdf8', 0.08 + Math.sin(time * 8) * 0.03);
    if (vertical) {
      const mid = (y0 + y1) / 2;
      if (i === 0) ctx.fillRect(x0 - 30, mid, x1 - x0 + 60, y1 - mid + 30);
      else ctx.fillRect(x0 - 30, y0 - 30, x1 - x0 + 60, mid - y0 + 30);
    } else {
      const mid = (x0 + x1) / 2;
      if (i === 0) ctx.fillRect(x0 - 30, y0 - 30, mid - x0 + 30, y1 - y0 + 60);
      else ctx.fillRect(mid, y0 - 30, x1 - mid + 30, y1 - y0 + 60);
    }
    ctx.restore();
  }
}

function drawGolem(ctx: CanvasRenderingContext2D, f: FighterView, x: number, y: number, size: number, color: string, time: number): void {
  const u = size / 100;
  const step = Math.sin(f.ph) * (f.a === 'run' ? 1 : 0.2);
  const atk = f.a === 'attack' ? Math.sin(f.at * Math.PI) : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 50 * u, 12 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.scale(f.f, 1);
  const stone = '#78716c';
  const dark = '#44403c';
  // pernas
  ctx.fillStyle = dark;
  ctx.fillRect(-28 * u, -40 * u + step * 4 * u, 20 * u, 40 * u);
  ctx.fillRect(8 * u, -40 * u - step * 4 * u, 20 * u, 40 * u);
  // corpo
  ctx.fillStyle = stone;
  roundRect(ctx, -40 * u, -110 * u, 80 * u, 76 * u, 18 * u);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8 + Math.sin(time * 6) * 0.2;
  ctx.beginPath();
  ctx.arc(0, -74 * u, 12 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // braços (soco)
  ctx.fillStyle = dark;
  ctx.save();
  ctx.translate(40 * u, -96 * u);
  ctx.rotate(-0.4 - atk * 1.8);
  roundRect(ctx, -10 * u, 0, 24 * u, 70 * u, 10 * u);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(-40 * u, -96 * u);
  ctx.rotate(0.3);
  roundRect(ctx, -14 * u, 0, 24 * u, 64 * u, 10 * u);
  ctx.fill();
  ctx.restore();
  // cabeça
  ctx.fillStyle = stone;
  roundRect(ctx, -24 * u, -150 * u, 48 * u, 40 * u, 10 * u);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(-14 * u, -136 * u, 10 * u, 6 * u);
  ctx.fillRect(6 * u, -136 * u, 10 * u, 6 * u);
  ctx.restore();
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, x - w / 2, y, w, 10, 5);
  ctx.fill();
  ctx.fillStyle = hp > 50 ? '#22c55e' : hp > 25 ? '#eab308' : '#ef4444';
  roundRect(ctx, x - w / 2 + 1, y + 1, Math.max(0, (w - 2) * (hp / 100)), 8, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2 - 6, y, 4, 10);
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: BattleSnapshot['projectiles'][number], s: BattleSnapshot, time: number): void {
  const color = p.t >= 0 ? s.teamsLive[p.t]?.color ?? '#fff' : '#fbbf24';
  const ang = Math.atan2(p.vy, p.vx);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  switch (p.w) {
    case 'pistol':
      ctx.fillStyle = shade(color, 0.5);
      ctx.fillRect(-10, -3, 20, 6);
      break;
    case 'shotgun':
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'rocket':
      ctx.fillStyle = 'rgba(251,146,60,0.7)';
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-44 - Math.random() * 14, -7);
      ctx.lineTo(-44 - Math.random() * 14, 7);
      ctx.fill();
      ctx.fillStyle = '#e5e7eb';
      roundRect(ctx, -18, -7, 34, 14, 6);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(16, -7);
      ctx.lineTo(28, 0);
      ctx.lineTo(16, 7);
      ctx.fill();
      break;
    case 'cannon':
      glowCircle(ctx, 0, 0, 16, '#1f2937', 6);
      ctx.fillStyle = '#4b5563';
      ctx.beginPath();
      ctx.arc(-4, -4, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'nuke':
      ctx.rotate(-ang + Math.sin(time * 10) * 0.1);
      ctx.fillStyle = '#facc15';
      roundRect(ctx, -26, -14, 52, 28, 14);
      ctx.fill();
      ctx.fillStyle = '#111827';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 11, (i * Math.PI * 2) / 3, (i * Math.PI * 2) / 3 + 0.8);
        ctx.fill();
      }
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 30;
      break;
    case 'meteor':
      ctx.fillStyle = 'rgba(251,191,36,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(-90, 0);
      ctx.lineTo(0, 18);
      ctx.fill();
      glowCircle(ctx, 0, 0, 22, '#f97316', 24);
      break;
  }
  ctx.restore();
}

function drawScoreboard(ctx: CanvasRenderingContext2D, s: BattleSnapshot, time: number): void {
  const W = s.width;
  const vertical = s.aspect === 'vertical';
  const y = vertical ? 60 : 40;
  const w = vertical ? W - 80 : 1100;
  const x = (W - w) / 2;
  const h = vertical ? 200 : 150;
  ctx.save();
  roundRect(ctx, x, y, w, h, 32);
  ctx.fillStyle = 'rgba(8,12,28,0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  const [a, b] = s.teamsLive as [BattleSnapshot['teamsLive'][number], BattleSnapshot['teamsLive'][number]];
  const cy = y + (vertical ? 78 : 64);
  text(ctx, a.name.toUpperCase(), x + 40, cy, { size: vertical ? 40 : 38, weight: 900, color: a.color, maxWidth: w / 2 - 170 });
  text(ctx, b.name.toUpperCase(), x + w - 40, cy, { size: vertical ? 40 : 38, weight: 900, color: b.color, align: 'right', maxWidth: w / 2 - 170 });
  text(ctx, `${a.kills}`, W / 2 - 60, cy + 10, { size: 72, weight: 900, color: '#fff', align: 'right' });
  text(ctx, ':', W / 2, cy + 4, { size: 60, weight: 900, color: '#94a3b8', align: 'center' });
  text(ctx, `${b.kills}`, W / 2 + 60, cy + 10, { size: 72, weight: 900, color: '#fff', align: 'left' });
  const sub = (t: typeof a) => `${t.alive}/${t.total} vivos${t.rage ? ' · 🔥' : ''}${t.shield ? ' · 🛡️' : ''}`;
  text(ctx, sub(a), x + 40, cy + 44, { size: 26, weight: 700, color: '#cbd5e1' });
  text(ctx, sub(b), x + w - 40, cy + 44, { size: 26, weight: 700, color: '#cbd5e1', align: 'right' });
  // barra de progresso para o objetivo
  const by = y + h - 40;
  const bw = w - 80;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, x + 40, by, bw, 18, 9);
  ctx.fill();
  if (s.mode === 'kills') {
    const pa = Math.min(1, a.kills / s.killsToWin);
    const pb = Math.min(1, b.kills / s.killsToWin);
    ctx.fillStyle = a.color;
    roundRect(ctx, x + 40, by, (bw / 2) * pa, 18, 9);
    ctx.fill();
    ctx.fillStyle = b.color;
    roundRect(ctx, x + 40 + bw - (bw / 2) * pb, by, (bw / 2) * pb, 18, 9);
    ctx.fill();
    text(ctx, `META: ${s.killsToWin} ABATES`, W / 2, by - 8, { size: 20, weight: 800, color: '#94a3b8', align: 'center' });
  } else {
    const tot = Math.max(1, a.alive + b.alive);
    ctx.fillStyle = a.color;
    roundRect(ctx, x + 40, by, bw * (a.alive / tot), 18, 9);
    ctx.fill();
    ctx.fillStyle = b.color;
    roundRect(ctx, x + 40 + bw * (a.alive / tot), by, bw * (b.alive / tot), 18, 9);
    ctx.fill();
    text(ctx, s.mode === 'elimination' ? 'ELIMINAÇÃO' : 'POR TEMPO', W / 2, by - 8, { size: 20, weight: 800, color: '#94a3b8', align: 'center' });
  }
  drawMatchTimer(ctx, s, W / 2, y + h + 50, '#f43f5e');
  if (s.sudden) text(ctx, '☠️ MORTE SÚBITA', W / 2, y + h + 120, { size: 40, weight: 900, color: '#f97316', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
  void time;
}

function drawSideBoard(ctx: CanvasRenderingContext2D, s: BattleSnapshot): void {
  const vertical = s.aspect === 'vertical';
  if (!s.leaderboard.length || s.match.stage !== 'playing') return;
  const x = vertical ? 40 : 30;
  const y = vertical ? s.height - 230 : 240;
  const w = vertical ? s.width - 80 : 300;
  if (vertical) {
    // faixa horizontal com top 3
    ctx.save();
    roundRect(ctx, x, y, w, 70, 24);
    ctx.fillStyle = 'rgba(8,12,28,0.78)';
    ctx.fill();
    ctx.restore();
    const items = s.leaderboard.slice(0, 3);
    items.forEach((e, i) => {
      const cx = x + (w / 3) * i + 30;
      text(ctx, `${['🥇', '🥈', '🥉'][i]} ${e.name}`, cx, y + 46, { size: 26, weight: 800, color: '#f8fafc', maxWidth: w / 3 - 110 });
      text(ctx, String(e.score), cx + w / 3 - 50, y + 46, { size: 26, weight: 900, color: '#facc15', align: 'right' });
    });
    return;
  }
  ctx.save();
  roundRect(ctx, x, y, w, 60 + s.leaderboard.length * 44, 24);
  ctx.fillStyle = 'rgba(8,12,28,0.78)';
  ctx.fill();
  ctx.restore();
  text(ctx, 'TOP LUTADORES', x + 20, y + 38, { size: 22, weight: 900, color: '#cbd5e1' });
  s.leaderboard.forEach((e, i) => {
    text(ctx, `${i + 1}. ${e.name}`, x + 20, y + 80 + i * 44, { size: 24, weight: 700, color: '#f8fafc', maxWidth: w - 100 });
    text(ctx, String(e.score), x + w - 20, y + 80 + i * 44, { size: 24, weight: 900, color: '#facc15', align: 'right' });
  });
}

export const renderer: GameRenderer<BattleSnapshot> = {
  draw(ctx, { snap, prev, alpha, time, kit }: RenderView<BattleSnapshot>) {
    drawArena(ctx, snap, time);
    const fighters = interpolateEntities(prev?.fighters, snap.fighters, alpha);
    const n = fighters.filter((f) => !f.g).length;
    const crowd = n > 50 ? 0.62 : n > 30 ? 0.75 : n > 16 ? 0.88 : 1;
    const base = (snap.aspect === 'vertical' ? 120 : 108) * crowd;
    const baseHp = Math.min(...fighters.filter((f) => !f.g).map((f) => f.mh), 100);
    // ordem por profundidade (y)
    const sorted = [...fighters].sort((a, b) => a.y - b.y);
    for (const f of sorted) {
      const color = snap.teamsLive[f.t]?.color ?? '#fff';
      const grow = f.g ? 1.25 : 1 + Math.min(0.7, Math.max(0, f.mh / Math.max(1, baseHp) - 1) * 0.12);
      const size = base * grow;
      // anel do time no chão
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, f.a === 'dead' ? 0.2 : 0.75);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, size * 0.32, size * 0.09, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (f.g) drawGolem(ctx, f, f.x, f.y, size, color, time);
      else {
        const look = lookFromSeed(f.pid);
        drawAvatar(ctx, f.x, f.y, size, look, {
          facing: f.f, phase: f.ph, action: f.a, actionT: f.at, weapon: f.q ? 'staff' : 'sword', teamColor: color,
          crown: f.cr === 1, shield: f.sh === 1 && f.a !== 'dead', alpha: f.a === 'dead' ? 0.55 : 1,
        });
      }
      if (f.a === 'dead') continue;
      const top = f.y - size * (f.g ? 1.6 : 1.12);
      drawHpBar(ctx, f.x, top - 10, Math.max(70, size * 0.75), f.hp, color);
      text(ctx, f.n, f.x, top - 20, { size: Math.max(18, 22 * crowd), weight: 800, color: f.b ? '#cbd5e1' : '#fff', align: 'center', stroke: 'rgba(0,0,0,0.75)', maxWidth: 200 });
      if (f.q) text(ctx, `💥${f.q}`, f.x + size * 0.45, top + 12, { size: 22, weight: 900, color: '#fb923c', align: 'center', stroke: 'rgba(0,0,0,0.7)' });
    }
    for (const p of snap.projectiles) drawProjectile(ctx, p, snap, time);
    kit.particles.draw(ctx);
    drawScoreboard(ctx, snap, time);
    drawSideBoard(ctx, snap);
    // avisos (feed de abates)
    const vertical = snap.aspect === 'vertical';
    let ny = vertical ? snap.arena.y0 + 20 : snap.height - 300;
    const nx = vertical ? 60 : snap.width - 520;
    for (const nt of snap.notices.slice(-4)) {
      ctx.save();
      roundRect(ctx, nx, ny, vertical ? 560 : 480, 48, 16);
      ctx.fillStyle = 'rgba(8,12,28,0.72)';
      ctx.fill();
      ctx.fillStyle = nt.color;
      ctx.fillRect(nx, ny + 8, 6, 32);
      ctx.restore();
      text(ctx, nt.text, nx + 20, ny + 33, { size: 24, weight: 700, color: '#f8fafc', maxWidth: (vertical ? 560 : 480) - 30 });
      ny += 56;
    }
    drawMatchChrome(ctx, snap, { title: 'Battle Arena', accent: '#f43f5e', time, rules: RULES });
    if (snap.phase === 'paused') {
      ctx.fillStyle = 'rgba(2,4,10,0.6)';
      ctx.fillRect(0, 0, snap.width, snap.height);
      text(ctx, '⏸ PAUSADO', snap.width / 2, snap.height / 2, { size: 90, weight: 900, color: '#fff', align: 'center' });
    }
    if (snap.phase === 'stopped') {
      ctx.fillStyle = 'rgba(2,4,10,0.75)';
      ctx.fillRect(0, 0, snap.width, snap.height);
      text(ctx, 'AGUARDANDO INÍCIO', snap.width / 2, snap.height / 2, { size: 72, weight: 900, color: '#fff', align: 'center' });
    }
    if (snap.simulated) {
      ctx.save();
      roundRect(ctx, snap.width / 2 - 170, snap.height - 60, 340, 44, 22);
      ctx.fillStyle = 'rgba(234,179,8,0.85)';
      ctx.fill();
      ctx.restore();
      text(ctx, 'MODO DEMONSTRAÇÃO', snap.width / 2, snap.height - 30, { size: 22, weight: 900, color: '#1c1917', align: 'center' });
    }
  },
  onFx(fx: FxMarker, kit: RenderKit, snap: BattleSnapshot) {
    const shake = snap.shake;
    switch (fx.kind) {
      case 'boom':
        kit.particles.burst(fx.x, fx.y, '#fb923c', 30, 520);
        kit.particles.burst(fx.x, fx.y, '#fde047', 16, 300);
        kit.sound.play('boom', 90);
        if (shake) kit.shake(8);
        break;
      case 'meteor':
        kit.particles.burst(fx.x, fx.y, '#f97316', 34, 600);
        kit.sound.play('boom', 90);
        if (shake) kit.shake(10);
        break;
      case 'nuke':
        kit.particles.burst(fx.x, fx.y, '#facc15', 90, 1100);
        kit.particles.burst(fx.x, fx.y, '#ffffff', 50, 700);
        kit.flash('#fff7ed', 0.8);
        kit.sound.play('boom', 0);
        if (shake) kit.shake(28);
        break;
      case 'death':
        kit.particles.burst(fx.x, fx.y, fx.color ?? '#fff', 26, 420);
        kit.sound.play('hit', 50);
        break;
      case 'spawn':
      case 'golem':
        kit.particles.burst(fx.x, fx.y - 40, fx.color ?? '#fff', fx.kind === 'golem' ? 40 : 14, 300);
        kit.sound.play('pop', 80);
        break;
      case 'grow':
      case 'heal':
        kit.particles.burst(fx.x, fx.y, fx.kind === 'heal' ? '#4ade80' : fx.color ?? '#a3e635', 12, 220);
        kit.sound.play('power', 120);
        break;
      case 'smash':
        kit.particles.burst(fx.x, fx.y, '#a8a29e', 20, 380);
        if (shake) kit.shake(5);
        break;
      case 'spark':
        kit.particles.burst(fx.x, fx.y, '#fde68a', 6, 200);
        break;
      case 'block':
        kit.particles.burst(fx.x, fx.y, '#38bdf8', 6, 160);
        break;
      case 'shot':
        kit.sound.play('pop', 70);
        break;
      case 'victory':
        kit.particles.confetti(snap.width / 2, snap.height * 0.3, [fx.color ?? '#facc15', '#ffffff', '#facc15'], 140);
        kit.sound.play('win', 0);
        break;
      case 'fight':
      case 'sudden':
        kit.flash(fx.kind === 'sudden' ? '#f97316' : '#f43f5e', 0.35);
        kit.sound.play('power', 0);
        break;
    }
  },
};
