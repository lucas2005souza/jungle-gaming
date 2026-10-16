import type { CDPSession, Page } from '@playwright/test';
import { expect, test, type App } from '../e2e/fixtures';
import { readCollector, startCollector, waitForCollector } from './collector';
import { distribution, frameStats, thirds } from './metrics';
import { environmentMarkdown, fmt, limit, readEnvironment, writeReport } from './report';

/**
 * Performance and profiling, measured on the real game (production build, real clock):
 *  1. one full 3-minute session: FPS, p95 time between frames, number of entities;
 *  2. memory after 5 consecutive game cycles (forced garbage collection before every reading).
 *
 * Reports are always written (docs/reports/performance) BEFORE the assertions run, so a failing
 * threshold still leaves the numbers on disk. Thresholds can be changed with environment variables.
 */

const LIMITS = {
  minAvgFps: limit('PERF_MIN_FPS', 55),
  maxP95FrameMs: limit('PERF_MAX_P95_MS', 20),
  maxHeapGrowthMB: limit('PERF_MAX_HEAP_GROWTH_MB', 5),
  maxListenerGrowth: limit('PERF_MAX_LISTENER_GROWTH', 5),
  maxNodeGrowth: limit('PERF_MAX_NODE_GROWTH', 100),
};

const SESSION_SEC = 180; // longest session the Options screen allows
const WARMUP_SEC = 2; // shader compilation / first uploads, excluded from the steady-state numbers
const CYCLES = 5;
const CYCLE_PLAY_SEC = 20;
/** Everything held down: sail in circles, front cannon and both broadsides: the busiest realistic input. */
const PLAY_KEYS = ['KeyW', 'KeyD', 'Space', 'KeyQ', 'KeyE'];
const INVINCIBLE_HP = 1_000_000_000;

test.describe.configure({ mode: 'serial' });

async function pressAll(page: Page, keys: string[]): Promise<void> {
  for (const k of keys) await page.keyboard.down(k);
}
async function releaseAll(page: Page, keys: string[]): Promise<void> {
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
}

// ---------------------------------------------------------------------------------------------
// 1. Three-minute session
// ---------------------------------------------------------------------------------------------

