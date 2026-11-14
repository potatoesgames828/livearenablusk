/**
 * Personagens desenhados proceduralmente (sem assets de terceiros).
 * A aparência é derivada de forma determinística do ID do espectador, então
 * a mesma pessoa tem o mesmo visual em todas as partidas e telas.
 */

export interface Look {
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3;
  shirt: string;
  pants: string;
  accessory: 'none' | 'cap' | 'crown' | 'headband' | 'horns';
  eye: string;
}

const SKINS = ['#f2c7a5', '#e0a67e', '#c98a5e', '#9b6640', '#6e4528', '#f6d9c4'];
const HAIRS = ['#1f1a17', '#4a2f1d', '#8a5a2b', '#d9a441', '#e8e2d0', '#b8325b', '#3b6fd8', '#22223b'];
const SHIRTS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
const PANTS = ['#1e293b', '#334155', '#3f2d20', '#1d3557', '#2b2d42'];
const ACC: Look['accessory'][] = ['none', 'none', 'cap', 'headband', 'horns', 'none', 'cap'];

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function lookFromSeed(seed: string, override: Partial<Look> = {}): Look {
  const h = hashSeed(seed);
  const pick = <T,>(arr: readonly T[], shift: number) => arr[(h >>> shift) % arr.length]!;
  return {
    skin: pick(SKINS, 0),
    hair: pick(HAIRS, 3),
    hairStyle: ((h >>> 7) % 4) as Look['hairStyle'],
    shirt: pick(SHIRTS, 10),
    pants: pick(PANTS, 14),
    accessory: pick(ACC, 18),
    eye: '#111827',
    ...override,
  };
}

export type AvatarAction = 'idle' | 'run' | 'attack' | 'hit' | 'dead' | 'cheer';

export interface AvatarOpts {
  facing?: 1 | -1;
  /** fase de caminhada/animação em radianos (avança com o tempo) */
  phase?: number;
  action?: AvatarAction;
  /** 0..1 progresso da ação (ataque) */
  actionT?: number;
  weapon?: 'none' | 'sword' | 'staff' | 'hammer';
  teamColor?: string;
  crown?: boolean;
  shield?: boolean;
  alpha?: number;
}

function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * Desenha um personagem humanoide estilizado (cabeça grande, corpo curto),
 * ancorado pelos pés em (x, y). `s` é a altura aproximada em pixels.
 */
