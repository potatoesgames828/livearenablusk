import type { FxMarker } from '@live-arena/game-engine';
import {
  drawBackdrop, drawHud, glowCircle, roundRect, text, interpolateEntities,
  type GameRenderer, type RenderKit, type RenderView,
} from '@live-arena/game-engine/render';
import type { RaceSnapshot } from './sim';

const ACCENT = '#f59e0b';

export const renderer: GameRenderer<RaceSnapshot> = {
  draw(ctx, v: RenderView<RaceSnapshot>) {
    const { snap, prev, alpha, time, kit } = v;
    drawBackdrop(ctx, snap, time, 0);
    const { x, y, w, h, lanes } = snap.track;
    const lh = h / lanes;

    // pista
    ctx.save();
    roundRect(ctx, x - 10, y - 10, w + 20, h + 20, 30);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.restore();
    for (let i = 0; i < lanes; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(30,41,59,0.9)' : 'rgba(15,23,42,0.9)';
      ctx.fillRect(x, y + i * lh, w, lh);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.setLineDash([30, 24]);
      ctx.lineDashOffset = -time * 120;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y + (i + 1) * lh);
      ctx.lineTo(x + w, y + (i + 1) * lh);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // checkpoints e chegada
    for (let c = 1; c <= 3; c++) {
      const cx = x + 40 + (c / 4) * (w - 120);
      ctx.fillStyle = 'rgba(245,158,11,0.18)';
      ctx.fillRect(cx - 3, y, 6, h);
    }
    const fx0 = x + w - 80;
    const sq = 20;
    for (let yy = y; yy < y + h; yy += sq) {
      for (let xx = 0; xx < 2; xx++) {
        ctx.fillStyle = ((yy - y) / sq + xx) % 2 === 0 ? '#f8fafc' : '#0f172a';
        ctx.fillRect(fx0 + xx * sq, yy, sq, sq);
      }
    }

    // obstáculos
    for (const o of snap.obstacles) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(0, -lh * 0.3);
      ctx.lineTo(lh * 0.26, lh * 0.25);
      ctx.lineTo(-lh * 0.26, lh * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-lh * 0.15, 0, lh * 0.3, lh * 0.07);
      ctx.restore();
    }

    // corredores
    const racers = interpolateEntities(prev?.racers, snap.racers, alpha);
    const size = Math.min(lh * 0.36, 40);
    for (const r of racers) {
      const bounce = r.stunned ? 0 : Math.abs(Math.sin(time * 12 + r.lane)) * 6;
      if (r.boosting) {
        ctx.save();
        const g = ctx.createLinearGradient(r.x - 160, 0, r.x, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, r.color);
        ctx.fillStyle = g;
        ctx.fillRect(r.x - 160, r.y - size * 0.5, 160, size);
        ctx.restore();
        if (Math.random() < 0.5) kit.particles.spawn({ x: r.x - size, y: r.y + (Math.random() - 0.5) * size, vx: -300, life: 0.4, size: 6, color: r.color });
      }
      glowCircle(ctx, r.x, r.y - bounce, size, r.stunned ? '#64748b' : r.color, r.boosting ? 40 : 14);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(r.x + size * 0.35, r.y - bounce - size * 0.2, size * 0.18, 0, Math.PI * 2);
      ctx.fill();
      if (r.shield) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(r.x, r.y - bounce, size + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const label = `${r.place ? `${r.place}º ` : ''}${r.name}`;
      text(ctx, label, Math.min(r.x + size + 14, x + w - 260), r.y + 9, {
        size: Math.min(26, lh * 0.32), weight: 800, color: r.bot ? '#94a3b8' : '#f8fafc', stroke: 'rgba(0,0,0,0.7)', maxWidth: 240,
      });
    }
    kit.particles.draw(ctx);

    const vertical = snap.aspect === 'vertical';
    const iy = vertical ? y + h + 80 : y - 30;
    text(ctx, `⏱ ${snap.raceTime.toFixed(1)}s`, x, iy, { size: 34, weight: 900, color: '#f8fafc' });
    if (vertical) {
      text(ctx, `Fila: ${snap.queue}`, x + w / 2, iy, { size: 30, weight: 700, color: '#cbd5e1', align: 'center' });
      if (snap.lastWinner) text(ctx, `Último vencedor: ${snap.lastWinner}`, x + w, iy, { size: 26, weight: 700, color: ACCENT, align: 'right', maxWidth: w / 2 - 40 });
    } else {
      // No 16:9 o ranking ocupa o canto superior direito: informações alinhadas à esquerda.
      text(ctx, `Fila: ${snap.queue}`, x + 260, iy, { size: 30, weight: 700, color: '#cbd5e1' });
      if (snap.lastWinner) text(ctx, `Último vencedor: ${snap.lastWinner}`, x + 520, iy, { size: 26, weight: 700, color: ACCENT, maxWidth: 680 });
      text(ctx, 'Digite !correr para entrar', x, iy - 50, { size: 30, weight: 900, color: ACCENT });
    }
    if (vertical) text(ctx, 'Digite !correr para entrar', snap.width / 2, iy + 60, { size: 34, weight: 900, color: ACCENT, align: 'center' });
    drawHud(ctx, snap, 'Avatar Race', ACCENT, time);
  },

  onFx(fx: FxMarker, kit: RenderKit) {
    const c = fx.color ?? '#fff';
    switch (fx.kind) {
      case 'boost':
        kit.particles.burst(fx.x, fx.y, c, 30, 500, { shape: 'spark' });
        kit.sound.play('power', 120);
        break;
      case 'crash':
        kit.particles.burst(fx.x, fx.y, '#f87171', 30, 400);
        kit.sound.play('hit');
        break;
      case 'shield':
      case 'shield-hit':
        kit.particles.burst(fx.x, fx.y, '#38bdf8', 20, 300);
        break;
      case 'join':
        kit.particles.burst(fx.x, fx.y, c, 24, 300);
        kit.sound.play('pop');
        break;
      case 'finish':
        kit.particles.burst(fx.x, fx.y, c, 30, 400);
        kit.sound.play('coin');
        break;
      case 'win':
        kit.particles.confetti(fx.x, fx.y, ['#f59e0b', '#fde047', '#ffffff', '#f43f5e', '#3b82f6'], 120);
        kit.flash('#fde047', 0.25);
        kit.sound.play('win');
        break;
      case 'turbo-all':
        kit.flash('#fde047', 0.2);
        kit.sound.play('power');
        break;
    }
  },
};
