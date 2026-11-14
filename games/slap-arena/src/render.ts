import type { FxMarker } from '@live-arena/game-engine';
import { drawAvatar, drawAvatarBadge, lookFromSeed, roundRect, text, type GameRenderer, type RenderKit, type RenderView } from '@live-arena/game-engine/render';
import type { FighterView, SlapSnapshot } from './sim';

function drawWeapon(ctx: CanvasRenderingContext2D, level: number, s: number): void {
  const u = s / 100;
  switch (level) {
    case 0: // mão aberta
      ctx.fillStyle = '#f2c7a5';
      ctx.beginPath();
      ctx.ellipse(0, -6 * u, 8 * u, 11 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 1: // peixe
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.ellipse(0, -36 * u, 12 * u, 34 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -68 * u);
      ctx.lineTo(-16 * u, -86 * u);
      ctx.lineTo(16 * u, -86 * u);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(4 * u, -12 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 2: // frigideira
      ctx.fillStyle = '#44403c';
      ctx.fillRect(-4 * u, -40 * u, 8 * u, 40 * u);
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(0, -64 * u, 26 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.arc(-6 * u, -70 * u, 10 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 3: // taco
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.moveTo(-5 * u, 0);
      ctx.lineTo(5 * u, 0);
      ctx.lineTo(11 * u, -90 * u);
      ctx.lineTo(-11 * u, -90 * u);
      ctx.closePath();
      ctx.fill();
      break;
    case 4: // marreta
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-5 * u, -80 * u, 10 * u, 80 * u);
      ctx.fillStyle = '#6b7280';
      roundRect(ctx, -30 * u, -110 * u, 60 * u, 34 * u, 6 * u);
      ctx.fill();
      break;
    default: // antena parabólica
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(-4 * u, -60 * u, 8 * u, 60 * u);
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.ellipse(0, -90 * u, 54 * u, 20 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 4 * u;
      ctx.beginPath();
      ctx.moveTo(0, -90 * u);
      ctx.lineTo(0, -126 * u);
      ctx.stroke();
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(0, -128 * u, 7 * u, 0, Math.PI * 2);
      ctx.fill();
  }
}

function hpPanel(ctx: CanvasRenderingContext2D, f: FighterView | undefined, x: number, y: number, w: number, align: 'left' | 'right', color: string): void {
  ctx.save();
  roundRect(ctx, x, y, w, 150, 26);
  ctx.fillStyle = 'rgba(8,12,28,0.82)';
  ctx.fill();
  ctx.restore();
  if (!f) {
    text(ctx, 'Aguardando…', x + w / 2, y + 85, { size: 30, weight: 700, color: '#94a3b8', align: 'center' });
    return;
  }
  const tx = align === 'left' ? x + 24 : x + w - 24;
  text(ctx, f.name, tx, y + 46, { size: 34, weight: 900, color: f.bot ? '#cbd5e1' : '#fff', align, maxWidth: w - 48 });
  text(ctx, `${f.weaponName}${f.streak ? ` · 🔥${f.streak}` : ''}`, tx, y + 82, { size: 24, weight: 800, color, align, maxWidth: w - 48 });
  const p = Math.max(0, f.hp / f.maxHp);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, x + 24, y + 100, w - 48, 26, 13);
  ctx.fill();
  ctx.fillStyle = p > 0.5 ? '#22c55e' : p > 0.25 ? '#eab308' : '#ef4444';
  const bw = (w - 48) * p;
  roundRect(ctx, align === 'left' ? x + 24 : x + w - 24 - bw, y + 100, bw, 26, 13);
  ctx.fill();
  text(ctx, `${f.hp}/${f.maxHp}`, x + w / 2, y + 120, { size: 20, weight: 900, color: '#fff', align: 'center' });
}

export const renderer: GameRenderer<SlapSnapshot> = {
  draw(ctx, { snap: s, time, kit }: RenderView<SlapSnapshot>) {
    const W = s.width;
    const H = s.height;
    const vertical = s.aspect === 'vertical';
    // céu de fim de tarde e mar
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1e3a8a');
    sky.addColorStop(0.45, '#f97316');
    sky.addColorStop(0.55, '#fb923c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const seaY = vertical ? H * 0.58 : H * 0.62;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(W * 0.75, seaY - 20, 90, Math.PI, Math.PI * 2);
    ctx.fill();
    const sea = ctx.createLinearGradient(0, seaY, 0, H);
    sea.addColorStop(0, '#0369a1');
    sea.addColorStop(1, '#082f49');
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaY, W, H - seaY);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const y = seaY + 30 + i * 50;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.02 + time * 2 + i) * 6);
      ctx.stroke();
    }
    // píer
    const pierY = seaY - 10;
    const pw = vertical ? W * 0.7 : W * 0.5;
    const px = (W - pw) / 2;
    ctx.fillStyle = '#78350f';
    for (let i = 0; i < 6; i++) ctx.fillRect(px + 20 + i * (pw - 40) / 5, pierY, 22, 220);
    ctx.fillStyle = '#a16207';
    ctx.fillRect(px, pierY - 30, pw, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let x = px; x < px + pw; x += 60) ctx.fillRect(x, pierY - 30, 3, 40);
    // lutadores
    const fx = [W / 2 - (vertical ? 170 : 190), W / 2 + (vertical ? 170 : 190)];
    const size = vertical ? 300 : 250;
    const phase = s.duelPhase;
    for (const side of [0, 1] as const) {
      const f = side === 0 ? s.left : s.right;
      if (!f) continue;
      const facing = (side === 0 ? 1 : -1) as 1 | -1;
      let x = fx[side]!;
      let y = pierY - 30;
      let rot = 0;
      let action: 'idle' | 'attack' | 'hit' | 'dead' | 'cheer' = 'idle';
      let actT = 0;
      const attacking = s.turn === side && phase === 'windup';
      const justHit = s.lastHit && s.lastHit.side !== side && phase === 'hit';
      if (attacking) {
        action = 'attack';
        actT = s.phaseT * 0.5;
      } else if (justHit) {
        action = 'hit';
        x -= facing * 30 * (1 - s.phaseT);
      }
      if ((phase === 'ko' || phase === 'finisher') && s.loserSide === side) {
        const t = s.phaseT;
        const dist = phase === 'finisher' ? 900 : 520;
        x -= facing * t * dist;
        y -= Math.sin(t * Math.PI) * (phase === 'finisher' ? 520 : 300) - t * t * 260;
        rot = -facing * t * (phase === 'finisher' ? 14 : 6);
        action = 'dead';
      } else if ((phase === 'ko' || phase === 'finisher' || phase === 'result') && s.loserSide !== undefined && s.loserSide !== side) {
        action = 'cheer';
      }
      if (phase === 'result' && s.loserSide === side) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      drawAvatar(ctx, 0, 0, size, lookFromSeed(f.id), { facing, action: action === 'dead' ? 'hit' : action, actionT: actT, phase: time * 5 + side, crown: f.streak >= 3 });
      // arma na mão da frente
      const swing = attacking ? -1.4 + s.phaseT * 2.6 : action === 'cheer' ? -2.4 : -0.4;
      ctx.translate(facing * size * 0.17, -size * 0.52);
      ctx.scale(facing, 1);
      ctx.rotate(swing);
      drawWeapon(ctx, f.weapon, size * 0.9);
      ctx.restore();
      if (action !== 'dead') text(ctx, f.name, x, pierY + 40, { size: 30, weight: 900, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.75)', maxWidth: 300 });
    }
    // grito do golpe
    if (s.lastHit && (phase === 'hit' || phase === 'ko' || phase === 'finisher')) {
      const t = phase === 'hit' ? s.phaseT : Math.min(1, s.phaseT * 3);
      const scale = 1 + (1 - t) * 0.6;
      ctx.save();
      ctx.translate(W / 2, pierY - size * 1.35);
      ctx.scale(scale, scale);
      ctx.rotate(-0.08);
      text(ctx, s.lastHit.call, 0, 0, { size: 84, weight: 900, color: '#fde047', align: 'center', stroke: '#7c2d12' });
      text(ctx, `-${s.lastHit.dmg}`, 0, 70, { size: 54, weight: 900, color: '#fff', align: 'center', stroke: '#991b1b' });
      ctx.restore();
    }
    if (phase === 'finisher') {
      ctx.fillStyle = `rgba(0,0,0,${0.35 * Math.sin(s.phaseT * Math.PI)})`;
      ctx.fillRect(0, 0, W, H);
      text(ctx, 'GOLPE FINAL!', W / 2, H * 0.3, { size: vertical ? 120 : 140, weight: 900, color: '#ef4444', align: 'center', stroke: '#000' });
    }
    kit.particles.draw(ctx);
    // painéis de vida
    const pw2 = vertical ? (W - 120) / 2 : 560;
    const py = vertical ? 60 : 40;
    hpPanel(ctx, s.left, vertical ? 40 : 60, py, pw2, 'left', '#7dd3fc');
    hpPanel(ctx, s.right, vertical ? W - 40 - pw2 : W - 60 - pw2, py, pw2, 'right', '#fda4af');
    text(ctx, 'VS', W / 2, py + 95, { size: 56, weight: 900, color: '#facc15', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
    text(ctx, `Duelo ${s.duels + 1} · golpe final a cada ${s.finishEvery} vitórias`, W / 2, py + 200, { size: 26, weight: 800, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
    // fila
    const qy = vertical ? H - 330 : H - 170;
    ctx.save();
    roundRect(ctx, 30, qy, W - 60, 140, 26);
    ctx.fillStyle = 'rgba(8,12,28,0.78)';
    ctx.fill();
    ctx.restore();
    text(ctx, `FILA (${s.queueSize})`, 60, qy + 40, { size: 26, weight: 900, color: '#7dd3fc' });
    const n = s.queue.length;
    const gap = Math.min(120, (W - 140) / Math.max(1, n));
    s.queue.forEach((q, i) => {
      const cx = 90 + i * gap;
      drawAvatarBadge(ctx, cx, qy + 82, 26, q, '#7dd3fc');
      text(ctx, q.name, cx, qy + 128, { size: 18, weight: 700, color: '#e2e8f0', align: 'center', maxWidth: gap - 8 });
    });
    if (!n) text(ctx, 'Fila vazia: entre agora!', W / 2, qy + 92, { size: 30, weight: 700, color: '#94a3b8', align: 'center' });
    text(ctx, s.joinHint, W / 2, vertical ? H - 130 : qy - 20, { size: 34, weight: 900, color: '#fde047', align: 'center', stroke: 'rgba(0,0,0,0.7)', maxWidth: W - 60 });
    if (vertical && s.topWinners.length) {
      text(ctx, `🏆 ${s.topWinners.map((w) => `${w.name} (${w.wins})`).join(' · ')}`, W / 2, H - 90, { size: 26, weight: 800, color: '#fff', align: 'center', maxWidth: W - 60 });
    }
    let ny = py + 250;
    for (const nt of s.notices.slice(-2)) {
      text(ctx, nt.text, W / 2, ny, { size: 28, weight: 800, color: nt.color, align: 'center', stroke: 'rgba(0,0,0,0.75)', maxWidth: W - 60 });
      ny += 40;
    }
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
  },
  onFx(fx: FxMarker, kit: RenderKit, snap: SlapSnapshot) {
    switch (fx.kind) {
      case 'slap':
        kit.sound.play('hit', 0);
        kit.particles.burst(fx.x, fx.y - 200, '#fde047', 14 + (fx.size ?? 0) * 6, 420);
        kit.shake(4 + (fx.size ?? 0) * 3);
        break;
      case 'ko':
        kit.sound.play('boom', 0);
        kit.particles.burst(snap.width / 2, snap.height * 0.6, '#7dd3fc', 50, 600);
        break;
      case 'finisher':
        kit.flash('#ef4444', 0.6);
        kit.sound.play('win', 0);
        kit.shake(22);
        break;
      case 'bell':
        kit.sound.play('coin', 0);
        break;
      case 'heal':
      case 'weapon':
        kit.particles.burst(fx.x, fx.y, fx.kind === 'heal' ? '#4ade80' : '#f59e0b', 20, 300);
        kit.sound.play('power', 60);
        break;
    }
  },
};
