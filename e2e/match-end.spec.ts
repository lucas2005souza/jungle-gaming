import { expect, test } from './fixtures';

test.describe('End of the match', () => {
  test('ends by time: the simulation stops and the result is shown', async ({ app, page }) => {
    await app.startQuietMatch();
    const r = await page.evaluate(() => {
      const g = window.__pirateGame!;
      g.place({ clearEnemies: true, player: { hp: 1000 } });
      const ended = g.advance(65);
      const before = JSON.stringify(g.state());
      g.advance(5); // more time must change nothing
      const after = JSON.stringify(g.state());
      return { status: ended.status, reason: ended.reason, elapsed: ended.elapsed, timeLeft: ended.timeLeft, frozen: before === after };
    });
    expect(r).toEqual({ status: 'ended', reason: 'time_up', elapsed: 60, timeLeft: 0, frozen: true });

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
    await expect(page.getByTestId('result-time')).toHaveText('01:00');
    await expect(page.getByTestId('result-reason')).toHaveText('Time is up');
  });

  test('ends by death: damage, movement and shooting stop', async ({ app, page }) => {
    await app.startQuietMatch();
    const r = await page.evaluate(() => {
      const g = window.__pirateGame!;
      const s0 = g.state();
      g.place({ clearEnemies: true, player: { hp: 10 }, enemies: [{ kind: 'chaser', x: s0.player.x, y: s0.player.y }] });
      const ended = g.advance(1);
      const before = JSON.stringify(g.state());
      g.advance(5);
      const after = JSON.stringify(g.state());
      return { status: ended.status, reason: ended.reason, hp: ended.player.hp, score: ended.score, frozen: before === after };
    });
    expect(r).toEqual({ status: 'ended', reason: 'player_destroyed', hp: 0, score: 0, frozen: true });

    await expect(page.getByRole('heading', { name: 'Ship sunk' })).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Ship destroyed');
  });

  test('keys pressed after the end do nothing', async ({ app, page }) => {
    await app.startQuietMatch();
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    const { s0, s1 } = await page.evaluate(() => {
      const g = window.__pirateGame!;
      const start = g.state();
      g.place({ clearEnemies: true, player: { hp: 10 }, enemies: [{ kind: 'chaser', x: start.player.x, y: start.player.y }] });
      g.advance(1);
      const ended = g.state();
      g.advance(1);
      return { s0: ended, s1: g.state() };
    });
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyW');
    expect(s0.status).toBe('ended');
    expect(s1.player.x).toBe(s0.player.x);
    expect(s1.player.y).toBe(s0.player.y);
    expect(s1.counters.shotsFront).toBe(s0.counters.shotsFront);
  });

  test('Play Again starts a clean match', async ({ app, page }) => {
    await app.startQuietMatch();
    await app.game.earnPoints(1);
    await app.game.hold(['KeyW'], 0.5);
    const first = await app.game.endByTime();
    expect(first.score).toBe(1);

    await page.getByRole('button', { name: 'Play Again' }).click();
    const s = await app.game.ready();
    expect(s.instanceId).toBeGreaterThan(first.instanceId);
    expect(s.elapsed).toBe(0);
    expect(s.score).toBe(0);
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.player.x).toBeCloseTo(256, 0);
    expect(s.player.y).toBeCloseTo(576, 0);
    expect(s.enemies).toHaveLength(0);
    expect(s.projectiles).toHaveLength(0);
    expect(s.counters.shotsFront).toBe(0);
    await expect(page.locator('canvas')).toHaveCount(1); // the previous renderer was released
  });
});