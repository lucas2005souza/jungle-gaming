import { expect, test } from './fixtures';

// Request interception needs the service worker out of the way; this spec does not use the API.
test.use({ serviceWorkers: 'block', strictConsole: false });

test.describe('Asset loading', () => {
  test('shows a loading state with progress before the match starts', async ({ app, page }) => {
    await page.route('**/assets/png/**', async route => {
      await new Promise(r => setTimeout(r, 150));
      await route.continue();
    });
    await app.open();
    await app.playButton.click();
    await expect(page.getByRole('progressbar', { name: 'Loading game assets' })).toBeVisible();
    await app.game.ready();
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('a failed texture blocks the match, explains why and can be retried', async ({ app, page }) => {
    let failing = true;
    await page.route('**/ships/ship_*.png', route => (failing ? route.abort() : route.continue()));
    await app.open();
    await app.playButton.click();

    await expect(page.getByRole('heading', { name: 'Could not load game assets' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/asset/i);
    await expect(page.locator('canvas')).toHaveCount(0); // combat never started
    expect(await page.evaluate(() => window.__pirateGame)).toBeUndefined();

    failing = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await app.game.ready();
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('the player can go back to the menu after a failure', async ({ app, page }) => {
    await page.route('**/ships/ship_*.png', route => route.abort());
    await app.open();
    await app.playButton.click();
    await expect(page.getByRole('heading', { name: 'Could not load game assets' })).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(app.menuTitle).toBeVisible();
  });
});
