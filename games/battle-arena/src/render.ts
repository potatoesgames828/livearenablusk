import type { FxMarker } from '@live-arena/game-engine';
import {
  drawBackdrop, drawHud, glowCircle, roundRect, text, interpolateEntities,
  type GameRenderer, type RenderKit, type RenderView,
} from '@live-arena/game-engine/render';
import type { BattleSnapshot, Team } from './sim';

const COLORS: Record<Team, { main: string; dark: string; light: string }> = {
  red: { main: '#f43f5e', dark: '#881337', light: '#fda4af' },
  blue: { main: '#3b82f6', dark: '#1e3a8a', light: '#93c5fd' },
};

function drawChampion(ctx: CanvasRenderingContext2D, c: BattleSnapshot['champs'][number], time: number): void {
  const col = COLORS[c.team];
  const bob = Math.sin(time * 3 + (c.team === 'red' ? 0 : 1.5)) * 10;
  const x = c.x + (c.hit > 0 ? (Math.random() - 0.5) * 16 : 0);
  const y = c.y + bob;
  const scale = 1 + c.anim * 0.4;
  // sombra
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 120, 110, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // aura
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 20, x, y, 200);
  g.addColorStop(0, col.main + 'aa');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // corpo (cristal estilizado)
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.shadowColor = col.main;
  ctx.shadowBlur = 40;
  const body = ctx.createLinearGradient(0, -110, 0, 110);
  body.addColorStop(0, col.light);
  body.addColorStop(0.5, col.main);
  body.addColorStop(1, col.dark);
  ctx.fillStyle = c.hit > 0 ? '#ffffff' : body;
  ctx.beginPath();
  ctx.moveTo(0, -120);
  ctx.lineTo(80, -20);
  ctx.lineTo(50, 100);
  ctx.lineTo(-50, 100);
  ctx.lineTo(-80, -20);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-24, -30, 12, 0, Math.PI * 2);
  ctx.arc(24, -30, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (c.shield) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.8)';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(x, y, 160 + Math.sin(time * 8) * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBars(ctx: CanvasRenderingContext2D, c: BattleSnapshot['champs'][number], x: number, y: number, w: number, members: number, wins: number): void {
  const col = COLORS[c.team];
  text(ctx, `${c.team === 'red' ? 'VERMELHO' : 'AZUL'} · ${members} 👥 · ${wins} 🏆`, x, y - 14, { size: 26, weight: 900, color: col.light });
  roundRect(ctx, x, y, w, 34, 17);
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.fill();
  const pct = Math.max(0, c.hp / c.maxHp);
  roundRect(ctx, x + 3, y + 3, (w - 6) * pct, 28, 14);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, col.dark);
  g.addColorStop(1, col.main);
  ctx.fillStyle = g;
  ctx.fill();
  text(ctx, `${c.hp} / ${c.maxHp}`, x + w / 2, y + 26, { size: 20, weight: 800, color: '#fff', align: 'center' });
  roundRect(ctx, x, y + 42, w, 14, 7);
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.fill();
  roundRect(ctx, x + 2, y + 44, (w - 4) * (c.energy / 100), 10, 5);
  ctx.fillStyle = '#fde047';
  ctx.fill();
}

