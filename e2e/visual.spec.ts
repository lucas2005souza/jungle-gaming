import { expect, test } from './fixtures';

/**
 * Visual regression (desktop only). Baselines are committed under e2e/__screenshots__.
 * Create / refresh them with:  npm run test:e2e:update
 * The arena is captured in a manual-clock match, so water and ships are exactly where the test put them.
 */
test.describe('Visual regression', () => {
  test('main menu', async ({ app, page }) => {
    await app.open({ e2e: false });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot('menu.png');
  });

  test('arena in a stable state', async ({ app, page }) => {
    await app.startQuietMatch();
    await app.game.place({
      clearEnemies: true,
      player: { x: 256, y: 576, heading: 0.4 },
      enemies: [
        { kind: 'chaser', x: 760, y: 330, heading: 4.2, cooldown: 99 },
        { kind: 'shooter', x: 700, y: 620, heading: 5.3, hp: 20, cooldown: 99 },
        { kind: 'shooter', x: 1120, y: 90, heading: 3.4, hp: 8, cooldown: 99 },
      ],
    });
    await app.game.advance(0.05);
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ app, page }) => {
    await app.startQuietMatch();
    await app.game.earnPoints(2);
    await app.game.endByTime();
    await expect(page.getByTestId('record-status')).toHaveText('Saved to the leaderboard');
    await expect(page).toHaveScreenshot('result.png');
  });
});
