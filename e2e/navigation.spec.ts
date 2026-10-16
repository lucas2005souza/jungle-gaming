import { KEYS, expect, test } from './fixtures';

test.describe('Abandoning a match and moving between screens', () => {
  test('quitting from the pause menu records nothing', async ({ app, page }) => {
    await app.startQuietMatch();
    await app.game.earnPoints(1);
    await app.pauseWithButton();
    await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click();
    await expect(app.menuTitle).toBeVisible();

    await expect(page.getByRole('button', { name: /Last result/ })).toHaveCount(0);
    expect(await app.storage(KEYS.lastResult)).toBeNull();
    expect(await app.storedCount(KEYS.pending)).toBe(0);
    expect(await app.storedCount(KEYS.mockDb)).toBe(0);

    await app.openLog('Match History');
    await expect(page.getByText('No battles yet')).toBeVisible();
  });

  test('reloading during a match ends it without recording anything', async ({ app, page }) => {
    await app.startQuietMatch();
    await app.game.earnPoints(1);
    await page.reload();
    await expect(app.menuTitle).toBeVisible();
    expect(await app.storage(KEYS.lastResult)).toBeNull();
    expect(await app.storedCount(KEYS.pending)).toBe(0);
    expect(await app.storedCount(KEYS.mockDb)).toBe(0);
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('repeated navigation leaves no canvas, hook or error behind', async ({ app, page }) => {
    await app.open({ seed: 1, options: { durationSec: 60, spawnIntervalSec: 10 } });
    for (let round = 0; round < 4; round++) {
      await app.startMatch();
      await expect(page.locator('canvas')).toHaveCount(1);
      await app.pauseWithButton();
      await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click();
      await expect(app.menuTitle).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      expect(await page.evaluate(() => window.__pirateGame)).toBeUndefined();

      await page.getByRole('button', { name: 'Options' }).click();
      await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
      await page.getByRole('button', { name: 'Main Menu' }).click();

      await app.openLog('Ranking');
      await app.closeLog();
      await app.openLog('Match History');
      await app.closeLog();
    }
  });

  test('game keys are captured only while a match is active', async ({ app, page }) => {
    await app.open();
    const prevented = () =>
      page.evaluate(() => {
        const w = window as unknown as { __seen?: [string, boolean][] };
        const out = w.__seen ?? [];
        w.__seen = [];
        return out;
      });
    const blurFocus = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const watch = () =>
      page.evaluate(() => {
        const w = window as unknown as { __seen?: [string, boolean][]; __onKey?: (e: KeyboardEvent) => void };
        w.__seen = [];
        if (w.__onKey) window.removeEventListener('keydown', w.__onKey); // never stack listeners across calls
        // Registered after the game's own listener, so it sees the final defaultPrevented value.
        w.__onKey = e => w.__seen!.push([e.code, e.defaultPrevented]);
        window.addEventListener('keydown', w.__onKey);
      });

    await blurFocus(); // the menu auto-focuses "Play": Space would activate it
    await watch();
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyW');
    expect((await prevented()).every(([, p]) => p === false)).toBe(true); // menu: nothing is swallowed
    await expect(app.menuTitle).toBeVisible();

    await app.startMatch();
    await watch();
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyW');
    expect((await prevented()).every(([, p]) => p === true)).toBe(true); // match: game keys are captured

    await app.pauseWithButton();
    await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click();
    await expect(app.menuTitle).toBeVisible();
    await prevented();
    await blurFocus();
    await page.keyboard.press('Space');
    expect((await prevented()).every(([, p]) => p === false)).toBe(true); // left the match: released again
  });
});