export interface Vec {
  x: number;
  y: number;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const dist = (a: Vec, b: Vec) => Math.sqrt(dist2(a, b));
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function normalize(x: number, y: number): Vec {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export function clampN(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
