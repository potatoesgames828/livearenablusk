import type { FxMarker } from '@live-arena/game-engine';
import { drawBackdrop, drawHud, glowCircle, roundRect, text, hexToRgba, type GameRenderer, type RenderKit, type RenderView } from '@live-arena/game-engine/render';
import type { SnakeSnapshot } from './sim';

const ACCENT = '#22c55e';

export const renderer: GameRenderer<SnakeSnapshot> = {
  draw(ctx, v: RenderView<SnakeSnapshot>) {
    const { snap, time, kit } = v;
    drawBackdrop(ctx, snap, time, 0);
    const { x: bx, y: by, cell, cols, rows } = snap.board;

    // Tabuleiro
    ctx.save();
    roundRect(ctx, bx - 12, by - 12, cols * cell + 24, rows * cell + 24, 28);
    ctx.fillStyle = 'rgba(6,14,12,0.85)';
    ctx.fill();
    ctx.strokeStyle = hexToRgba(ACCENT, snap.boost > 0 ? 0.9 : 0.45);
    ctx.lineWidth = 4;
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = snap.boost > 0 ? 40 : 16;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if ((x + y) % 2 === 0) continue;
        ctx.fillStyle = 'rgba(34,197,94,0.035)';
        ctx.fillRect(bx + x * cell, by + y * cell, cell, cell);
      }
    }
    ctx.restore();

    const cx = (c: number) => bx + c * cell + cell / 2;
    const cy = (c: number) => by + c * cell + cell / 2;

    // Obstáculos
    for (const o of snap.obstacles) {
      ctx.save();
      roundRect(ctx, bx + o.x * cell + 4, by + o.y * cell + 4, cell - 8, cell - 8, 10);
      const g = ctx.createLinearGradient(0, by + o.y * cell, 0, by + (o.y + 1) * cell);
      g.addColorStop(0, '#64748b');
      g.addColorStop(1, '#334155');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Comidas
    for (const f of snap.foods) {
      const pulse = 1 + Math.sin(time * 6 + f.id) * 0.12;
      const color = f.kind === 'golden' ? '#facc15' : f.kind === 'special' ? '#f472b6' : '#4ade80';
      glowCircle(ctx, cx(f.x), cy(f.y), (f.kind === 'normal' ? 12 : 17) * pulse, color, f.kind === 'normal' ? 14 : 30);
      if (f.owner) {
        text(ctx, f.owner, cx(f.x), cy(f.y) - 26, { size: 20, weight: 800, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.7)' });
      }
    }

    // Cobra
    const body = snap.body;
    const n = body.length;
    for (let i = n - 1; i >= 0; i--) {
      const c = body[i]!;
      const t = i / Math.max(1, n - 1);
      const r = cell * (0.42 - t * 0.12);
      const hue = 140 - t * 40;
      ctx.save();
      ctx.fillStyle = snap.alive ? `hsl(${hue} 80% ${55 - t * 15}%)` : `hsl(0 0% ${45 - t * 15}%)`;
      if (i === 0) {
        ctx.shadowColor = snap.boost > 0 ? '#fde047' : ACCENT;
        ctx.shadowBlur = 30;
      }
      ctx.beginPath();
      ctx.arc(cx(c.x), cy(c.y), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (i < n - 1) {
        const nx = body[i + 1]!;
        if (Math.abs(nx.x - c.x) + Math.abs(nx.y - c.y) === 1) {
          ctx.save();
          ctx.strokeStyle = snap.alive ? `hsl(${hue} 80% ${50 - t * 15}%)` : '#555';
          ctx.lineWidth = r * 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx(c.x), cy(c.y));
          ctx.lineTo(cx(nx.x), cy(nx.y));
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    const head = body[0];
    if (head) {
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[snap.dir];
      const ex = cx(head.x) + d[0]! * 8;
      const ey = cy(head.y) + d[1]! * 8;
      const px = -d[1]! * 10;
      const py = d[0]! * 10;
      for (const s of [1, -1]) {
        glowCircle(ctx, ex + px * s, ey + py * s, 6, '#fff', 4);
        ctx.fillStyle = '#052e16';
        ctx.beginPath();
        ctx.arc(ex + px * s + d[0]! * 2, ey + py * s + d[1]! * 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    kit.particles.draw(ctx);

    // Painel de status
    const vertical = snap.aspect === 'vertical';
    const sy = vertical ? by + rows * cell + 50 : by + rows * cell + 40;
    const items: Array<[string, string, string]> = [
      ['TAMANHO', String(snap.length), ACCENT],
      ['RECORDE', String(snap.best), '#facc15'],
      ['TURBO', snap.boost > 0 ? `${snap.boost.toFixed(1)}s` : '—', '#fde047'],
      ['CONTROLE', snap.manual ? 'PÚBLICO' : 'AUTO', '#93c5fd'],
    ];
    const w = (cols * cell) / items.length;
    items.forEach(([label, value, color], i) => {
      const x = bx + i * w + w / 2;
      text(ctx, label, x, sy, { size: 22, weight: 700, color: '#94a3b8', align: 'center' });
      text(ctx, value, x, sy + 44, { size: 40, weight: 900, color, align: 'center' });
    });

    drawHud(ctx, snap, 'Snake Live', ACCENT, time);
  },

  onFx(fx: FxMarker, kit: RenderKit) {
    switch (fx.kind) {
      case 'eat':
        kit.particles.burst(fx.x, fx.y, fx.color ?? '#4ade80', 14, 260);
        kit.sound.play('pop');
        break;
      case 'eat-special':
        kit.particles.burst(fx.x, fx.y, fx.color ?? '#f472b6', 40, 520);
        kit.sound.play('coin');
        kit.flash(fx.color ?? '#f472b6', 0.12);
        break;
      case 'spawn':
      case 'spawn-golden':
        kit.particles.burst(fx.x, fx.y, fx.color ?? '#fff', fx.kind === 'spawn-golden' ? 50 : 10, 300, { shape: 'spark' });
        break;
      case 'boost':
        kit.particles.burst(fx.x, fx.y, '#fde047', 30, 600, { shape: 'spark' });
        kit.sound.play('power');
        break;
      case 'death':
        kit.particles.burst(fx.x, fx.y, '#ef4444', 80, 800);
        kit.shake(26);
        kit.flash('#ef4444', 0.3);
        kit.sound.play('boom');
        break;
    }
  },
};
