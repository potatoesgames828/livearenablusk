export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shape: 'circle' | 'square' | 'spark';
  rot: number;
  vr: number;
}

/** Sistema de partículas com pool fixo (sem alocação por quadro). */
export class ParticleSystem {
  private pool: Particle[] = [];
  private active = 0;

  constructor(private max = 600) {
    for (let i = 0; i < max; i++) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 4, color: '#fff', gravity: 0, shape: 'circle', rot: 0, vr: 0 });
    }
  }

  setBudget(max: number): void {
    this.max = Math.min(max, this.pool.length);
    if (this.active > this.max) this.active = this.max;
  }

  spawn(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.active >= this.max) return;
    const t = this.pool[this.active++];
    if (!t) return;
    t.x = p.x;
    t.y = p.y;
    t.vx = p.vx ?? 0;
    t.vy = p.vy ?? 0;
    t.maxLife = t.life = p.life ?? 1;
    t.size = p.size ?? 6;
    t.color = p.color ?? '#ffffff';
    t.gravity = p.gravity ?? 0;
    t.shape = p.shape ?? 'circle';
    t.rot = p.rot ?? 0;
    t.vr = p.vr ?? 0;
  }

  burst(x: number, y: number, color: string, count = 24, speed = 420, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, size: 4 + Math.random() * 8, color, ...opts });
    }
  }

  confetti(x: number, y: number, colors: string[], count = 60): void {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const s = 600 + Math.random() * 700;
      this.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6 + Math.random(), size: 10 + Math.random() * 10,
        color: colors[i % colors.length] ?? '#fff', gravity: 1400, shape: 'square', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.active; i++) {
      const p = this.pool[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        // troca com o último ativo
        const last = this.pool[--this.active]!;
        this.pool[i] = last;
        this.pool[this.active] = p;
        i--;
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.active; i++) {
      const p = this.pool[i]!;
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.shape === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size / 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  get count(): number {
    return this.active;
  }
}
