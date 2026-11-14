import type { FxMarker } from '@live-arena/game-engine';
import { drawAvatar, drawHud, hexToRgba, lookFromSeed, roundRect, shade, text, type GameRenderer, type RenderKit, type RenderView } from '@live-arena/game-engine/render';
import type { Fruit, MelonSnapshot } from './sim';

const FRUIT: Record<Fruit, { skin: string; stripe: string; flesh: string; seed: string }> = {
  melancia: { skin: '#15803d', stripe: '#166534', flesh: '#ef4444', seed: '#1c1917' },
  abobora: { skin: '#f97316', stripe: '#c2410c', flesh: '#fdba74', seed: '#fef3c7' },
  melao: { skin: '#d9f99d', stripe: '#a3e635', flesh: '#fde68a', seed: '#fef9c3' },
};

let popAt = -1;

/** Largura relativa da fruta numa altura (-1..1), com a "cintura" apertada pela pressão. */
function widthAt(y: number, pinch: number): number {
  const base = Math.sqrt(Math.max(0, 1 - y * y));
  const waist = 1 - pinch * Math.exp(-(y * y) / 0.08);
  return base * waist;
}

function fruitPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, pinch: number): void {
  ctx.beginPath();
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const y = -1 + (2 * i) / N;
    const x = widthAt(y, pinch) * rx;
    if (i === 0) ctx.moveTo(cx + x, cy + y * ry);
    else ctx.lineTo(cx + x, cy + y * ry);
  }
  for (let i = N; i >= 0; i--) {
    const y = -1 + (2 * i) / N;
    ctx.lineTo(cx - widthAt(y, pinch) * rx, cy + y * ry);
  }
  ctx.closePath();
}

function drawKitchen(ctx: CanvasRenderingContext2D, s: MelonSnapshot): void {
  const W = s.width;
  const H = s.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1e1b4b');
  g.addColorStop(0.6, '#312e81');
  g.addColorStop(1, '#0f0a2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // azulejos
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H * 0.7);
    ctx.stroke();
  }
  for (let y = 0; y < H * 0.7; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // mesa
  const ty = s.aspect === 'vertical' ? H * 0.68 : H * 0.78;
  const tg = ctx.createLinearGradient(0, ty, 0, H);
  tg.addColorStop(0, '#92400e');
  tg.addColorStop(1, '#451a03');
  ctx.fillStyle = tg;
  ctx.fillRect(0, ty, W, H - ty);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, ty, W, 8);
}