test('3 min session: FPS, p95 time between frames and entities', async ({ app, page }, testInfo) => {
  test.setTimeout((SESSION_SEC + 120) * 1000);

  // Worst case the Options screen allows: 180 s and a new enemy every 0.5 s (the cap is 12 at once).
  await app.open({ seed: 1, clock: 'real', options: { durationSec: SESSION_SEC, spawnIntervalSec: 0.5 } });
  await app.playButton.click();
  await app.game.ready();
  // The ship must survive the whole run, otherwise the session would end early.
  await app.game.place({ player: { hp: INVINCIBLE_HP } });

  await startCollector(page);
  await pressAll(page, PLAY_KEYS);
  await waitForCollector(page, (SESSION_SEC + 60) * 1000);
  await releaseAll(page, PLAY_KEYS);
  const cap = await readCollector(page);

  // ---- numbers -----------------------------------------------------------------------------
  const all = frameStats(cap.framesMs, 0);
  const steady = frameStats(cap.framesMs, WARMUP_SEC);
  const entities = distribution(cap.seconds.map(s => s.entities));
  const enemies = distribution(cap.seconds.map(s => s.enemies));
  const projectiles = distribution(cap.seconds.map(s => s.projectiles));
  const trend = thirds(cap.seconds.map(s => s.entities));
  const heap = cap.seconds.map(s => s.heapMB).filter((v): v is number => v !== null);
  const longTasks = distribution(cap.longTasksMs);
  const env = readEnvironment(page);

  const md = [
    '# Performance: 3-minute session',
    '',
    `Scenario: ${SESSION_SEC} s match, enemy spawn every 0.5 s (max 12 at once), seed 1, real clock, ship invincible,`,
    `keys held for the whole run: ${PLAY_KEYS.join(', ')}. Measured with requestAnimationFrame timestamps.`,
    '',
    environmentMarkdown(env),
    '',
    `## Frame rate (steady state: first ${WARMUP_SEC} s ignored, ${fmt(steady.durationSec, 0)} s analysed)`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Average FPS | ${fmt(steady.avgFps)} |`,
    `| Worst second (FPS) | ${fmt(steady.minFpsPerSecond, 0)} |`,
    `| 1 % low FPS (1000 / p99) | ${fmt(steady.fps1PercentLow)} |`,
    `| Time between frames, mean | ${fmt(steady.frameMs.mean, 2)} ms |`,
    `| Time between frames, median (p50) | ${fmt(steady.frameMs.p50, 2)} ms |`,
    `| **Time between frames, p95** | **${fmt(steady.frameMs.p95, 2)} ms** |`,
    `| Time between frames, p99 | ${fmt(steady.frameMs.p99, 2)} ms |`,
    `| Time between frames, max | ${fmt(steady.frameMs.max, 2)} ms |`,
    `| Frames above 25 ms / above 50 ms | ${steady.over25ms} / ${steady.over50ms} (of ${steady.intervals}) |`,
    `| Main-thread tasks above 50 ms | ${cap.longTasksMs.length}${cap.longTasksMs.length > 0 ? ` (longest ${fmt(longTasks.max, 0)} ms)` : ''} |`,
    '',
    `Whole run, warm-up included: average ${fmt(all.avgFps)} FPS, p95 ${fmt(all.frameMs.p95, 2)} ms, max ${fmt(all.frameMs.max, 2)} ms (${all.intervals} frames, ${fmt(all.durationSec, 0)} s).`,
    '',
    '## Entities (sampled once per second)',
    '',
    '| Entities | Min | Mean | p95 | Max |',
    '|---|---|---|---|---|',
    `| Total (player + enemies + projectiles) | ${fmt(entities.min, 0)} | ${fmt(entities.mean)} | ${fmt(entities.p95, 0)} | ${fmt(entities.max, 0)} |`,
    `| Enemies | ${fmt(enemies.min, 0)} | ${fmt(enemies.mean)} | ${fmt(enemies.p95, 0)} | ${fmt(enemies.max, 0)} |`,
    `| Projectiles | ${fmt(projectiles.min, 0)} | ${fmt(projectiles.mean)} | ${fmt(projectiles.p95, 0)} | ${fmt(projectiles.max, 0)} |`,
    '',
    `Mean total entities in the first third of the run: ${fmt(trend.first)}; in the last third: ${fmt(trend.last)} (they must not keep growing).`,
    '',
    '## JS heap during the run (not garbage-collected before reading: it normally looks like a saw)',
    '',
    heap.length > 0
      ? `Start ${fmt(heap[0])} MB, end ${fmt(heap[heap.length - 1])} MB, minimum ${fmt(Math.min(...heap))} MB, maximum ${fmt(Math.max(...heap))} MB.`
      : 'performance.memory is not available in this browser.',
    '',
  ].join('\n');
  const mdPath = writeReport('fps-3min', { environment: env, limits: LIMITS, steady, all, entities, enemies, projectiles, trend, heapMB: heap, longTasksMs: cap.longTasksMs, seconds: cap.seconds }, md);
  await testInfo.attach('fps-3min.md', { body: md, contentType: 'text/markdown' });
  console.log(`\n${md}\nReport written to ${mdPath}\n`);

  // ---- checks --------------------------------------------------------------------------------
  expect(cap.sawPaused, 'the match was paused during the run (window lost focus / hidden): measurement is invalid').toBe(false);
  expect(cap.endedNormally, 'the match must reach its natural end').toBe(true);
  expect(cap.last?.status, 'final match status').toBe('ended');
  expect(cap.last?.elapsed ?? 0, 'simulated seconds played').toBeGreaterThanOrEqual(SESSION_SEC - 0.5);
  expect(steady.avgFps, `average FPS >= ${LIMITS.minAvgFps}`).toBeGreaterThanOrEqual(LIMITS.minAvgFps);
  expect(steady.frameMs.p95, `p95 time between frames <= ${LIMITS.maxP95FrameMs} ms`).toBeLessThanOrEqual(LIMITS.maxP95FrameMs);
  expect(entities.max, 'entities are bounded by the enemy cap and the projectile lifetime').toBeLessThanOrEqual(120);
  expect(trend.last, 'entities do not accumulate over time').toBeLessThanOrEqual(trend.first * 1.3 + 3);
});

// ---------------------------------------------------------------------------------------------
// 2. Memory after 5 game cycles
// ---------------------------------------------------------------------------------------------

interface MemoryPoint {
  label: string;
  ending: 'none' | 'death' | 'menu';
  heapMB: number;
  nodes: number;
  listeners: number;
  documents: number;
}

async function readMemory(cdp: CDPSession, page: Page, label: string, ending: MemoryPoint['ending']): Promise<MemoryPoint> {
  await page.waitForTimeout(1000); // let timers and the 1.3 s result delay settle
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const get = (name: string): number => metrics.find(m => m.name === name)?.value ?? NaN;
  return {
    label,
    ending,
    heapMB: get('JSHeapUsedSize') / 1048576,
    nodes: get('Nodes'),
    listeners: get('JSEventListeners'),
    documents: get('Documents'),
  };
}

/** One full cycle: Play -> ~20 s of busy play -> end of the match -> back on the main menu. */
async function playCycle(app: App, page: Page, ending: 'death' | 'menu'): Promise<void> {
  await app.playButton.click();
  await app.game.ready();
  await app.game.place({ player: { hp: INVINCIBLE_HP } });
  await pressAll(page, PLAY_KEYS);
  await page.waitForTimeout(CYCLE_PLAY_SEC * 1000);
  await releaseAll(page, PLAY_KEYS);

  if (ending === 'death') {
    // A Chaser rams a nearly destroyed ship -> result screen -> Main Menu.
    const s = await app.game.state();
    await app.game.place({ player: { hp: 1 }, enemies: [{ kind: 'chaser', x: s.player.x, y: s.player.y }] });
    await expect(page.getByRole('heading', { name: 'Ship sunk' })).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();
  } else {
    // Abandon the match: Pause -> Main Menu.
    const dialog = await app.pauseWithButton();
    await dialog.getByRole('button', { name: 'Main Menu' }).click();
  }
  await expect(app.menuTitle).toBeVisible();
}

test('memory after 5 game cycles', async ({ app, page, context }, testInfo) => {
  test.setTimeout(CYCLES * (CYCLE_PLAY_SEC + 30) * 1000 + 120_000);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  // 60 s is the shortest allowed match; cycles end earlier by death or by leaving, so it never runs out.
  await app.open({ seed: 1, clock: 'real', options: { durationSec: 60, spawnIntervalSec: 0.5 } });

  const points: MemoryPoint[] = [await readMemory(cdp, page, 'Baseline (menu, before any match)', 'none')];
  for (let i = 1; i <= CYCLES; i++) {
    const ending = i % 2 === 1 ? 'death' : 'menu';
    await test.step(`cycle ${i} (ends by ${ending === 'death' ? 'ship destroyed' : 'leaving to the menu'})`, async () => {
      await playCycle(app, page, ending);
      points.push(await readMemory(cdp, page, `After cycle ${i}`, ending));
    });
  }

  // Cycle 1 pays for one-time costs (textures, shaders, caches), so growth is judged from cycle 1 to cycle 5.
  const c1 = points[1];
  const c5 = points[CYCLES];
  const growth = { heapMB: c5.heapMB - c1.heapMB, nodes: c5.nodes - c1.nodes, listeners: c5.listeners - c1.listeners };
  const env = readEnvironment(page);

  const rows = points.map(p => {
    const d = p.heapMB - c1.heapMB;
    return `| ${p.label} | ${p.ending === 'none' ? '-' : p.ending === 'death' ? 'ship destroyed' : 'left to menu'} | ${fmt(p.heapMB, 2)} | ${p === points[0] || p === c1 ? '-' : (d >= 0 ? '+' : '') + fmt(d, 2)} | ${p.nodes} | ${p.listeners} |`;
  });
  const md = [
    '# Performance: memory after 5 game cycles',
    '',
    `Scenario: ${CYCLES} consecutive matches of about ${CYCLE_PLAY_SEC} s each (busy play, spawn every 0.5 s), alternating the two ways a match ends`,
    '(ship destroyed -> result screen -> Main Menu, and Pause -> Main Menu). Every reading is taken on the main menu, after two forced garbage collections (Chrome DevTools Protocol).',
    '',
    environmentMarkdown(env),
    '',
    '| Moment | Match ended by | JS heap after GC (MB) | Heap vs cycle 1 (MB) | DOM nodes | JS event listeners |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    `**Growth from cycle 1 to cycle ${CYCLES}:** heap ${growth.heapMB >= 0 ? '+' : ''}${fmt(growth.heapMB, 2)} MB, DOM nodes ${growth.nodes >= 0 ? '+' : ''}${growth.nodes}, event listeners ${growth.listeners >= 0 ? '+' : ''}${growth.listeners}.`,
    '',
    'GPU memory (WebGL textures and buffers) is not part of the JS heap and is not measured here.',
    '',
  ].join('\n');
  const mdPath = writeReport('memory-5-cycles', { environment: env, limits: LIMITS, points, growth }, md);
  await testInfo.attach('memory-5-cycles.md', { body: md, contentType: 'text/markdown' });
  console.log(`\n${md}\nReport written to ${mdPath}\n`);

  expect(growth.heapMB, `JS heap growth cycle 1 -> ${CYCLES} (MB)`).toBeLessThanOrEqual(LIMITS.maxHeapGrowthMB);
  expect(growth.listeners, `event listener growth cycle 1 -> ${CYCLES}`).toBeLessThanOrEqual(LIMITS.maxListenerGrowth);
  expect(growth.nodes, `DOM node growth cycle 1 -> ${CYCLES}`).toBeLessThanOrEqual(LIMITS.maxNodeGrowth);
});
