import type { FxMarker } from '@live-arena/game-engine';
import {
  drawBackdrop, drawHud, glowCircle, roundRect, text, interpolateEntities,
  type GameRenderer, type RenderKit, type RenderView,
} from '@live-arena/game-engine/render';
import type { SurvivalSnapshot } from './sim';

const ACCENT = '#06b6d4';
const ENEMY_COLORS = { grunt: '#f97316', runner: '#facc15', tank: '#ef4444', boss: '#dc2626' } as const;
const ENEMY_SIZE = { grunt: 22, runner: 16, tank: 34, boss: 64 } as const;

export const renderer: GameRenderer<SurvivalSnapshot> = {
  draw(ctx, v: RenderView<SurvivalSnapshot>) {
    const { snap, prev, alpha, time, kit } = v;
    drawBackdrop(ctx, snap, time, 100);
    const c = snap.core;

    // anéis de alcance
    ctx.save();
    ctx.strokeStyle = 'rgba(6,182,212,0.12)';
    ctx.lineWidth = 3;
    for (const r of [180, 380, 600]) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const enemies = interpolateEntities(prev?.enemies, snap.enemies, alpha);
    for (const e of enemies) {
      const size = ENEMY_SIZE[e.kind];
      const color = snap.frozen ? '#bae6fd' : ENEMY_COLORS[e.kind];
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.atan2(c.y - e.y, c.x - e.x));
      ctx.shadowColor = color;
      ctx.shadowBlur = e.kind === 'boss' ? 40 : 14;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (e.kind === 'runner') {
        ctx.moveTo(size, 0);
        ctx.lineTo(-size, size * 0.7);
        ctx.lineTo(-size, -size * 0.7);
      } else if (e.kind === 'tank' || e.kind === 'boss') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
        }
      } else {
        ctx.arc(0, 0, size, 0, Math.PI * 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (e.hp < e.maxHp) {
        const w = size * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - w / 2, e.y - size - 16, w, 6);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(e.x - w / 2, e.y - size - 16, w * Math.max(0, e.hp / e.maxHp), 6);
      }
    }

    const bullets = interpolateEntities(prev?.bullets, snap.bullets, alpha);
    for (const b of bullets) glowCircle(ctx, b.x, b.y, 7, b.ally ? '#a5f3fc' : '#fde047', 12);
    for (const a of interpolateEntities(prev?.allies, snap.allies, alpha)) {
      glowCircle(ctx, a.x, a.y, 18, '#67e8f9', 24);
      if (a.owner) text(ctx, a.owner, a.x, a.y - 28, { size: 18, weight: 800, color: '#cffafe', align: 'center', stroke: 'rgba(0,0,0,0.7)' });
    }

    // núcleo
    const pulse = 1 + Math.sin(time * 4) * 0.05;
    ctx.save();
    const g = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, 140);
    g.addColorStop(0, '#ecfeff');
    g.addColorStop(0.4, ACCENT);
    g.addColorStop(1, 'rgba(6,182,212,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 140 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    glowCircle(ctx, c.x, c.y, 62, '#0e7490', 40);
    glowCircle(ctx, c.x, c.y, 40, '#22d3ee', 30);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.aim);
    ctx.fillStyle = c.boosted ? '#fb923c' : '#e0f2fe';
    roundRect(ctx, 10, -10, 86, 20, 8);
    ctx.fill();
    ctx.restore();
    if (c.shield > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56,189,248,0.75)';
      ctx.lineWidth = 6 + Math.min(14, c.shield / 40);
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 100, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    kit.particles.draw(ctx);

    // barra do núcleo
    const vertical = snap.aspect === 'vertical';
    const bw = vertical ? snap.width - 120 : 800;
    const bx = (snap.width - bw) / 2;
    const by = vertical ? snap.height - 300 : snap.height - 110;
    roundRect(ctx, bx, by, bw, 40, 20);
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fill();
    roundRect(ctx, bx + 4, by + 4, (bw - 8) * (c.hp / c.maxHp), 32, 16);
    ctx.fillStyle = c.hp / c.maxHp > 0.3 ? '#22d3ee' : '#ef4444';
    ctx.fill();
    if (c.shield > 0) {
      roundRect(ctx, bx + 4, by + 4, (bw - 8) * Math.min(1, c.shield / c.maxHp), 10, 5);
      ctx.fillStyle = '#bae6fd';
      ctx.fill();
    }
    text(ctx, `NÚCLEO ${c.hp}/${c.maxHp}${c.shield ? ` +${c.shield}🛡` : ''}`, snap.width / 2, by + 29, { size: 22, weight: 900, color: '#fff', align: 'center' });
    const iy = vertical ? 470 : 170;
    text(ctx, `ONDA ${snap.wave}`, snap.width / 2, iy, { size: 56, weight: 900, color: '#f8fafc', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
    text(ctx, `Abates ${snap.kills} · Recorde onda ${snap.bestWave}${snap.frozen ? ' · ❄ CONGELADO' : ''}`, snap.width / 2, iy + 44, {
      size: 26, weight: 700, color: '#a5f3fc', align: 'center',
    });
    if (snap.nextWaveIn > 0) text(ctx, `Próxima onda em ${snap.nextWaveIn}s`, snap.width / 2, iy + 90, { size: 30, weight: 800, color: '#fde047', align: 'center' });
    drawHud(ctx, snap, 'Survival Arena', ACCENT, time);
  },

  onFx(fx: FxMarker, kit: RenderKit) {
    const c = fx.color ?? '#fff';
    switch (fx.kind) {
      case 'enemy-down':
        kit.particles.burst(fx.x, fx.y, c, 14, 360);
        kit.sound.play('pop', 40);
        break;
      case 'boss-down':
        kit.particles.confetti(fx.x, fx.y, ['#facc15', '#ef4444', '#ffffff'], 100);
        kit.shake(30);
        kit.sound.play('win');
        break;
      case 'nova':
        for (let i = 0; i < 80; i++) {
          const a = (i / 80) * Math.PI * 2;
          kit.particles.spawn({ x: fx.x, y: fx.y, vx: Math.cos(a) * (fx.size ?? 380) * 2, vy: Math.sin(a) * (fx.size ?? 380) * 2, life: 0.5, size: 10, color: c });
        }
        kit.flash(c, 0.2);
        kit.sound.play('power');
        break;
      case 'bomb':
        kit.particles.burst(fx.x, fx.y, c, 50, 700);
        kit.shake(16);
        kit.sound.play('boom', 80);
        break;
      case 'core-hit':
        kit.particles.burst(fx.x, fx.y, c, 10, 300);
        kit.shake(6);
        kit.sound.play('hit', 80);
        break;
      case 'core-destroyed':
        kit.particles.burst(fx.x, fx.y, '#f87171', 160, 1100);
        kit.flash('#ef4444', 0.5);
        kit.shake(40);
        kit.sound.play('boom');
        break;
      case 'shield':
      case 'heal':
      case 'freeze':
        kit.particles.burst(fx.x, fx.y, c, 30, 400);
        break;
    }
  },
};
