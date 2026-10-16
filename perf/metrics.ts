/** Pure statistics helpers for the performance tests (no browser, no Playwright). */

/** Nearest-rank percentile of an ascending-sorted array (p in 0..100). */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, rank - 1))];
}

export interface Dist {
  min: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export function distribution(values: number[]): Dist {
  if (values.length === 0) return { min: NaN, mean: NaN, p50: NaN, p95: NaN, p99: NaN, max: NaN };
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((acc, v) => acc + v, 0);
  return {
    min: s[0],
    mean: sum / s.length,
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    max: s[s.length - 1],
  };
}

export interface FrameStats {
  /** Frame intervals analysed (frames - 1). */
  intervals: number;
  durationSec: number;
  skippedWarmupSec: number;
  avgFps: number;
  /** Worst whole second (frames drawn in that second). */
  minFpsPerSecond: number;
  /** 1000 / p99 frame time: the "1 % low" FPS. */
  fps1PercentLow: number;
  /** Time between two consecutive frames, in milliseconds. */
  frameMs: Dist;
  /** Frames that took longer than 25 ms (below 40 FPS) and longer than 50 ms (visible stutter). */
  over25ms: number;
  over50ms: number;
}

const EMPTY_DIST: Dist = { min: NaN, mean: NaN, p50: NaN, p95: NaN, p99: NaN, max: NaN };

/**
 * `timesMs` are requestAnimationFrame timestamps. The first `skipWarmupSec` seconds can be ignored
 * (shader compilation, first texture uploads); pass 0 to analyse everything.
 */
export function frameStats(timesMs: number[], skipWarmupSec = 0): FrameStats {
  const start = timesMs.length > 0 ? timesMs[0] : 0;
  const kept = timesMs.filter(t => (t - start) / 1000 >= skipWarmupSec);
  if (kept.length < 2) {
    return {
      intervals: 0, durationSec: 0, skippedWarmupSec: skipWarmupSec, avgFps: NaN, minFpsPerSecond: NaN,
      fps1PercentLow: NaN, frameMs: EMPTY_DIST, over25ms: 0, over50ms: 0,
    };
  }
  const deltas: number[] = [];
  for (let i = 1; i < kept.length; i++) deltas.push(kept[i] - kept[i - 1]);
  const durationSec = (kept[kept.length - 1] - kept[0]) / 1000;
  const frameMs = distribution(deltas);

  // Frames per whole second; the last (partial) second is ignored.
  const buckets = new Map<number, number>();
  for (const t of kept) {
    const b = Math.floor((t - kept[0]) / 1000);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  const wholeSeconds = Math.floor(durationSec);
  const perSecond = [...buckets.entries()].filter(([b]) => b < wholeSeconds).map(([, count]) => count);

  return {
    intervals: deltas.length,
    durationSec,
    skippedWarmupSec: skipWarmupSec,
    avgFps: deltas.length / durationSec,
    minFpsPerSecond: perSecond.length > 0 ? Math.min(...perSecond) : NaN,
    fps1PercentLow: 1000 / frameMs.p99,
    frameMs,
    over25ms: deltas.filter(d => d > 25).length,
    over50ms: deltas.filter(d => d > 50).length,
  };
}

/** Mean of the first and last third of a series: a quick "does it keep growing?" check. */
export function thirds(values: number[]): { first: number; last: number } {
  if (values.length < 3) return { first: NaN, last: NaN };
  const n = Math.floor(values.length / 3);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { first: mean(values.slice(0, n)), last: mean(values.slice(values.length - n)) };
}
