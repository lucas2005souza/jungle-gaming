import { expect, test as base, type ConsoleMessage, type Page } from '@playwright/test';
import type { E2EState, PlaceSpec } from '../src/game/testHooks';

export type { E2EState } from '../src/game/testHooks';

export const KEYS = {
  options: 'pirate-battle:options:v1',
  lastResult: 'pirate-battle:last-result:v1',
  pending: 'pirate-battle:pending-matches:v1',
  mockDb: 'pirate-battle:mock-db:v1',
} as const;

export interface OpenOptions {
  /** Mock API scenario (see the "Network scenarios" panel). Default: success. */
  scenario?: string;
  /** Mock latency in ms. Default 0; `null` keeps the scenario's own timing (slow, out-of-order...). */
  latency?: number | null;
  seed?: number;
  /** Test hook with manual clock (`?e2e=1`). Default true. */
  e2e?: boolean;
  clock?: 'manual' | 'real';
  /** Options stored before the app starts (only when nothing is stored yet). */
  options?: { durationSec?: number; spawnIntervalSec?: number };
}

const PLAY_AREA = { x: 200, y: 600 } as const;

/** Drives the real game through the test hook: real keys/touches, simulated time advanced explicitly. */
export class GameDriver {
  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  state(): Promise<E2EState> {
    return this.page.evaluate(() => {
      const g = window.__pirateGame;
      if (!g) throw new Error('Test hook not installed: is the match running with ?e2e=1?');
      return g.state();
    });
  }

  advance(seconds: number): Promise<E2EState> {
    return this.page.evaluate(s => window.__pirateGame!.advance(s), seconds);
  }

  place(spec: PlaceSpec): Promise<void> {
    return this.page.evaluate(s => window.__pirateGame!.place(s), spec);
  }

  resetMetrics(): Promise<void> {
    return this.page.evaluate(() => window.__pirateGame!.resetMetrics());
  }

  /** Waits for a running match (a new one after "Play again" included). */
  async ready(): Promise<E2EState> {
    await this.page.waitForFunction(() => window.__pirateGame?.state().status === 'running');
    return this.state();
  }

  /** Presses keys, advances simulated time, releases the keys. */
  async hold(keys: string[], seconds: number): Promise<E2EState> {
    for (const k of keys) await this.page.keyboard.down(k);
    const s = await this.advance(seconds);
    for (const k of keys.slice().reverse()) await this.page.keyboard.up(k);
    return s;
  }

  /** One key press that lasts a single simulation step. */
  async tap(key: string): Promise<E2EState> {
    return this.hold([key], 1 / 60);
  }

  /** Scores `n` points the real way: a shooter placed ahead is destroyed with front shots. */
  async earnPoints(n: number): Promise<void> {
    const { config } = await this.state();
    for (let i = 0; i < n; i++) {
      await this.place({
        clearEnemies: true,
        player: { ...PLAY_AREA, heading: 0, hp: 1000 },
        enemies: [{ kind: 'shooter', x: PLAY_AREA.x, y: 350, heading: Math.PI, hp: config.front.damage, cooldown: 99 }],
      });
      const s = await this.hold(['Space'], 1);
      expect(s.score, `score after kill #${i + 1}`).toBe(i + 1);
    }
  }

  /** Lets the clock run out with a player that cannot die (ends with "time_up"). */
  async endByTime(): Promise<E2EState> {
    const s0 = await this.state();
    await this.place({ clearEnemies: true, player: { hp: 1000 } });
    return this.advance(s0.config.durationSec + 1);
  }

  /** A Chaser rams a nearly destroyed ship (ends with "player_destroyed"). */
  async endByDeath(): Promise<E2EState> {
    const s0 = await this.state();
    await this.place({
      clearEnemies: true,
      player: { hp: 10 },
      enemies: [{ kind: 'chaser', x: s0.player.x, y: s0.player.y }],
    });
    return this.advance(1);
  }
}

