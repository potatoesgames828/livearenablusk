import type { FxMarker } from '@live-arena/game-engine';
import {
  drawBackdrop, drawHud, glowCircle, roundRect, text, interpolateEntities,
  type GameRenderer, type RenderKit, type RenderView,
} from '@live-arena/game-engine/render';
import type { PlinkoSnapshot } from './sim';

const ACCENT = '#a855f7';

function slotColor(mult: number): string {
  if (mult >= 25) return '#facc15';
  if (mult >= 5) return '#f97316';
  if (mult >= 2) return '#a855f7';
  if (mult >= 1) return '#3b82f6';
  return '#475569';
}

export const renderer: GameRenderer<PlinkoSnapshot> = {
  draw(ctx, v: RenderView<PlinkoSnapshot>) {
    const { snap, prev, alpha, time, kit } = v;
    drawBackdrop(ctx, snap, time, 0);
    const { x, y, w, h } = snap.board;
    ctx.save();
    roundRect(ctx, x - 16, y - 16, w + 32, h + 32, 32);
    ctx.fillStyle = 'rgba(15,10,30,0.85)';
    ctx.fill();
    ctx.strokeStyle = snap.boost ? '#e879f9' : 'rgba(168,85,247,0.5)';
    ctx.lineWidth = 4;
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = snap.boost ? 50 : 20;
    ctx.stroke();
    ctx.restore();

    for (const p of snap.pins) glowCircle(ctx, p.x, p.y, snap.pinRadius, '#e9d5ff', 10);

    for (const s of snap.slots) {
      const mult = s.mult * (snap.boost ? 2 : 1);
      ctx.save();
      roundRect(ctx, s.x + 4, snap.slotY, s.w - 8, 80, 14);
      ctx.fillStyle = slotColor(s.mult);
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.restore();
      text(ctx, `x${mult}`, s.x + s.w / 2, snap.slotY + 52, { size: Math.min(28, s.w * 0.36), weight: 900, color: '#fff', align: 'center' });
    }

    const balls = interpolateEntities(prev?.balls, snap.balls, alpha);
    for (const b of balls) {
      glowCircle(ctx, b.x, b.y, snap.ballRadius, b.golden ? '#facc15' : b.owner ? '#f0abfc' : '#94a3b8', b.golden ? 36 : 16);
      if (b.owner) text(ctx, b.owner, b.x, b.y - 24, { size: 18, weight: 800, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.8)' });
    }
    kit.particles.draw(ctx);

    const vertical = snap.aspect === 'vertical';
    const iy = vertical ? y + h + 70 : 200;
    const ix = vertical ? x : 36;
    text(ctx, `⏱ ${snap.timeLeft}s`, ix, iy, { size: 36, weight: 900, color: '#f8fafc' });
    text(ctx, 'Últimos: ' + snap.lastHits.map((m) => `x${m}`).join(' '), ix, iy + 50, { size: 26, weight: 700, color: '#d8b4fe', maxWidth: vertical ? w : 340 });
    if (snap.bestDrop) text(ctx, `Melhor jogada: ${snap.bestDrop.name} (+${snap.bestDrop.points})`, ix, iy + 96, { size: 26, weight: 700, color: '#facc15', maxWidth: vertical ? w : 340 });
    text(ctx, 'Pontos virtuais • sem apostas', snap.width / 2, snap.height - 100, { size: 22, weight: 600, color: '#94a3b8', align: 'center' });
    drawHud(ctx, snap, 'Plinko Live', ACCENT, time);
  },

  onFx(fx: FxMarker, kit: RenderKit) {
    const c = fx.color ?? '#fff';
    if (fx.kind === 'land') {
      kit.particles.burst(fx.x, fx.y, c, 16, 320);
      kit.sound.play('pop', 50);
    } else if (fx.kind === 'jackpot') {
      kit.particles.confetti(fx.x, fx.y, ['#facc15', '#a855f7', '#ffffff', '#f97316'], 80);
      kit.flash('#facc15', 0.25);
      kit.shake(14);
      kit.sound.play('win');
    } else if (fx.kind === 'boost') {
      kit.flash('#a855f7', 0.2);
      kit.sound.play('power');
    }
  },
};
