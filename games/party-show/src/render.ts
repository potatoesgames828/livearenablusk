import type { FxMarker } from '@live-arena/game-engine';
import { drawAvatar, drawHud, lookFromSeed, roundRect, text, type GameRenderer, type RenderKit, type RenderView } from '@live-arena/game-engine/render';
import type { PartySnapshot } from './sim';

const OPT_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'];
const LETTERS = ['A', 'B', 'C', 'D'];
const MODE_LABEL: Record<PartySnapshot['mode'], string> = { quiz: 'QUIZ', poll: 'ENQUETE', number: 'ADIVINHE O NÚMERO', word: 'PALAVRA EMBARALHADA' };

function wrap(ctx: CanvasRenderingContext2D, value: string, maxW: number, size: number): string[] {
  ctx.save();
  ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
  const words = value.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  ctx.restore();
  return lines.slice(0, 4);
}

export const renderer: GameRenderer<PartySnapshot> = {
  draw(ctx, { snap: s, time, kit }: RenderView<PartySnapshot>) {
    const W = s.width;
    const H = s.height;
    const vertical = s.aspect === 'vertical';
    // estúdio
    const g = ctx.createRadialGradient(W / 2, H * 0.3, 50, W / 2, H * 0.4, H);
    g.addColorStop(0, '#4c1d95');
    g.addColorStop(1, '#0c0420');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      const a = Math.sin(time * 0.6 + i * 1.3) * 0.35;
      ctx.save();
      ctx.translate(W * (0.1 + i * 0.2), -40);
      ctx.rotate(a);
      const lg = ctx.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, 'rgba(250,232,255,0.16)');
      lg.addColorStop(1, 'rgba(250,232,255,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(20, 0);
      ctx.lineTo(180, H);
      ctx.lineTo(-180, H);
      ctx.fill();
      ctx.restore();
    }
    // card
    const cw = vertical ? W - 80 : 980;
    const cx = (W - cw) / 2;
    const cy = vertical ? 470 : 190;
    text(ctx, `${MODE_LABEL[s.mode]} · DESAFIO ${s.challengeNo}`, W / 2, cy - 30, { size: 30, weight: 900, color: '#e9d5ff', align: 'center' });
    const lines = wrap(ctx, s.prompt, cw - 80, vertical ? 52 : 50);
    const ch = 80 + lines.length * 62;
    ctx.save();
    roundRect(ctx, cx, cy, cw, ch, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.restore();
    lines.forEach((l, i) => text(ctx, l, W / 2, cy + 82 + i * 62, { size: vertical ? 52 : 50, weight: 800, color: '#1e1b4b', align: 'center', maxWidth: cw - 60 }));
    // timer
    const tx = vertical ? W / 2 : cx - 90;
    const ty = vertical ? cy - 130 : cy + 70;
    const frac = s.total ? s.timeLeft / s.total : 0;
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(tx, ty, 58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = frac > 0.3 ? '#a3e635' : '#f87171';
    ctx.beginPath();
    ctx.arc(tx, ty, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    text(ctx, s.phase === 'intermission' ? '✓' : String(s.timeLeft), tx, ty + 16, { size: 46, weight: 900, color: '#fff', align: 'center' });
    // conteúdo por modo
    const by = cy + ch + 40;
    if (s.mode === 'quiz' || s.mode === 'poll') {
      const n = s.options.length;
      const cols = vertical || n <= 2 ? 1 : 2;
      const rows = Math.ceil(n / cols);
      const ow = (cw - (cols - 1) * 24) / cols;
      const oh = vertical ? 120 : 110;
      const total = Math.max(1, s.options.reduce((a, o) => a + o.count, 0));
      s.options.forEach((o, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = cx + col * (ow + 24);
        const y = by + row * (oh + 20);
        const reveal = s.phase === 'intermission';
        const dim = o.removed || (reveal && s.mode === 'quiz' && !o.correct);
        ctx.save();
        ctx.globalAlpha = dim ? 0.35 : 1;
        roundRect(ctx, x, y, ow, oh, 24);
        ctx.fillStyle = OPT_COLORS[i]!;
        ctx.fill();
        // barra de votos
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        roundRect(ctx, x, y, ow * (o.count / total), oh, 24);
        ctx.fill();
        if (o.correct) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 8;
          roundRect(ctx, x, y, ow, oh, 24);
          ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = dim ? 0.5 : 1;
        text(ctx, LETTERS[i]!, x + 50, y + oh / 2 + 18, { size: 52, weight: 900, color: '#fff', align: 'center' });
        text(ctx, o.text, x + 100, y + oh / 2 + 14, { size: 40, weight: 800, color: '#fff', maxWidth: ow - 220 });
        text(ctx, String(o.count), x + ow - 30, y + oh / 2 + 14, { size: 38, weight: 900, color: '#fff', align: 'right' });
        ctx.restore();
      });
      text(ctx, s.mode === 'quiz' ? 'Responda com A, B, C ou D' : 'Vote com a letra da opção', W / 2, by + rows * (oh + 20) + 40, { size: 32, weight: 800, color: '#e9d5ff', align: 'center' });
    } else if (s.mode === 'number') {
      const [lo, hi] = s.range ?? [1, 100];
      text(ctx, '?', W / 2, by + 170, { size: 220, weight: 900, color: '#facc15', align: 'center', stroke: 'rgba(0,0,0,0.4)' });
      text(ctx, `Entre ${lo} e ${hi}`, W / 2, by + 250, { size: 44, weight: 800, color: '#fff', align: 'center' });
      const chips = s.recentGuesses ?? [];
      chips.forEach((c, i) => {
        const x = W / 2 + (i - (chips.length - 1) / 2) * (vertical ? 160 : 190);
        ctx.save();
        roundRect(ctx, x - 75, by + 300, 150, 80, 20);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
        ctx.restore();
        text(ctx, String(c.value), x, by + 344, { size: 36, weight: 900, color: '#fff', align: 'center' });
        text(ctx, c.name, x, by + 370, { size: 18, weight: 700, color: '#d8b4fe', align: 'center', maxWidth: 140 });
      });
      text(ctx, `${s.answers} palpites · mande um número no chat`, W / 2, by + 440, { size: 30, weight: 800, color: '#e9d5ff', align: 'center' });
    } else {
      const letters = (s.scrambled ?? '').split('');
      const size = Math.min(110, (cw - 40) / Math.max(1, letters.length) - 10);
      letters.forEach((l, i) => {
        const x = W / 2 + (i - (letters.length - 1) / 2) * (size + 10);
        const bob = Math.sin(time * 3 + i) * 6;
        ctx.save();
        roundRect(ctx, x - size / 2, by + 40 + bob, size, size, 16);
        ctx.fillStyle = '#facc15';
        ctx.fill();
        ctx.restore();
        text(ctx, l, x, by + 40 + bob + size * 0.72, { size: size * 0.7, weight: 900, color: '#422006', align: 'center' });
      });
      if (s.hint) text(ctx, `Dica: ${s.hint}`, W / 2, by + size + 120, { size: 44, weight: 900, color: '#fde047', align: 'center' });
      text(ctx, 'Escreva a palavra certa no chat', W / 2, by + size + 190, { size: 32, weight: 800, color: '#e9d5ff', align: 'center' });
    }
    // apresentador
    const hostX = vertical ? 150 : W - 190;
    const hostY = vertical ? H - 260 : H - 40;
    drawAvatar(ctx, hostX, hostY, vertical ? 300 : 340, lookFromSeed('apresentador', { shirt: '#7c3aed', hair: '#111827', accessory: 'none' }), {
      facing: (vertical ? 1 : -1) as 1 | -1, action: s.phase === 'intermission' ? 'cheer' : 'idle', phase: time * 4,
    });
    // resultado
    if (s.result && s.phase === 'intermission') {
      const rw = vertical ? W - 120 : 900;
      const rx = (W - rw) / 2;
      const ry = vertical ? H * 0.52 : H * 0.42;
      ctx.save();
      roundRect(ctx, rx, ry, rw, 340, 32);
      ctx.fillStyle = 'rgba(17,24,39,0.94)';
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
      text(ctx, s.mode === 'poll' ? 'O CHAT ESCOLHEU' : 'RESPOSTA', W / 2, ry + 56, { size: 30, weight: 900, color: '#d8b4fe', align: 'center' });
      text(ctx, s.result.answer, W / 2, ry + 120, { size: 56, weight: 900, color: '#facc15', align: 'center', maxWidth: rw - 40 });
      text(ctx, s.result.detail, W / 2, ry + 170, { size: 30, weight: 700, color: '#e2e8f0', align: 'center' });
      s.result.winners.slice(0, 3).forEach((w, i) => {
        text(ctx, `${['🥇', '🥈', '🥉'][i]} ${w.name}  +${w.pts}`, W / 2, ry + 225 + i * 40, { size: 30, weight: 800, color: '#fff', align: 'center', maxWidth: rw - 40 });
      });
    }
    // times
    if (s.teams) {
      const [a, b] = s.teams as [NonNullable<PartySnapshot['teams']>[number], NonNullable<PartySnapshot['teams']>[number]];
      const y = vertical ? H - 150 : H - 120;
      text(ctx, `${a.name} ${a.score}`, W / 2 - 30, y, { size: 40, weight: 900, color: a.color, align: 'right' });
      text(ctx, '×', W / 2, y, { size: 40, weight: 900, color: '#fff', align: 'center' });
      text(ctx, `${b.score} ${b.name}`, W / 2 + 30, y, { size: 40, weight: 900, color: b.color });
    }
    kit.particles.draw(ctx);
    drawHud(ctx, { ...s, phase: s.phase === 'intermission' ? 'playing' : s.phase }, 'Show de Perguntas', '#a855f7', time);
  },
  onFx(fx: FxMarker, kit: RenderKit, snap: PartySnapshot) {
    if (fx.kind === 'correct') {
      kit.particles.confetti(snap.width / 2, snap.height * 0.3, ['#a855f7', '#facc15', '#22c55e', '#ef4444'], 120);
      kit.sound.play('win', 0);
    } else if (fx.kind === 'reveal') kit.sound.play('coin', 0);
  },
};
