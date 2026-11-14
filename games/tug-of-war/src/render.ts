import type { FxMarker } from '@live-arena/game-engine';
import { drawAvatar, drawAvatarBadge, hexToRgba, lookFromSeed, roundRect, text, type GameRenderer, type RenderKit, type RenderView } from '@live-arena/game-engine/render';
import type { TugSnapshot } from './sim';

let shownPos = 0;

export const renderer: GameRenderer<TugSnapshot> = {
  draw(ctx, { snap: s, time, dt, kit }: RenderView<TugSnapshot>) {
    const W = s.width;
    const H = s.height;
    const vertical = s.aspect === 'vertical';
    const [A, B] = s.teams as [TugSnapshot['teams'][number], TugSnapshot['teams'][number]];
    shownPos += (s.pos - shownPos) * Math.min(1, dt * 10);
    // fundo dividido
    const gA = ctx.createLinearGradient(0, 0, W / 2, 0);
    gA.addColorStop(0, hexToRgba(A.color, 0.55));
    gA.addColorStop(1, hexToRgba(A.color, 0.12));
    ctx.fillStyle = '#0b0f1e';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = gA;
    ctx.fillRect(0, 0, W / 2, H);
    const gB = ctx.createLinearGradient(W, 0, W / 2, 0);
    gB.addColorStop(0, hexToRgba(B.color, 0.55));
    gB.addColorStop(1, hexToRgba(B.color, 0.12));
    ctx.fillStyle = gB;
    ctx.fillRect(W / 2, 0, W / 2, H);
    // chão
    const groundY = vertical ? H * 0.62 : H * 0.6;
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x < W; x += 120) ctx.fillRect(x, groundY, 60, H - groundY);
    // marcas
    const markD = vertical ? W * 0.3 : W * 0.24;
    for (const [i, t] of [A, B].entries()) {
      const mx = W / 2 + (i === 0 ? -markD : markD);
      ctx.fillStyle = t.color;
      ctx.fillRect(mx - 6, groundY - 10, 12, 120);
      text(ctx, 'META', mx, groundY + (vertical ? 150 : 112), { size: 26, weight: 900, color: t.color, align: 'center' });
      if (t.frozen) {
        ctx.fillStyle = 'rgba(125,211,252,0.18)';
        ctx.fillRect(i === 0 ? 0 : W / 2, 0, W / 2, H);
        text(ctx, '🧊 CONGELADO', i === 0 ? W / 4 : (3 * W) / 4, groundY - 360, { size: 40, weight: 900, color: '#e0f2fe', align: 'center', stroke: 'rgba(0,0,0,0.5)' });
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(W / 2 - 3, groundY - 10, 6, 100);
    // corda
    const ropeY = groundY - (vertical ? 120 : 110);
    const flagX = W / 2 + shownPos * markD;
    ctx.strokeStyle = '#d6a868';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(-20, ropeY + 10);
    ctx.quadraticCurveTo(W / 2, ropeY + 26 - Math.abs(shownPos) * 20, W + 20, ropeY + 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,72,30,0.6)';
    ctx.lineWidth = 3;
    for (let x = 0; x < W; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, ropeY + 3);
      ctx.lineTo(x + 12, ropeY + 18);
      ctx.stroke();
    }
    // bandeira
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(flagX - 4, ropeY - 120, 8, 140);
    const wave = Math.sin(time * 8) * 8;
    ctx.fillStyle = shownPos < -0.05 ? A.color : shownPos > 0.05 ? B.color : '#facc15';
    ctx.beginPath();
    ctx.moveTo(flagX + 4, ropeY - 120);
    ctx.quadraticCurveTo(flagX + 50, ropeY - 110 + wave, flagX + 90, ropeY - 100);
    ctx.quadraticCurveTo(flagX + 50, ropeY - 80 - wave, flagX + 4, ropeY - 70);
    ctx.fill();
    // puxadores
    const per = vertical ? 4 : 5;
    for (const [i, t] of [A, B].entries()) {
      const dir = i === 0 ? -1 : 1;
      const lean = -0.18 - t.strain * 0.25;
      for (let k = 0; k < per; k++) {
        const who = t.top[k];
        const seed = who?.id ?? `${i}-bot-${k}`;
        const x = W / 2 + dir * (markD * 0.55 + k * (vertical ? 95 : 120)) + shownPos * markD;
        const size = (vertical ? 210 : 220) - k * 12;
        ctx.save();
        ctx.translate(x, groundY + 6);
        ctx.rotate(i === 0 ? lean : -lean);
        drawAvatar(ctx, 0, 0, size, lookFromSeed(seed), { facing: (i === 0 ? 1 : -1) as 1 | -1, action: t.frozen ? 'hit' : 'run', phase: time * (6 + t.strain * 10) + k, teamColor: t.color });
        ctx.restore();
        if (who) text(ctx, who.name, x, groundY + 46, { size: 24, weight: 800, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.7)', maxWidth: 160 });
      }
    }
    // placar
    const pw = vertical ? W - 80 : 1200;
    const px = (W - pw) / 2;
    const py = vertical ? 70 : 40;
    ctx.save();
    roundRect(ctx, px, py, pw, 230, 32);
    ctx.fillStyle = 'rgba(8,12,28,0.84)';
    ctx.fill();
    ctx.restore();
    text(ctx, 'CABO DE GUERRA', W / 2, py + 50, { size: 30, weight: 900, color: '#cbd5e1', align: 'center' });
    text(ctx, A.name.toUpperCase(), px + 40, py + 110, { size: 50, weight: 900, color: A.color, maxWidth: pw / 2 - 160 });
    text(ctx, B.name.toUpperCase(), px + pw - 40, py + 110, { size: 50, weight: 900, color: B.color, align: 'right', maxWidth: pw / 2 - 160 });
    text(ctx, `${A.wins} x ${B.wins}`, W / 2, py + 125, { size: 76, weight: 900, color: '#fff', align: 'center' });
    text(ctx, `${A.members} no time`, px + 40, py + 160, { size: 26, weight: 700, color: '#cbd5e1' });
    text(ctx, `${B.members} no time`, px + pw - 40, py + 160, { size: 26, weight: 700, color: '#cbd5e1', align: 'right' });
    text(ctx, `Rodada ${s.roundNo} · melhor de ${s.bestOf}`, W / 2, py + 205, { size: 26, weight: 700, color: '#94a3b8', align: 'center' });
    // medidor
    const mw = pw - 80;
    const my = py + 250;
    ctx.fillStyle = 'rgba(8,12,28,0.84)';
    roundRect(ctx, px + 40, my, mw, 34, 17);
    ctx.fill();
    const mid = px + 40 + mw / 2;
    const fillW = (mw / 2) * Math.abs(shownPos);
    ctx.fillStyle = shownPos < 0 ? A.color : B.color;
    roundRect(ctx, shownPos < 0 ? mid - fillW : mid, my + 4, fillW, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(mid - 2, my - 6, 4, 46);
    // contribuições
    const by = vertical ? H * 0.78 : H * 0.76;
    for (const [i, t] of [A, B].entries()) {
      const cx = i === 0 ? W * 0.25 : W * 0.75;
      text(ctx, `TOP ${t.name.toUpperCase()}`, cx, by, { size: 26, weight: 900, color: t.color, align: 'center' });
      t.top.slice(0, vertical ? 3 : 2).forEach((e, k) => {
        drawAvatarBadge(ctx, cx - 140, by + 50 + k * 64, 24, e, t.color);
        text(ctx, e.name, cx - 104, by + 60 + k * 64, { size: 26, weight: 700, color: '#f8fafc', maxWidth: 180 });
        text(ctx, String(e.pull), cx + 160, by + 60 + k * 64, { size: 26, weight: 900, color: '#facc15', align: 'right' });
      });
      if (!t.top.length) text(ctx, 'Puxe para aparecer aqui', cx, by + 56, { size: 24, weight: 600, color: '#94a3b8', align: 'center' });
    }
    text(ctx, s.hint, W / 2, vertical ? H - 110 : H - 85, { size: 34, weight: 900, color: '#facc15', align: 'center', stroke: 'rgba(0,0,0,0.6)', maxWidth: W - 60 });
    kit.particles.draw(ctx);
    // avisos
    let ny = vertical ? py + 310 : py + 300;
    for (const n of s.notices.slice(-3)) {
      text(ctx, n.text, W / 2, ny, { size: 30, weight: 800, color: n.color, align: 'center', stroke: 'rgba(0,0,0,0.7)', maxWidth: W - 80 });
      ny += 44;
    }
    if (s.pointPause && s.lastPointTeam !== undefined) {
      const t = s.teams[s.lastPointTeam]!;
      text(ctx, `PONTO ${t.name.toUpperCase()}!`, W / 2, H * 0.45, { size: vertical ? 90 : 100, weight: 900, color: t.color, align: 'center', stroke: 'rgba(0,0,0,0.8)', maxWidth: W - 40 });
    }
    if (s.phase === 'intermission') {
      ctx.fillStyle = 'rgba(2,4,10,0.6)';
      ctx.fillRect(0, 0, W, H);
      const t = s.matchWinner !== undefined ? s.teams[s.matchWinner] : undefined;
      text(ctx, t ? `${t.name.toUpperCase()} VENCEU!` : 'FIM DA PARTIDA', W / 2, H * 0.4, { size: vertical ? 96 : 110, weight: 900, color: t?.color ?? '#fff', align: 'center', stroke: 'rgba(0,0,0,0.8)', maxWidth: W - 40 });
      text(ctx, `${A.wins} x ${B.wins}`, W / 2, H * 0.4 + 100, { size: 70, weight: 900, color: '#fff', align: 'center' });
      if (t?.top[0]) text(ctx, `Destaque: ${t.top[0].name} (${t.top[0].pull} de força)`, W / 2, H * 0.4 + 170, { size: 38, weight: 800, color: '#facc15', align: 'center', maxWidth: W - 60 });
      text(ctx, `Nova partida em ${s.phaseEndsIn ?? 0}s`, W / 2, H * 0.4 + 240, { size: 32, weight: 700, color: '#94a3b8', align: 'center' });
    }
    if (s.phase === 'paused' || s.phase === 'stopped') {
      ctx.fillStyle = 'rgba(2,4,10,0.65)';
      ctx.fillRect(0, 0, W, H);
      text(ctx, s.phase === 'paused' ? '⏸ PAUSADO' : 'AGUARDANDO INÍCIO', W / 2, H / 2, { size: 80, weight: 900, color: '#fff', align: 'center' });
    }
    if (s.simulated) {
      ctx.save();
      roundRect(ctx, W / 2 - 170, H - 60, 340, 44, 22);
      ctx.fillStyle = 'rgba(234,179,8,0.85)';
      ctx.fill();
      ctx.restore();
      text(ctx, 'MODO DEMONSTRAÇÃO', W / 2, H - 30, { size: 22, weight: 900, color: '#1c1917', align: 'center' });
    }
  },
  onFx(fx: FxMarker, kit: RenderKit, snap: TugSnapshot) {
    if (fx.kind === 'point') {
      kit.particles.confetti(fx.x, fx.y, [fx.color ?? '#fff', '#ffffff'], 60);
      kit.sound.play('coin', 0);
      kit.shake(8);
    } else if (fx.kind === 'bigpull') {
      kit.particles.burst(fx.x, fx.y, fx.color ?? '#fff', 24, 400);
      kit.sound.play('power', 80);
    } else if (fx.kind === 'victory') {
      kit.particles.confetti(snap.width / 2, snap.height * 0.3, [fx.color ?? '#facc15', '#ffffff', '#facc15'], 160);
      kit.sound.play('win', 0);
    }
  },
};
