import type { Page } from '@playwright/test';
import type { E2ECounts } from '../src/game/testHooks';

/** One sample per second, taken inside the page while the match runs. */
export interface SecondSample {
  /** seconds since the collector started */
  t: number;
  enemies: number;
  projectiles: number;
  entities: number;
  /** performance.memory.usedJSHeapSize in MB (Chromium only; not garbage-collected first). */
  heapMB: number | null;
}

export interface RawCapture {
  /** requestAnimationFrame timestamps (ms), one per displayed frame. */
  framesMs: number[];
  seconds: SecondSample[];
  /** Main-thread tasks longer than 50 ms (Long Tasks API). */
  longTasksMs: number[];
  /** True if the match was ever paused (focus loss, hidden tab): the run is then not trustworthy. */
  sawPaused: boolean;
  /** True when the match reached the "ended" state by itself. */
  endedNormally: boolean;
  last: E2ECounts | null;
}

interface PageCollector {
  isDone(): boolean;
  result(): RawCapture;
}

/**
 * Starts a light-weight probe inside the page: one requestAnimationFrame callback that only writes a
 * timestamp into a pre-allocated Float64Array (no allocation per frame), plus one 1 s timer for the
 * entity counters. It stops by itself when the match ends. Needs `?e2e=1&clock=real`.
 */
export async function startCollector(page: Page, maxFrames = 60_000): Promise<void> {
  await page.evaluate(cap => {
    const times = new Float64Array(cap);
    let n = 0;
    let done = false;
    let sawPaused = false;
    let endedNormally = false;
    let last: E2ECounts | null = null;
    const seconds: SecondSample[] = [];
    const longTasks: number[] = [];
    const t0 = performance.now();

    let observer: PerformanceObserver | undefined;
    try {
      observer = new PerformanceObserver(list => {
        for (const e of list.getEntries()) longTasks.push(e.duration);
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      /* Long Tasks API not available: the field stays empty */
    }

    const heapMB = (): number | null => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return mem ? mem.usedJSHeapSize / 1048576 : null;
    };
    const sample = (): void => {
      const c = window.__pirateGame?.counts();
      if (!c) return;
      last = c;
      seconds.push({
        t: (performance.now() - t0) / 1000,
        enemies: c.enemies,
        projectiles: c.projectiles,
        entities: c.entities,
        heapMB: heapMB(),
      });
    };
    const timer = window.setInterval(sample, 1000);
    const finish = (ended: boolean): void => {
      sample();
      endedNormally = ended;
      done = true;
      window.clearInterval(timer);
      observer?.disconnect();
    };

    const loop = (t: number): void => {
      if (done) return;
      const game = window.__pirateGame;
      const status = game?.status();
      if (!game || status === 'ended') {
        finish(status === 'ended');
        return;
      }
      if (status === 'paused') sawPaused = true;
      if (n < cap) times[n++] = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const api: PageCollector = {
      isDone: () => done,
      result: () => ({
        framesMs: Array.from(times.subarray(0, n)),
        seconds,
        longTasksMs: longTasks,
        sawPaused,
        endedNormally,
        last,
      }),
    };
    (window as unknown as { __perf?: PageCollector }).__perf = api;
  }, maxFrames);
}

/** Polls once per second (not every frame) so the wait itself does not disturb the measurement. */
export async function waitForCollector(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __perf?: PageCollector }).__perf?.isDone() === true,
    undefined,
    { polling: 1000, timeout: timeoutMs },
  );
}

export function readCollector(page: Page): Promise<RawCapture> {
  return page.evaluate(() => (window as unknown as { __perf: PageCollector }).__perf.result());
}