export const renderer: GameRenderer<BattleSnapshot> = {
  draw(ctx, v: RenderView<BattleSnapshot>) {
    const { snap, prev, alpha, time, kit } = v;
    drawBackdrop(ctx, snap, time, 120);
    const vertical = snap.aspect === 'vertical';
    // arena
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 6;
    ctx.setLineDash([24, 18]);
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(60, snap.height * 0.52);
      ctx.lineTo(snap.width - 60, snap.height * 0.52);
    } else {
      ctx.moveTo(snap.width / 2, 180);
      ctx.lineTo(snap.width / 2, snap.height - 80);
    }
    ctx.stroke();
    ctx.restore();

    const minions = interpolateEntities(prev?.minions, snap.minions, alpha);
    for (const m of minions) {
      const col = COLORS[m.team];
      glowCircle(ctx, m.x, m.y, 26, col.main, 18);
      ctx.fillStyle = '#fff';
      ctx.fillRect(m.x - 22, m.y - 44, 44 * Math.max(0, m.hp / 120), 6);
    }
    for (const c of snap.champs) drawChampion(ctx, c, time);
    const projectiles = interpolateEntities(prev?.projectiles, snap.projectiles, alpha);
    for (const p of projectiles) {
      const col = COLORS[p.team];
      const r = p.kind === 'special' ? 34 : p.kind === 'super' ? 22 : p.kind === 'minion' ? 9 : 14;
      glowCircle(ctx, p.x, p.y, r, p.kind === 'super' ? '#fde047' : col.light, r * 2);
    }
    kit.particles.draw(ctx);

    const red = snap.champs.find((c) => c.team === 'red')!;
    const blue = snap.champs.find((c) => c.team === 'blue')!;
    if (vertical) {
      drawBars(ctx, blue, 60, 250, snap.width - 120, snap.members.blue, snap.wins.blue);
      drawBars(ctx, red, 60, snap.height - 290, snap.width - 120, snap.members.red, snap.wins.red);
    } else {
      drawBars(ctx, red, 60, 200, 640, snap.members.red, snap.wins.red);
      drawBars(ctx, blue, snap.width - 700, 200, 640, snap.members.blue, snap.wins.blue);
    }
    const tx = snap.width / 2;
    const ty = vertical ? snap.height * 0.52 - 20 : 150;
    text(ctx, `⏱ ${Math.floor(snap.timeLeft / 60)}:${String(snap.timeLeft % 60).padStart(2, '0')}`, tx, ty, {
      size: 40, weight: 900, color: '#e2e8f0', align: 'center', stroke: 'rgba(0,0,0,0.6)',
    });
    if (snap.mvp) text(ctx, `MVP: ${snap.mvp.name} (${snap.mvp.damage})`, tx, ty + 48, { size: 26, weight: 700, color: '#fde047', align: 'center' });
    drawHud(ctx, snap, 'Battle Arena', '#f43f5e', time);
  },

  onFx(fx: FxMarker, kit: RenderKit) {
    const c = fx.color ?? '#fff';
    switch (fx.kind) {
      case 'hit':
        kit.particles.burst(fx.x, fx.y, c, 14, 380, { shape: 'spark' });
        kit.sound.play('hit', 40);
        break;
      case 'explode':
        kit.particles.burst(fx.x, fx.y, c, 70, 900);
        kit.particles.burst(fx.x, fx.y, '#fde047', 30, 500, { shape: 'spark' });
        kit.shake(20);
        kit.sound.play('boom');
        break;
      case 'damage':
      case 'heal':
        kit.particles.spawn({ x: fx.x, y: fx.y, vy: -120, life: 0.8, size: 10, color: c });
        break;
      case 'shield':
      case 'shield-block':
        kit.particles.burst(fx.x, fx.y, '#38bdf8', 24, 300);
        break;
      case 'super':
      case 'charge':
        kit.flash('#fde047', 0.2);
        kit.particles.burst(fx.x, fx.y, '#fde047', 60, 700, { shape: 'spark' });
        kit.sound.play('power');
        break;
      case 'summon':
        kit.particles.burst(fx.x, fx.y, c, 30, 300);
        kit.sound.play('pop');
        break;
      case 'minion-down':
        kit.particles.burst(fx.x, fx.y, c, 20, 400);
        break;
      case 'ko':
        kit.particles.confetti(fx.x, fx.y, ['#f43f5e', '#3b82f6', '#fde047', '#ffffff'], 120);
        kit.shake(35);
        kit.flash('#ffffff', 0.4);
        kit.sound.play('win');
        break;
      case 'spark':
        kit.particles.burst(fx.x, fx.y, c, 6, 200, { shape: 'spark' });
        break;
    }
  },
};
