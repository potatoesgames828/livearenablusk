import { drawBackdrop, drawHud, roundRect, text, type GameRenderer } from '@live-arena/game-engine/render';
import type { TemplateSnapshot } from './index';

export const renderer: GameRenderer<TemplateSnapshot> = {
  draw(ctx, { snap, time }) {
    drawBackdrop(ctx, snap, time);
    const w = snap.width - 200;
    const pct = Math.min(1, snap.value / snap.goal);
    roundRect(ctx, 100, snap.height / 2 - 40, w, 80, 40);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    roundRect(ctx, 100, snap.height / 2 - 40, w * pct, 80, 40);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    text(ctx, `${snap.value} / ${snap.goal}`, snap.width / 2, snap.height / 2 + 16, { size: 48, weight: 900, align: 'center' });
    drawHud(ctx, snap, 'Template', '#64748b', time);
  },
};
