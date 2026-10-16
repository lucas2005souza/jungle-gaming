import { expect, test } from './fixtures';

test.describe('Movement, rotation, arena limits and islands', () => {
  test('starts a full-health match that only advances when simulated time advances', async ({ app, page }) => {
    const s = await app.startQuietMatch();
    expect(s.status).toBe('running');
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.score).toBe(0);
    expect(s.enemies).toHaveLength(0);
    expect(s.timeLeft).toBeCloseTo(60, 5);

    const still = await app.game.state();
    expect(still.elapsed).toBe(0); // manual clock: nothing moves by itself

    const after = await app.game.advance(1);
    expect(after.elapsed).toBeCloseTo(1, 2);
    await expect(page.getByRole('group', { name: 'Match status' })).toContainText('0:59');
  });

  test('W sails forward along the heading', async ({ app }) => {
    const s0 = await app.startQuietMatch();
    const s = await app.game.hold(['KeyW'], 1);
    expect(s.player.x).toBeCloseTo(s0.player.x, 1);
    expect(s0.player.y - s.player.y).toBeCloseTo(190, 0); // speed 190 px/s for 1 s
  });

  test('arrow keys work like WASD', async ({ app }) => {
    const s0 = await app.startQuietMatch();
    const s = await app.game.hold(['ArrowUp'], 0.5);
    expect(s0.player.y - s.player.y).toBeCloseTo(95, 0);
  });

  test('A and D rotate the ship in both directions', async ({ app }) => {
    await app.startQuietMatch();
    let s = await app.game.hold(['KeyD'], 0.5);
    expect(s.player.heading).toBeCloseTo(1.1, 1); // 2.2 rad/s * 0.5 s
    s = await app.game.hold(['KeyA'], 0.25);
    expect(s.player.heading).toBeCloseTo(0.55, 1);
    s = await app.game.hold(['ArrowLeft'], 0.25);
    expect(s.player.heading).toBeCloseTo(0, 1);
  });

  test('sailing and turning work at the same time', async ({ app }) => {
    const s0 = await app.startQuietMatch();
    const s = await app.game.hold(['KeyW', 'KeyD'], 1);
    expect(s.player.heading).toBeCloseTo(2.2, 1);
    expect(s.player.x).toBeGreaterThan(s0.player.x + 50);
  });

  for (const [edge, place, axis, expected] of [
    ['left', { x: 100, y: 100, heading: -Math.PI / 2 }, 'x', 30],
    ['top', { x: 600, y: 100, heading: 0 }, 'y', 30],
    ['right', { x: 1000, y: 680, heading: Math.PI / 2 }, 'x', 1250],
    ['bottom', { x: 600, y: 500, heading: Math.PI }, 'y', 690],
  ] as const) {
    test(`the ship cannot leave the arena (${edge} edge)`, async ({ app }) => {
      await app.startQuietMatch();
      await app.game.place({ player: place });
      await app.game.resetMetrics();
      const s = await app.game.hold(['KeyW'], 3);
      expect(s.player[axis]).toBeCloseTo(expected, 0);
      expect(s.metrics.stepsOutOfArena).toBe(0);
    });
  }

  test('islands block the ship: it slides along the shore and never enters', async ({ app }) => {
    await app.startQuietMatch();
    await app.game.place({ player: { x: 400, y: 560, heading: 0 } }); // straight at the first island
    await app.game.resetMetrics();
    const s = await app.game.hold(['KeyW'], 3);
    const isl = s.islands[0];
    const distance = Math.hypot(s.player.x - isl.x, s.player.y - isl.y);
    expect(distance).toBeGreaterThanOrEqual(isl.radius + s.player.radius - 0.5);
    expect(s.metrics.minIslandGap).toBeGreaterThanOrEqual(-0.5);
    expect(s.player.y).toBeGreaterThan(isl.y); // still on the near side of the island
  });

  test('sailing around an island never crosses it', async ({ app }) => {
    await app.startQuietMatch();
    await app.game.place({ player: { x: 330, y: 560, heading: 0 } });
    await app.game.resetMetrics();
    const s = await app.game.hold(['KeyW', 'KeyD'], 4);
    expect(s.metrics.minIslandGap).toBeGreaterThanOrEqual(-0.5);
    expect(s.metrics.stepsOutOfArena).toBe(0);
  });
});