export const renderer: GameRenderer<MelonSnapshot> = {
  draw(ctx, { snap: s, time, kit }: RenderView<MelonSnapshot>) {
    const W = s.width;
    const H = s.height;
    const vertical = s.aspect === 'vertical';
    drawKitchen(ctx, s);
    const col = FRUIT[s.fruit];
    const cx = vertical ? W / 2 : W * 0.45;
    const tableY = vertical ? H * 0.68 : H * 0.78;
    const R = vertical ? 330 : 300;
    const rx = R * 1.15;
    const ry = R * 0.95;
    const cy = tableY - ry + 30;
    const pinch = Math.min(0.42, s.pressure * 0.42);
    const tremble = s.pressure > 0.75 && !s.popped ? (Math.sin(time * 60) * (s.pressure - 0.75) * 30) : 0;

    if (!s.popped) {
      popAt = -1;
      ctx.save();
      ctx.translate(tremble, 0);
      // sombra
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, tableY + 20, rx * 0.95, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      // casca
      fruitPath(ctx, cx, cy, rx, ry, pinch);
      const fg = ctx.createRadialGradient(cx - rx * 0.4, cy - ry * 0.4, 20, cx, cy, rx * 1.2);
      fg.addColorStop(0, shade(col.skin, 0.3));
      fg.addColorStop(1, shade(col.skin, -0.35));
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.save();
      fruitPath(ctx, cx, cy, rx, ry, pinch);
      ctx.clip();
      // listras verticais
      ctx.strokeStyle = col.stripe;
      ctx.lineWidth = 26;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        for (let k = 0; k <= 30; k++) {
          const y = -1 + (2 * k) / 30;
          const x = cx + (i / 4.5) * widthAt(y, pinch) * rx + Math.sin(y * 6 + i) * 8;
          if (k === 0) ctx.moveTo(x, cy + y * ry);
          else ctx.lineTo(x, cy + y * ry);
        }
        ctx.stroke();
      }
      // rachaduras
      if (s.pressure > 0.55) {
        const amount = (s.pressure - 0.55) / 0.45;
        ctx.strokeStyle = hexToRgba(col.flesh, 0.9);
        ctx.lineWidth = 5;
        for (let i = 0; i < Math.ceil(amount * 8); i++) {
          const side = i % 2 ? 1 : -1;
          const y0 = (i * 0.13) % 0.5 - 0.25;
          let x = cx + side * widthAt(y0, pinch) * rx * 0.95;
          let y = cy + y0 * ry;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 5; k++) {
            x -= side * (18 + ((i * 7 + k * 13) % 20));
            y += ((k * 17 + i * 5) % 30) - 15;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
      // brilho
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(cx - rx * 0.45, cy - ry * 0.45, rx * 0.18, ry * 0.1, -0.6, 0, Math.PI * 2);
      ctx.fill();
      // elásticos (anéis na frente)
      for (const b of s.bands) {
        const y = b.p * 0.45;
        const w = widthAt(y, pinch) * rx;
        const by = cy + y * ry;
        ctx.strokeStyle = b.c;
        ctx.lineWidth = b.th ? 16 : 6;
        ctx.beginPath();
        ctx.ellipse(cx, by, w, 22 + Math.abs(y) * 10, 0, 0, Math.PI);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = b.th ? 4 : 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, by - 2, w, 22 + Math.abs(y) * 10, 0, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
      // cabo
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(cx, cy - ry + 6);
      ctx.quadraticCurveTo(cx + 20, cy - ry - 30, cx + 40, cy - ry - 40);
      ctx.stroke();
      ctx.restore();
    } else {
      // estouro: metades voando e suco
      if (popAt < 0) popAt = time;
      const t = Math.min(2, time - popAt);
      const fl = s.safe ? '#f9a8d4' : col.flesh;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + side * t * 420, cy + t * t * 260 - t * 200);
        ctx.rotate(side * t * 2.2);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * 0.55, ry * 0.85, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? Math.PI * 1.5 : Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = col.skin;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(side * 6, 0, rx * 0.47, ry * 0.77, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? Math.PI * 1.5 : Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = fl;
        ctx.fill();
        ctx.fillStyle = col.seed;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.ellipse(side * (20 + (i % 3) * 30), -ry * 0.5 + i * ry * 0.13, 6, 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // poça de suco
      ctx.fillStyle = hexToRgba(fl, 0.6);
      ctx.beginPath();
      ctx.ellipse(cx, tableY + 20, rx * Math.min(1.3, t), 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // chef
    const chefX = vertical ? cx + rx + 30 : cx + rx + 160;
    const chefX2 = Math.min(W - 90, chefX);
    drawAvatar(ctx, chefX2, tableY + 10, vertical ? 260 : 280, lookFromSeed('chef', { shirt: '#f8fafc', pants: '#1f2937', accessory: 'none', hair: '#3f2d20' }), {
      facing: -1, action: s.popped ? 'hit' : s.chefAct > 0 ? 'attack' : 'idle', actionT: 1 - s.chefAct, phase: time * 4,
    });
    // chapéu de chef
    const hatY = tableY + 10 - (vertical ? 260 : 280) * 1.12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(chefX2 - 10, hatY - 10, 34, 0, Math.PI * 2);
    ctx.arc(chefX2 + 22, hatY - 18, 30, 0, Math.PI * 2);
    ctx.arc(chefX2 - 40, hatY - 16, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(chefX2 - 50, hatY, 90, 26);

    // contador
    const panelW = vertical ? 520 : 460;
    const px = vertical ? (W - panelW) / 2 : W - panelW - 60;
    const py = vertical ? 200 : 220;
    ctx.save();
    roundRect(ctx, px, py, panelW, 230, 32);
    ctx.fillStyle = 'rgba(8,12,28,0.8)';
    ctx.fill();
    ctx.restore();
    text(ctx, `${s.count}`, px + panelW / 2, py + 110, { size: 110, weight: 900, color: '#fff', align: 'center' });
    text(ctx, 'ELÁSTICOS', px + panelW / 2, py + 155, { size: 30, weight: 900, color: '#a3e635', align: 'center' });
    const mood = s.popped ? 'ESTOUROU!' : s.pressure > 0.85 ? 'VAI ESTOURAR!' : s.pressure > 0.6 ? 'RACHANDO…' : s.pressure > 0.3 ? 'APERTANDO' : 'CALMA';
    const moodColor = s.pressure > 0.85 || s.popped ? '#ef4444' : s.pressure > 0.6 ? '#f97316' : s.pressure > 0.3 ? '#eab308' : '#22c55e';
    text(ctx, mood, px + panelW / 2, py + 205, { size: 34, weight: 900, color: moodColor, align: 'center' });
    if (s.queue > 0 && !s.popped) text(ctx, `+${s.queue} na fila`, px + panelW / 2, py + 270, { size: 28, weight: 800, color: '#fde68a', align: 'center' });
    if (s.lastOwners.length && !s.popped) {
      text(ctx, `Últimos: ${s.lastOwners.slice(0, 3).join(', ')}`, W / 2, H - (vertical ? 260 : 120), { size: 30, weight: 700, color: '#e2e8f0', align: 'center', maxWidth: W - 80 });
    }
    text(ctx, `Digite "${s.freeHint}" para colocar seu elástico grátis`, W / 2, H - (vertical ? 200 : 70), { size: 32, weight: 800, color: '#a3e635', align: 'center', maxWidth: W - 80 });

    kit.particles.draw(ctx);
    if (s.popped && s.popper) {
      const y = vertical ? H * 0.42 : H * 0.4;
      text(ctx, '💥 ESTOUROU!', W / 2, y, { size: vertical ? 96 : 110, weight: 900, color: '#facc15', align: 'center', stroke: 'rgba(0,0,0,0.75)' });
      text(ctx, `${s.popper.name} ${s.popper.by === 'hammer' ? 'deu a martelada' : 'colocou o último elástico'}`, W / 2, y + 80, { size: 44, weight: 800, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,0.75)', maxWidth: W - 60 });
      text(ctx, `${s.count} elásticos`, W / 2, y + 140, { size: 36, weight: 700, color: '#e2e8f0', align: 'center', stroke: 'rgba(0,0,0,0.6)' });
    }
    // HUD padrão (ranking, avisos, pausa), sem o painel de rodada duplicado
    drawHud(ctx, { ...s, phase: s.phase === 'intermission' ? 'playing' : s.phase }, 'Melancia Elástica', '#22c55e', time);
    if (s.phase === 'intermission') text(ctx, `Nova fruta em ${s.phaseEndsIn ?? 0}s`, W / 2, vertical ? H * 0.42 + 200 : H * 0.4 + 190, { size: 34, weight: 800, color: '#94a3b8', align: 'center' });
  },
  onFx(fx: FxMarker, kit: RenderKit, snap: MelonSnapshot) {
    if (fx.kind === 'snap') kit.sound.play('pop', 40);
    else if (fx.kind === 'remove') kit.sound.play('coin', 60);
    else if (fx.kind === 'scissors') {
      kit.sound.play('hit', 0);
      kit.particles.burst(snap.width / 2, snap.height * 0.5, '#a3e635', 20, 400);
    } else if (fx.kind === 'pop') {
      kit.sound.play('boom', 0);
      kit.flash(fx.color ?? '#ef4444', 0.7);
      kit.shake(26);
      kit.particles.burst(fx.x, fx.y, fx.color ?? '#ef4444', 120, 1100);
      kit.particles.burst(fx.x, fx.y, '#1c1917', 40, 900);
    } else if (fx.kind === 'hammer') {
      kit.sound.play('hit', 0);
      kit.shake(14);
    }
  },
};
