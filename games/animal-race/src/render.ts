import type { FxMarker } from '@live-arena/game-engine';
import { ANIMALS, drawAnimal, drawMatchChrome, drawMatchTimer, interpolateEntities, roundRect, text, type GameRenderer, type RenderKit, type RenderView } from '@live-arena/game-engine/render';
import type { AnimalSnapshot } from './sim';

const NAME: Record<string, string> = Object.fromEntries(ANIMALS.map((a) => [a.kind, a.name]));
const COLOR: Record<string, string> = Object.fromEntries(ANIMALS.map((a) => [a.kind, a.color]));
let cam = 0;

export const renderer: GameRenderer<AnimalSnapshot> = {
  draw(ctx, { snap: s, prev, alpha, time, dt, kit }: RenderView<AnimalSnapshot>) {
    const W = s.width;
    const H = s.height;
    const vertical = s.aspect === 'vertical';
    const runners = interpolateEntities(
      prev?.runners.map((r) => ({ ...r, x: r.p, y: 0 })),
      s.runners.map((r) => ({ ...r, x: r.p, y: 0 })),
      alpha,
    );
    // céu e colinas
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#38bdf8');
    sky.addColorStop(0.35, '#bae6fd');
    sky.addColorStop(0.36, '#4d7c0f');
    sky.addColorStop(1, '#365314');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const top = vertical ? 420 : 250;
    const bottom = vertical ? H - 420 : H - 150;
    const lanes = Math.max(4, s.lanes);
    const laneH = (bottom - top) / lanes;
    const x0 = vertical ? 140 : 220;
    const span = vertical ? 0.3 : 0.38;
    const scale = (W - x0 - 60) / span;
    const leader = runners.reduce((m, r) => Math.max(m, r.x), 0);
    const want = Math.max(0, Math.min(1 - span + 0.06, leader - span * 0.7));
    cam += (want - cam) * Math.min(1, dt * 3);
    const px = (p: number) => x0 + (p - cam) * scale;
    // colinas que andam em parallax
    ctx.fillStyle = '#65a30d';
    for (let i = -1; i < 8; i++) {
      const hx = ((i * 380 - cam * scale * 0.2) % (W + 400)) - 200;
      ctx.beginPath();
      ctx.ellipse(hx, top - 10, 260, 120, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    // pista
    ctx.fillStyle = '#b45309';
    ctx.fillRect(0, top, W, bottom - top);
    for (let i = 0; i < lanes; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, top + i * laneH, W, laneH);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(0, top + i * laneH, W, 3);
    }
    // marcas de distância
    for (let m = 0; m <= 10; m++) {
      const x = px(m / 10);
      if (x < -20 || x > W + 20) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 2, top, 4, bottom - top);
      text(ctx, `${m * 10}%`, x, top - 14, { size: 22, weight: 800, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.5)' });
    }
    // largada e chegada
    const fx = px(1);
    if (fx < W + 60) {
      for (let y = top, k = 0; y < bottom; y += 24, k++) {
        ctx.fillStyle = k % 2 ? '#111' : '#fff';
        ctx.fillRect(fx - 12, y, 12, 24);
        ctx.fillStyle = k % 2 ? '#fff' : '#111';
        ctx.fillRect(fx, y, 12, 24);
      }
      text(ctx, 'CHEGADA', fx, top - 44, { size: 30, weight: 900, color: '#facc15', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
    }
    const sx = px(0);
    if (sx > -20) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx - 4, top, 8, bottom - top);
    }
    // obstáculos (em todas as raias)
    for (const o of s.obstacles) {
      const x = px(o.p);
      if (x < -60 || x > W + 60) continue;
      for (let i = 0; i < lanes; i++) {
        const y = top + (i + 0.75) * laneH;
        if (o.k === 'hurdle') {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(x - 3, y - laneH * 0.45, 6, laneH * 0.45);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x - 14, y - laneH * 0.45, 28, 8);
        } else {
          ctx.fillStyle = 'rgba(68,40,20,0.85)';
          ctx.beginPath();
          ctx.ellipse(x, y - 6, 44, laneH * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // corredores
    const size = Math.min(120, laneH * 1.15);
    for (const r of [...runners].sort((a, b) => a.lane - b.lane)) {
      const x = px(r.x);
      const y = top + (r.lane + 0.8) * laneH - (r.j ? Math.sin((1 - r.j / 0.6) * Math.PI) * laneH * 0.6 : 0);
      if (x < -150 || x > W + 150) continue;
      if (r.b) {
        ctx.fillStyle = 'rgba(250,204,21,0.45)';
        ctx.beginPath();
        ctx.moveTo(x - size * 0.4, y - size * 0.5);
        ctx.lineTo(x - size * 1.4, y - size * 0.3);
        ctx.lineTo(x - size * 0.4, y - size * 0.1);
        ctx.fill();
      }
      drawAnimal(ctx, r.a, x, y, size, r.s ? 0 : r.ph, { stunned: !!r.s, boosting: !!r.b });
      const label = `${r.pl ? `${r.pl}º ` : ''}${r.n}`;
      text(ctx, label, x, y - size * 0.95, { size: Math.max(16, Math.min(24, laneH * 0.25)), weight: 900, color: r.bot ? '#e2e8f0' : '#fff', align: 'center', stroke: 'rgba(0,0,0,0.75)', maxWidth: 220 });
      if (s.match.stage === 'playing' && !r.pl) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - 30, y + 6, 60, 6);
        ctx.fillStyle = r.st > 0.3 ? '#4ade80' : '#f87171';
        ctx.fillRect(x - 30, y + 6, 60 * r.st, 6);
      }
    }
    // faixa lateral com o animal de cada raia
    for (const r of runners) {
      const y = top + (r.lane + 0.55) * laneH;
      ctx.fillStyle = COLOR[r.a] ?? '#fff';
      ctx.fillRect(0, top + r.lane * laneH + 3, 10, laneH - 3);
      void y;
    }
    kit.particles.draw(ctx);
    // título, posições e tempo
    const pw = vertical ? W - 80 : 900;
    const pxp = (W - pw) / 2;
    ctx.save();
    roundRect(ctx, pxp, vertical ? 60 : 24, pw, vertical ? 150 : 120, 28);
    ctx.fillStyle = 'rgba(8,12,28,0.82)';
    ctx.fill();
    ctx.restore();
    text(ctx, 'CORRIDA ANIMAL', W / 2, vertical ? 120 : 76, { size: vertical ? 54 : 48, weight: 900, color: '#84cc16', align: 'center' });
    const order = [...s.runners].sort((a, b) => (a.pl && b.pl ? a.pl - b.pl : a.pl ? -1 : b.pl ? 1 : b.p - a.p));
    text(ctx, order.slice(0, 3).map((r, i) => `${i + 1}º ${r.n}`).join('   ') || '—', W / 2, vertical ? 180 : 126, { size: 28, weight: 800, color: '#fff', align: 'center', maxWidth: pw - 40 });
    drawMatchTimer(ctx, s, W / 2, vertical ? 290 : 200, '#84cc16');
    if (s.cheer) text(ctx, '📣 TORCIDA!', W - 160, vertical ? 300 : 200, { size: 34, weight: 900, color: '#fde047', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
    // legenda dos talentos (vertical: rodapé)
    if (vertical) {
      const legendY = bottom + 60;
      text(ctx, 'TALENTOS', W / 2, legendY, { size: 26, weight: 900, color: '#ecfccb', align: 'center' });
      ANIMALS.forEach((a, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const lx = col === 0 ? 70 : W / 2 + 20;
        const ly = legendY + 50 + row * 56;
        drawAnimal(ctx, a.kind, lx + 20, ly + 14, 44, time * 4 + i);
        text(ctx, `${a.name}: ${a.trait}`, lx + 60, ly + 4, { size: 22, weight: 700, color: '#f7fee7', maxWidth: W / 2 - 110 });
      });
    }
    let ny = vertical ? 340 : 230;
    for (const nt of s.notices.slice(-2)) {
      text(ctx, nt.text, W / 2, ny + 30, { size: 26, weight: 800, color: nt.color, align: 'center', stroke: 'rgba(0,0,0,0.75)', maxWidth: W - 60 });
      ny += 36;
    }
    drawMatchChrome(ctx, s, { title: 'Corrida Animal', accent: '#84cc16', time, rules: ['Digite o nome de um animal para escolher o seu', 'Presentes = turbo, cenoura, banana e raio', 'Curtidas = torcida para todos'] });
    if (s.phase === 'paused' || s.phase === 'stopped') {
      ctx.fillStyle = 'rgba(2,4,10,0.65)';
      ctx.fillRect(0, 0, W, H);
      text(ctx, s.phase === 'paused' ? '⏸ PAUSADO' : 'AGUARDANDO INÍCIO', W / 2, H / 2, { size: 80, weight: 900, color: '#fff', align: 'center' });
    }
    if (s.simulated) {
      ctx.save();
      roundRect(ctx, W / 2 - 170, H - 56, 340, 44, 22);
      ctx.fillStyle = 'rgba(234,179,8,0.85)';
      ctx.fill();
      ctx.restore();
      text(ctx, 'MODO DEMONSTRAÇÃO', W / 2, H - 26, { size: 22, weight: 900, color: '#1c1917', align: 'center' });
    }
    void NAME;
  },
  onFx(fx: FxMarker, kit: RenderKit, snap: AnimalSnapshot) {
    switch (fx.kind) {
      case 'start':
        kit.sound.play('power', 0);
        kit.flash('#ffffff', 0.3);
        break;
      case 'boost':
      case 'carrot':
        kit.sound.play('power', 120);
        break;
      case 'trip':
        kit.sound.play('hit', 120);
        break;
      case 'finish':
        kit.sound.play('coin', 0);
        kit.particles.confetti(snap.width * 0.8, snap.height * 0.4, ['#facc15', '#ffffff', '#84cc16'], 50);
        break;
      case 'lightning':
        kit.flash('#fef08a', 0.7);
        kit.sound.play('boom', 0);
        kit.shake(12);
        break;
      case 'victory':
        kit.sound.play('win', 0);
        break;
    }
  },
};