export class App {
  readonly page: Page;
  readonly game: GameDriver;
  constructor(page: Page) {
    this.page = page;
    this.game = new GameDriver(page);
  }

  url(o: OpenOptions = {}): string {
    const q = new URLSearchParams();
    if (o.e2e !== false) q.set('e2e', '1');
    if (o.clock) q.set('clock', o.clock);
    if (o.seed !== undefined) q.set('seed', String(o.seed));
    if (o.scenario) q.set('scenario', o.scenario);
    if (o.latency !== null) q.set('latency', String(o.latency ?? 0));
    return `/?${q.toString()}`;
  }

  async open(o: OpenOptions = {}): Promise<void> {
    if (o.options) {
      const value = JSON.stringify({ durationSec: 90, spawnIntervalSec: 2.5, ...o.options });
      await this.page.addInitScript(([key, v]) => {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, v);
      }, [KEYS.options, value] as const);
    }
    await this.page.goto(this.url(o));
    await expect(this.menuTitle).toBeVisible();
  }

  get menuTitle() {
    return this.page.getByRole('img', { name: 'Pirate Battle' });
  }

  get playButton() {
    return this.page.getByRole('button', { name: 'Play', exact: true });
  }

  /** Menu -> Play -> a running match (manual clock). */
  async startMatch(): Promise<E2EState> {
    await this.playButton.click();
    return this.game.ready();
  }

  /** 60 s matches with a 10 s spawn interval: nothing spawns during short deterministic tests. */
  async startQuietMatch(o: OpenOptions = {}): Promise<E2EState> {
    await this.open({ seed: 1, options: { durationSec: 60, spawnIntervalSec: 10 }, ...o });
    return this.startMatch();
  }

  async openLog(tab: 'Ranking' | 'Match History'): Promise<void> {
    await this.page.getByRole('navigation', { name: 'Leaderboards' }).getByRole('button', { name: tab }).click();
    await expect(this.page.getByRole('heading', { name: "Captain's Log" })).toBeVisible();
  }

  async closeLog(): Promise<void> {
    await this.page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(this.menuTitle).toBeVisible();
  }

  /** Pause button -> dialog. */
  async pauseWithButton() {
    await this.page.getByRole('button', { name: 'Pause' }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Game paused' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  get pagerLabel() {
    return this.page.locator('.pager-label');
  }

  rankingCaptains(): Promise<string[]> {
    return this.page.locator('table.ranking tbody tr td:nth-child(2)').allInnerTexts();
  }

  historyRows() {
    return this.page.locator('table.history tbody tr');
  }

  storage(key: string): Promise<unknown> {
    return this.page.evaluate(k => {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as unknown) : null;
    }, key);
  }

  async storedCount(key: string): Promise<number> {
    const v = await this.storage(key);
    return Array.isArray(v) ? v.length : 0;
  }

  setScenario(id: string): Promise<void> {
    return this.page.evaluate(s => {
      const mock = (window as unknown as { __pirateMock: { setScenario: (id: string) => void } }).__pirateMock;
      mock.setScenario(s);
    }, id);
  }
}

/** Only the mock API failing on purpose is expected; any other failing resource still fails the test. */
function isExpectedApiFailure(m: ConsoleMessage): boolean {
  return /^Failed to load resource: the server responded with a status of [45]\d\d/.test(m.text()) && m.location().url.includes('/api/');
}

export interface Fixtures {
  app: App;
  /** Fail the test on console errors / uncaught exceptions. Disabled where failures are provoked on purpose. */
  strictConsole: boolean;
}

export const test = base.extend<Fixtures>({
  strictConsole: [true, { option: true }],
  app: async ({ page, strictConsole }, provide) => {
    const problems: string[] = [];
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    page.on('console', m => {
      if (m.type() === 'error' && !isExpectedApiFailure(m)) problems.push(`console.error: ${m.text()}`);
    });
    await provide(new App(page));
    if (strictConsole) expect(problems, 'no unhandled console errors during the flow').toEqual([]);
  },
});

export { expect };