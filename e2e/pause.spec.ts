import { expect, test, type App } from './fixtures';

/** The pause rules are about real time, so these tests use the real clock (`?clock=real`). */
async function startRealMatch(app: App) {
  await app.open({ clock: 'real', seed: 1, options: { durationSec: 60, spawnIntervalSec: 10 } });
  await app.playButton.click();
  await app.game.ready();
  await expect.poll(async () => (await app.game.state()).elapsed).toBeGreaterThan(0.4);
}

test.describe('Pause', () => {
  test('the button freezes the clock and resuming does not catch up', async ({ app, page }) => {
    await startRealMatch(app);
    const dialog = await app.pauseWithButton();
    const hud = page.getByRole('group', { name: 'Match status' });
    const p1 = await app.game.state();
    const hudBefore = await hud.innerText();
    expect(p1.status).toBe('paused');

    await page.waitForTimeout(2500);
    const p2 = await app.game.state();
    expect(p2.elapsed).toBe(p1.elapsed);
    expect(p2.timeLeft).toBe(p1.timeLeft);
    expect(await hud.innerText()).toBe(hudBefore);

    const resumedAt = await page.evaluate(() => performance.now());
    await dialog.getByRole('button', { name: 'Resume' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await app.game.state()).elapsed, { timeout: 10_000 }).toBeGreaterThan(p2.elapsed + 0.2);
    const { now, s: p3 } = await page.evaluate(() => ({ now: performance.now(), s: window.__pirateGame!.state() }));
    expect(p3.status).toBe('running');
    // Only the time that really passed since resuming counts; the 2.5 s spent paused was not added.
    expect(p3.elapsed - p2.elapsed).toBeLessThanOrEqual((now - resumedAt) / 1000 + 0.3);
  });

  test('P toggles the pause from the keyboard', async ({ app, page }) => {
    await startRealMatch(app);
    await page.keyboard.press('KeyP');
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
    await page.keyboard.press('KeyP');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect((await app.game.state()).status).toBe('running');
  });

  test('losing window focus pauses automatically and does not resume by itself', async ({ app, page }) => {
    await startRealMatch(app);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
    const p1 = await app.game.state();

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(700);
    const p2 = await app.game.state();
    expect(p2.status).toBe('paused'); // resuming needs a player action
    expect(p2.elapsed).toBe(p1.elapsed);
  });

  test('hiding the tab pauses automatically', async ({ app, page }) => {
    await startRealMatch(app);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
    expect((await app.game.state()).status).toBe('paused');
  });

  test('keys held across a pause do not move the ship after resuming', async ({ app, page }) => {
    await startRealMatch(app);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); // pause while W is still down
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
    const paused = await app.game.state();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(500);
    const resumed = await app.game.state();
    await page.keyboard.up('KeyW');
    expect(resumed.status).toBe('running');
    expect(Math.abs(resumed.player.y - paused.player.y)).toBeLessThan(0.5);
    expect(Math.abs(resumed.player.x - paused.player.x)).toBeLessThan(0.5);
  });

  test('keys pressed while paused are ignored', async ({ app, page }) => {
    await startRealMatch(app);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible();
    const paused = await app.game.state();
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyE');
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(400);
    const resumed = await app.game.state();
    expect(Math.abs(resumed.player.y - paused.player.y)).toBeLessThan(0.5);
    expect(resumed.counters.shotsSide).toBe(paused.counters.shotsSide);
  });

  test('cooldowns are suspended while paused', async ({ app, page }) => {
    await app.startQuietMatch(); // manual clock: does not depend on the frame rate
    await app.game.hold(['KeyE'], 0.1);
    const p0 = await app.game.state();
    expect(p0.player.cooldowns.right).toBeGreaterThan(0);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const dialog = page.getByRole('dialog', { name: 'Game paused' });
    await expect(dialog).toBeVisible();
    await app.game.advance(5);
    const p1 = await app.game.state();
    expect(p1.status).toBe('paused');
    expect(p1.elapsed).toBe(p0.elapsed);
    expect(p1.player.cooldowns.right).toBe(p0.player.cooldowns.right);

    await dialog.getByRole('button', { name: 'Resume' }).click();
    await app.game.advance(0.2);
    const p2 = await app.game.state();
    expect(p2.player.cooldowns.right).toBeCloseTo(p0.player.cooldowns.right - 0.2, 1);
  });

  test('the pause dialog traps focus and Quit returns to the menu', async ({ app, page }) => {
    await startRealMatch(app);
    const dialog = await app.pauseWithButton();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await dialog.getByRole('button', { name: 'Main Menu' }).click();
    await expect(app.menuTitle).toBeVisible();
  });
});