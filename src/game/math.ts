export const TAU = Math.PI * 2;

/** mulberry32 – small seedable PRNG so tests/replays are reproducible. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Wraps to (-PI, PI]. */
export function normalizeAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/**
 * Heading convention: 0 = up (-y), positive = clockwise. Matches PixiJS `rotation`
 * for sprites drawn bow-up, so the renderer can copy the value directly.
 */
export const forwardX = (h: number) => Math.sin(h);
export const forwardY = (h: number) => -Math.cos(h);
export const headingTo = (dx: number, dy: number) => Math.atan2(dx, -dy);

export function turnToward(current: number, target: number, maxDelta: number): number {
  const diff = normalizeAngle(target - current);
  return normalizeAngle(current + clamp(diff, -maxDelta, maxDelta));
}

export interface Circle { x: number; y: number; radius: number }

export const circlesOverlap = (a: Circle, b: Circle) => {
  const dx = a.x - b.x, dy = a.y - b.y, r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
};

/** Swept test: does segment p0→p1 (thickened by `r`) touch circle c? Prevents tunnelling. */
export function segmentHitsCircle(x0: number, y0: number, x1: number, y1: number, r: number, c: Circle): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((c.x - x0) * dx + (c.y - y0) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = x0 + dx * t - c.x, py = y0 + dy * t - c.y;
  const rr = c.radius + r;
  return px * px + py * py <= rr * rr;
}