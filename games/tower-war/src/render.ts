import type { FxMarker } from '@live-arena/game-engine';
import { drawAvatarBadge, hexToRgba, roundRect, shade, text, type GameRenderer, type RenderKit, type RenderView } from '@live-arena/game-engine/render';
import type { TowerSnapshot } from './sim';

const seen = new Map<number, number>();
let stars: Array<[number, number, number]> | null = null;

function layout(s: TowerSnapshot) {
  const vertical = s.aspect === 'vertical';
  const groundY = vertical ? s.height - 400 : s.height - 260;
  const topY = vertical ? 520 : 400;
  const xs = vertical ? [s.width * 0.27, s.width * 0.73] : [s.width * 0.3, s.width * 0.7];
  const bw = vertical ? 260 : 300;
  const bh = Math.max(3, Math.min(40, (groundY - topY) / s.target));
  return { vertical, groundY, topY, xs, bw, bh };
}

export const renderer: GameRenderer<TowerSnapshot> = {
  draw(ctx, { snap: s, time, kit }: RenderView<TowerSnapshot>) {
    const W = s.width;
    const H = s.height;
    const L = layout(s);
    // céu noturno
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#020617');
    g.addColorStop(0.7, '#1e1b4b');
    g.addColorStop(1, '#312e81');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!stars) {
      stars = [];
      for (let i = 0; i < 120; i++) stars.push([(i * 7919) % 1920, (i * 104729) % 1200, (i % 3) + 1]);
    }
    for (const [x, y, r] of stars) {
      if (x > W || y > L.groundY) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(time * 2 + x)})`;
      ctx.fillRect(x, y, r, r);
    }
    // silhueta da cidade
    ctx.fillStyle = '#0f172a';
    for (let x = 0, i = 0; x < W; x += 70, i++) {
      const h = 80 + ((i * 37) % 160);
      ctx.fillRect(x, L.groundY - h, 64, h);
    }
    // grade neon no chão
    ctx.fillStyle = '#0b1026';
    ctx.fillRect(0, L.groundY, W, H - L.groundY);
    ctx.strokeStyle = 'rgba(168,85,247,0.35)';
    ctx.lineWidth = 2;
    for (let x = -W; x < W * 2; x += 90) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + (x - W / 2) * 0.2, L.groundY);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    // linha da meta
    const metaY = L.groundY - s.target * L.bh;
    ctx.setLineDash([24, 14]);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, metaY);
    ctx.lineTo(W - 40, metaY);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, `META ${s.target}`, W / 2, metaY - 14, { size: 28, weight: 900, color: '#facc15', align: 'center' });
    // torres
    s.towers.forEach((t, i) => {
      const cx = L.xs[i]!;
      for (let k = 0; k < t.blocks.length; k++) {
        const b = t.blocks[k]!;
        const idx = t.height - t.blocks.length + k;
        let born = seen.get(b.id);
        if (born === undefined) {
          born = time;
          seen.set(b.id, time);
        }
        const age = time - born;
        const drop = age < 0.35 ? (1 - age / 0.35) ** 2 * 260 : 0;
        const y = L.groundY - (idx + 1) * L.bh - drop;
        const sway = Math.sin(time * 1.5 + idx * 0.05) * Math.min(14, idx * 0.12);
        ctx.fillStyle = b.c;
        ctx.fillRect(cx - L.bw / 2 + sway, y, L.bw, L.bh - 1);
        if (L.bh > 6) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(cx - L.bw / 2 + sway, y, L.bw, Math.max(1, L.bh * 0.25));
          ctx.fillStyle = shade(b.c, -0.35);
          ctx.fillRect(cx + L.bw / 2 - 10 + sway, y, 10, L.bh - 1);
        }
      }
      // guindaste
      const topOfTower = L.groundY - t.height * L.bh;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, metaY - 50);
      ctx.lineTo(cx, Math.min(topOfTower - 30, L.groundY - 30));
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(cx - 18, Math.min(topOfTower - 50, L.groundY - 50), 36, 20);
      if (t.lastBy) text(ctx, t.lastBy, cx, Math.min(topOfTower - 64, L.groundY - 64), { size: 24, weight: 800, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.7)', maxWidth: 260 });
      // base com nome e altura
      text(ctx, t.name.toUpperCase(), cx, L.groundY + 50, { size: 40, weight: 900, color: t.color, align: 'center', maxWidth: L.bw + 120 });
      text(ctx, `${t.height}/${s.target}`, cx, L.groundY + 96, { size: 36, weight: 900, color: '#fff', align: 'center' });
      text(ctx, `${'🏆'.repeat(Math.min(5, t.wins))}${t.wins > 5 ? ` ×${t.wins}` : ''}${t.wins === 0 ? `${t.members} no time` : ''}`, cx, L.groundY + 140, { size: 28, weight: 800, color: '#facc15', align: 'center' });
      if (L.vertical) {
        t.top.slice(0, 3).forEach((e, k) => {
          const y = L.groundY + 190 + k * 44;
          drawAvatarBadge(ctx, cx - 130, y - 10, 18, e, t.color);
          text(ctx, e.name, cx - 100, y, { size: 24, weight: 700, color: '#f8fafc', maxWidth: 160 });
          text(ctx, String(e.blocks), cx + 140, y, { size: 24, weight: 900, color: '#facc15', align: 'right' });
        });
      }
    });
    if (seen.size > 3000) {
      const cut = time - 5;
      for (const [id, t0] of seen) if (t0 < cut) seen.delete(id);
    }
    kit.particles.draw(ctx);
    // título e placar
    ctx.save();
    roundRect(ctx, (W - (L.vertical ? W - 80 : 1000)) / 2, L.vertical ? 60 : 30, L.vertical ? W - 80 : 1000, 170, 30);
    ctx.fillStyle = 'rgba(8,12,28,0.82)';
    ctx.fill();
    ctx.restore();
    const [A, B] = s.towers as [TowerSnapshot['towers'][number], TowerSnapshot['towers'][number]];
    const ty = L.vertical ? 60 : 30;
    text(ctx, 'GUERRA DE TORRES', W / 2, ty + 48, { size: 34, weight: 900, color: '#f59e0b', align: 'center' });
    text(ctx, `${A.wins}`, W / 2 - 90, ty + 130, { size: 76, weight: 900, color: A.color, align: 'center' });
    text(ctx, 'x', W / 2, ty + 122, { size: 48, weight: 900, color: '#94a3b8', align: 'center' });
    text(ctx, `${B.wins}`, W / 2 + 90, ty + 130, { size: 76, weight: 900, color: B.color, align: 'center' });
    text(ctx, A.name, W / 2 - 200, ty + 120, { size: 32, weight: 800, color: '#e2e8f0', align: 'right', maxWidth: 260 });
    text(ctx, B.name, W / 2 + 200, ty + 120, { size: 32, weight: 800, color: '#e2e8f0', maxWidth: 260 });
    // avisos
    let ny = ty + 220;
    for (const n of s.notices.slice(-3)) {
      text(ctx, n.text, W / 2, ny, { size: 28, weight: 800, color: n.color, align: 'center', stroke: 'rgba(0,0,0,0.7)', maxWidth: W - 60 });
      ny += 40;
    }
    text(ctx, s.hint, W / 2, L.vertical ? H - 90 : H - 75, { size: L.vertical ? 30 : 28, weight: 800, color: '#a5b4fc', align: 'center', maxWidth: W - 60 });
    if (s.phase === 'intermission') {
      ctx.fillStyle = 'rgba(2,4,10,0.6)';
      ctx.fillRect(0, 0, W, H);
      const w = s.matchWinner !== undefined ? s.towers[s.matchWinner] : undefined;
      text(ctx, w ? `${w.name.toUpperCase()} VENCEU A GUERRA!` : 'FIM DA PARTIDA', W / 2, H * 0.42, { size: L.vertical ? 76 : 90, weight: 900, color: w?.color ?? '#fff', align: 'center', stroke: 'rgba(0,0,0,0.8)', maxWidth: W - 40 });
      text(ctx, `Nova partida em ${s.phaseEndsIn ?? 0}s`, W / 2, H * 0.42 + 80, { size: 34, weight: 700, color: '#cbd5e1', align: 'center' });
    }
    if (s.phase === 'paused' || s.phase === 'stopped') {
      ctx.fillStyle = 'rgba(2,4,10,0.65)';
      ctx.fillRect(0, 0, W, H);
      text(ctx, s.phase === 'paused' ? '⏸ PAUSADO' : 'AGUARDANDO INÍCIO', W / 2, H / 2, { size: 80, weight: 900, color: '#fff', align: 'center' });
    }
    if (s.simulated) {
      ctx.save();
      const bx = L.vertical ? W / 2 : 210;
      roundRect(ctx, bx - 170, H - 60, 340, 44, 22);
      ctx.fillStyle = 'rgba(234,179,8,0.85)';
      ctx.fill();
      ctx.restore();
      text(ctx, 'MODO DEMONSTRAÇÃO', bx, H - 30, { size: 22, weight: 900, color: '#1c1917', align: 'center' });
    }
    void hexToRgba;
  },
  onFx(fx: FxMarker, kit: RenderKit) {
    const n = Math.min(80, 10 + (fx.size ?? 5) * 3);
    if (fx.kind === 'wreck' || fx.kind === 'demolish') {
      kit.particles.burst(fx.x, fx.y, fx.color ?? '#fff', n, 700);
      kit.sound.play('boom', 60);
      kit.shake(fx.kind === 'demolish' ? 22 : 8);
    } else if (fx.kind === 'steal') {
      kit.particles.burst(fx.x, fx.y, fx.color ?? '#a78bfa', n, 500);
      kit.sound.play('power', 60);
    } else if (fx.kind === 'win') {
      kit.particles.confetti(fx.x, fx.y, [fx.color ?? '#facc15', '#ffffff', '#facc15'], 120);
      kit.sound.play('win', 0);
    }
  },
};