export function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, look: Look, o: AvatarOpts = {}): void {
  const f = o.facing ?? 1;
  const ph = o.phase ?? 0;
  const act = o.action ?? 'idle';
  const u = s / 100; // unidade
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.translate(x, y);
  if (act === 'dead') {
    ctx.rotate((Math.PI / 2) * f * 0.95);
    ctx.globalAlpha *= 0.65;
  }
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 26 * u, 7 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  const running = act === 'run';
  const bob = running ? Math.abs(Math.sin(ph)) * 5 * u : act === 'cheer' ? Math.abs(Math.sin(ph * 1.5)) * 10 * u : Math.sin(ph * 0.5) * 1.5 * u;
  ctx.translate(0, -bob);
  ctx.scale(f, 1);
  const swing = running ? Math.sin(ph) : 0;
  const hit = act === 'hit';
  // pernas
  const hipY = -34 * u;
  limb(ctx, -7 * u, hipY, -7 * u + swing * 12 * u, -4 * u, 10 * u, look.pants);
  limb(ctx, 7 * u, hipY, 7 * u - swing * 12 * u, -4 * u, 10 * u, look.pants);
  // sapatos
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.ellipse(-7 * u + swing * 12 * u + 3 * u, -3 * u, 7 * u, 4 * u, 0, 0, Math.PI * 2);
  ctx.ellipse(7 * u - swing * 12 * u + 3 * u, -3 * u, 7 * u, 4 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  // tronco
  const torsoTop = -70 * u;
  const tg = ctx.createLinearGradient(0, torsoTop, 0, hipY);
  tg.addColorStop(0, hit ? '#ffffff' : look.shirt);
  tg.addColorStop(1, hit ? '#fecaca' : shade(look.shirt, -0.25));
  ctx.fillStyle = tg;
  roundedRect(ctx, -16 * u, torsoTop, 32 * u, 40 * u, 10 * u);
  ctx.fill();
  if (o.teamColor) {
    ctx.fillStyle = o.teamColor;
    ctx.fillRect(-16 * u, torsoTop + 16 * u, 32 * u, 6 * u);
  }
  // braço de trás
  const atk = act === 'attack' ? Math.sin((o.actionT ?? 0) * Math.PI) : 0;
  const cheer = act === 'cheer';
  limb(ctx, -12 * u, torsoTop + 8 * u, -18 * u - swing * 8 * u, torsoTop + (cheer ? -22 : 30) * u, 8 * u, look.skin);
  // braço da frente + arma
  const armAngle = cheer ? -2.2 : -0.3 + swing * 0.6 - atk * 2.2;
  const ax = 12 * u + Math.cos(armAngle + Math.PI / 2) * 0;
  const handX = ax + Math.sin(-armAngle) * -26 * u;
  const handY = torsoTop + 8 * u + Math.cos(armAngle) * 26 * u;
  limb(ctx, ax, torsoTop + 8 * u, handX, handY, 8 * u, look.skin);
  if (o.weapon && o.weapon !== 'none') {
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(armAngle - 0.6);
    if (o.weapon === 'sword') {
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(-3 * u, 0);
      ctx.lineTo(3 * u, 0);
      ctx.lineTo(2 * u, -42 * u);
      ctx.lineTo(0, -48 * u);
      ctx.lineTo(-2 * u, -42 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-9 * u, -2 * u, 18 * u, 5 * u);
    } else if (o.weapon === 'staff') {
      limb(ctx, 0, 14 * u, 0, -44 * u, 5 * u, '#7c4a1e');
      ctx.fillStyle = '#a78bfa';
      ctx.shadowColor = '#a78bfa';
      ctx.shadowBlur = 14 * u;
      ctx.beginPath();
      ctx.arc(0, -48 * u, 7 * u, 0, Math.PI * 2);
      ctx.fill();
    } else {
      limb(ctx, 0, 10 * u, 0, -34 * u, 5 * u, '#57534e');
      ctx.fillStyle = '#9ca3af';
      roundedRect(ctx, -12 * u, -46 * u, 24 * u, 14 * u, 3 * u);
      ctx.fill();
    }
    ctx.restore();
  }
  // cabeça
  const headY = torsoTop - 22 * u;
  ctx.fillStyle = hit ? '#ffffff' : look.skin;
  ctx.beginPath();
  ctx.arc(0, headY, 24 * u, 0, Math.PI * 2);
  ctx.fill();
  // cabelo
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  if (look.hairStyle === 0) ctx.arc(0, headY - 4 * u, 24 * u, Math.PI, Math.PI * 2);
  else if (look.hairStyle === 1) {
    ctx.arc(0, headY - 4 * u, 25 * u, Math.PI * 0.9, Math.PI * 2.1);
    ctx.rect(-25 * u, headY - 6 * u, 10 * u, 22 * u);
  } else if (look.hairStyle === 2) {
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * 9 * u - 6 * u, headY - 14 * u);
      ctx.lineTo(i * 9 * u, headY - 34 * u);
      ctx.lineTo(i * 9 * u + 6 * u, headY - 14 * u);
    }
    ctx.arc(0, headY - 6 * u, 23 * u, Math.PI, Math.PI * 2);
  } else {
    ctx.arc(0, headY - 2 * u, 26 * u, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(14 * u, headY - 22 * u, 9 * u, 0, Math.PI * 2);
  }
  ctx.fill();
  // olhos e boca (face voltada para frente)
  if (act === 'dead') {
    ctx.strokeStyle = look.eye;
    ctx.lineWidth = 3 * u;
    for (const ex of [4, 14]) {
      ctx.beginPath();
      ctx.moveTo((ex - 4) * u, headY - 4 * u);
      ctx.lineTo((ex + 4) * u, headY + 4 * u);
      ctx.moveTo((ex + 4) * u, headY - 4 * u);
      ctx.lineTo((ex - 4) * u, headY + 4 * u);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(4 * u, headY, 5 * u, 6 * u, 0, 0, Math.PI * 2);
    ctx.ellipse(15 * u, headY, 5 * u, 6 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.eye;
    const blink = Math.sin(ph * 0.37) > 0.97 ? 0.2 : 1;
    ctx.beginPath();
    ctx.ellipse(6 * u, headY + 1 * u, 2.6 * u, 3.2 * u * blink, 0, 0, Math.PI * 2);
    ctx.ellipse(17 * u, headY + 1 * u, 2.6 * u, 3.2 * u * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    if (hit) ctx.arc(10 * u, headY + 13 * u, 4 * u, Math.PI, Math.PI * 2);
    else ctx.arc(10 * u, headY + 8 * u, 5 * u, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  // acessórios
  if (o.crown || look.accessory === 'crown') {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-16 * u, headY - 20 * u);
    for (let i = 0; i <= 4; i++) ctx.lineTo(-16 * u + i * 8 * u, headY - (i % 2 === 0 ? 40 : 28) * u);
    ctx.lineTo(16 * u, headY - 20 * u);
    ctx.closePath();
    ctx.fill();
  } else if (look.accessory === 'cap') {
    ctx.fillStyle = shade(look.shirt, -0.1);
    ctx.beginPath();
    ctx.arc(0, headY - 8 * u, 24 * u, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(0, headY - 10 * u, 34 * u, 6 * u);
  } else if (look.accessory === 'headband') {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-24 * u, headY - 14 * u, 48 * u, 6 * u);
  } else if (look.accessory === 'horns') {
    ctx.fillStyle = '#f5f5f4';
    ctx.beginPath();
    ctx.moveTo(-14 * u, headY - 18 * u);
    ctx.lineTo(-22 * u, headY - 38 * u);
    ctx.lineTo(-6 * u, headY - 22 * u);
    ctx.moveTo(14 * u, headY - 18 * u);
    ctx.lineTo(22 * u, headY - 38 * u);
    ctx.lineTo(6 * u, headY - 22 * u);
    ctx.fill();
  }
  ctx.restore();
  if (o.shield) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.85)';
    ctx.lineWidth = 4 * u;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 18 * u;
    ctx.beginPath();
    ctx.arc(x, y - 55 * u, 58 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export type AnimalKind = 'raposa' | 'coelho' | 'tartaruga' | 'galinha' | 'porco' | 'sapo' | 'cavalo' | 'pinguim';

export const ANIMALS: Array<{ kind: AnimalKind; name: string; color: string; speed: number; accel: number; stamina: number; trait: string }> = [
  { kind: 'raposa', name: 'Raposa', color: '#f97316', speed: 1.05, accel: 1.0, stamina: 0.9, trait: 'Arranque rápido' },
  { kind: 'coelho', name: 'Coelho', color: '#e5e7eb', speed: 1.1, accel: 1.15, stamina: 0.75, trait: 'Pula obstáculos' },
  { kind: 'tartaruga', name: 'Tartaruga', color: '#22c55e', speed: 0.8, accel: 0.7, stamina: 1.4, trait: 'Casco: ignora tropeços' },
  { kind: 'galinha', name: 'Galinha', color: '#fde68a', speed: 0.95, accel: 1.25, stamina: 0.85, trait: 'Bate as asas no turbo' },
  { kind: 'porco', name: 'Porco', color: '#f9a8d4', speed: 0.92, accel: 0.9, stamina: 1.2, trait: 'Atropela lama' },
  { kind: 'sapo', name: 'Sapo', color: '#4ade80', speed: 1.0, accel: 1.05, stamina: 1.0, trait: 'Saltos longos' },
  { kind: 'cavalo', name: 'Cavalo', color: '#a16207', speed: 1.15, accel: 0.85, stamina: 1.0, trait: 'Velocidade máxima alta' },
  { kind: 'pinguim', name: 'Pinguim', color: '#1f2937', speed: 0.9, accel: 1.0, stamina: 1.1, trait: 'Desliza na reta final' },
];

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(x + r * 0.3, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

/** Desenha um animal correndo para a direita, ancorado pelos pés em (x, y). */
export function drawAnimal(ctx: CanvasRenderingContext2D, kind: AnimalKind, x: number, y: number, s: number, phase: number, opts: { stunned?: boolean; boosting?: boolean } = {}): void {
  const u = s / 100;
  const run = Math.sin(phase);
  const leg = (lx: number, ly: number, len: number, a: number, color: string, w = 7) => limb(ctx, lx * u, ly * u, (lx + Math.sin(a) * len) * u, (ly + Math.cos(a) * len) * u, w * u, color);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 40 * u, 8 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  if (opts.stunned) ctx.rotate(Math.sin(phase * 3) * 0.15);
  const bob = Math.abs(run) * 4 * u;
  ctx.translate(0, -bob);
  switch (kind) {
    case 'raposa': {
      leg(-22, -26, 24, run * 0.8, '#c2410c');
      leg(18, -26, 24, -run * 0.8, '#c2410c');
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.ellipse(0, -36 * u, 34 * u, 16 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-30 * u, -40 * u);
      ctx.quadraticCurveTo(-70 * u, -60 * u + run * 6 * u, -60 * u, -28 * u);
      ctx.quadraticCurveTo(-45 * u, -30 * u, -30 * u, -32 * u);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-62 * u, -32 * u, 7 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(26 * u, -52 * u);
      ctx.lineTo(58 * u, -40 * u);
      ctx.lineTo(28 * u, -30 * u);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(30 * u, -50 * u);
      ctx.lineTo(34 * u, -70 * u);
      ctx.lineTo(42 * u, -48 * u);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(58 * u, -40 * u, 3 * u, 0, Math.PI * 2);
      ctx.fill();
      eye(ctx, 40 * u, -44 * u, 4 * u);
      break;
    }
    case 'coelho': {
      const hop = Math.max(0, Math.sin(phase)) * 14 * u;
      ctx.translate(0, -hop);
      leg(-14, -18, 18, 1.2 + run * 0.4, '#d1d5db', 9);
      ctx.fillStyle = '#f3f4f6';
      ctx.beginPath();
      ctx.ellipse(-4 * u, -32 * u, 26 * u, 20 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(24 * u, -48 * u, 16 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(20 * u, -80 * u, 5 * u, 18 * u, -0.2, 0, Math.PI * 2);
      ctx.ellipse(30 * u, -78 * u, 5 * u, 18 * u, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f9a8d4';
      ctx.beginPath();
      ctx.ellipse(20 * u, -80 * u, 2 * u, 12 * u, -0.2, 0, Math.PI * 2);
      ctx.arc(39 * u, -46 * u, 3 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-30 * u, -34 * u, 8 * u, 0, Math.PI * 2);
      ctx.fill();
      eye(ctx, 30 * u, -52 * u, 4 * u);
      break;
    }
    case 'tartaruga': {
      leg(-18, -14, 12, run * 0.6, '#16a34a', 10);
      leg(16, -14, 12, -run * 0.6, '#16a34a', 10);
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(40 * u, -22 * u, 13 * u, 10 * u, 0.2, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(0, -34 * u, 4 * u, 0, -26 * u, 36 * u);
      g.addColorStop(0, '#84cc16');
      g.addColorStop(1, '#365314');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -24 * u, 34 * u, 24 * u, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2 * u;
      for (const hx of [-14, 0, 14]) {
        ctx.beginPath();
        ctx.arc(hx * u, -34 * u, 7 * u, 0, Math.PI * 2);
        ctx.stroke();
      }
      eye(ctx, 44 * u, -26 * u, 3.5 * u);
      break;
    }
    case 'galinha': {
      leg(-4, -22, 22, run * 0.9, '#f59e0b', 4);
      leg(6, -22, 22, -run * 0.9, '#f59e0b', 4);
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.ellipse(0, -40 * u, 24 * u, 20 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(20 * u, -62 * u, 13 * u, 0, Math.PI * 2);
      ctx.fill();
      const flap = opts.boosting ? Math.sin(phase * 3) * 0.8 : 0.2;
      ctx.save();
      ctx.translate(-4 * u, -42 * u);
      ctx.rotate(-flap);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.ellipse(-10 * u, 0, 16 * u, 9 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(18 * u, -76 * u, 5 * u, 0, Math.PI * 2);
      ctx.arc(24 * u, -74 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(31 * u, -64 * u);
      ctx.lineTo(42 * u, -60 * u);
      ctx.lineTo(31 * u, -57 * u);
      ctx.fill();
      eye(ctx, 24 * u, -65 * u, 3 * u);
      break;
    }
    case 'porco': {
      leg(-18, -22, 20, run * 0.7, '#ec4899', 9);
      leg(16, -22, 20, -run * 0.7, '#ec4899', 9);
      ctx.fillStyle = '#f9a8d4';
      ctx.beginPath();
      ctx.ellipse(0, -36 * u, 34 * u, 20 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(32 * u, -44 * u, 15 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.ellipse(46 * u, -42 * u, 7 * u, 6 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(26 * u, -56 * u);
      ctx.lineTo(30 * u, -66 * u);
      ctx.lineTo(36 * u, -56 * u);
      ctx.fill();
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(-36 * u, -40 * u, 5 * u, 0, Math.PI * 1.5);
      ctx.stroke();
      eye(ctx, 34 * u, -50 * u, 3.5 * u);
      break;
    }
    case 'sapo': {
      const jump = Math.max(0, Math.sin(phase * 0.8)) * 22 * u;
      ctx.translate(0, -jump);
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.ellipse(-16 * u, -12 * u, 18 * u, 9 * u, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(0, -28 * u, 30 * u, 20 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bbf7d0';
      ctx.beginPath();
      ctx.ellipse(6 * u, -20 * u, 18 * u, 9 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      eye(ctx, 6 * u, -50 * u, 8 * u);
      eye(ctx, 24 * u, -48 * u, 8 * u);
      break;
    }
    case 'cavalo': {
      leg(-24, -40, 38, run * 0.7, '#713f12', 8);
      leg(-14, -40, 38, -run * 0.7, '#854d0e', 8);
      leg(20, -40, 38, -run * 0.7, '#713f12', 8);
      leg(30, -40, 38, run * 0.7, '#854d0e', 8);
      ctx.fillStyle = '#a16207';
      ctx.beginPath();
      ctx.ellipse(2 * u, -50 * u, 38 * u, 16 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(34 * u, -58 * u);
      ctx.rotate(-0.6);
      ctx.fillRect(-8 * u, -32 * u, 18 * u, 34 * u);
      ctx.beginPath();
      ctx.ellipse(10 * u, -34 * u, 18 * u, 10 * u, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#422006';
      ctx.beginPath();
      ctx.moveTo(26 * u, -80 * u);
      ctx.quadraticCurveTo(14 * u, -60 * u, 22 * u, -50 * u);
      ctx.lineTo(30 * u, -62 * u);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-36 * u, -54 * u);
      ctx.quadraticCurveTo(-56 * u, -40 * u + run * 8 * u, -50 * u, -20 * u);
      ctx.lineTo(-34 * u, -44 * u);
      ctx.fill();
      eye(ctx, 48 * u, -86 * u, 3.5 * u);
      break;
    }
    case 'pinguim': {
      const waddle = Math.sin(phase) * 0.18;
      ctx.rotate(waddle);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.ellipse(-8 * u, -3 * u, 9 * u, 4 * u, 0, 0, Math.PI * 2);
      ctx.ellipse(10 * u, -3 * u, 9 * u, 4 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.ellipse(0, -40 * u, 24 * u, 36 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(6 * u, -36 * u, 15 * u, 28 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(18 * u, -60 * u);
      ctx.lineTo(32 * u, -56 * u);
      ctx.lineTo(18 * u, -52 * u);
      ctx.fill();
      eye(ctx, 12 * u, -64 * u, 3.5 * u);
      break;
    }
  }
  if (opts.stunned) {
    ctx.fillStyle = '#fde047';
    for (let i = 0; i < 3; i++) {
      const a = phase * 2 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 20 * u, -96 * u + Math.sin(a) * 6 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
