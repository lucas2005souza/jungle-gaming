import { KEYS, expect, test } from './fixtures';

test.describe('Options', () => {
  test('opens from the menu and returns to it', async ({ app, page }) => {
    await app.open({ e2e: false });
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(app.menuTitle).toBeVisible();
  });

  test('validates both fields and blocks saving invalid values', async ({ app, page }) => {
    await app.open({ e2e: false });
    await page.getByRole('button', { name: 'Options' }).click();
    const save = page.getByRole('button', { name: 'Save' });

    await page.locator('#duration').fill('30');
    await expect(page.getByText('Game session time must be between 60 and 180 seconds.')).toBeVisible();
    await expect(page.locator('#duration')).toHaveAttribute('aria-invalid', 'true');
    await expect(save).toBeDisabled();

    await page.locator('#duration').fill('181');
    await expect(page.getByText('Game session time must be between 60 and 180 seconds.')).toBeVisible();

    await page.locator('#duration').fill('90');
    await page.locator('#spawn').fill('0');
    await expect(page.getByText('Enemy spawn time must be between 0.5 and 10 seconds.')).toBeVisible();
    await expect(save).toBeDisabled();

    await page.locator('#spawn').fill('');
    await expect(page.getByText('Enemy spawn time must be between 0.5 and 10 seconds.')).toBeVisible();

    await page.locator('#spawn').fill('2');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(save).toBeEnabled();
  });

  test('the - and + buttons stop at the documented limits', async ({ app, page }) => {
    await app.open({ e2e: false });
    await page.getByRole('button', { name: 'Options' }).click();
    await page.locator('#duration').fill('180');
    await expect(page.getByRole('button', { name: 'Increase game session time' })).toBeDisabled();
    await page.getByRole('button', { name: 'Decrease game session time' }).click();
    await expect(page.locator('#duration')).toHaveValue('175');
    await page.locator('#duration').fill('60');
    await expect(page.getByRole('button', { name: 'Decrease game session time' })).toBeDisabled();

    await page.locator('#spawn').fill('10');
    await expect(page.getByRole('button', { name: 'Increase enemy spawn time' })).toBeDisabled();
    await page.locator('#spawn').fill('0.5');
    await expect(page.getByRole('button', { name: 'Decrease enemy spawn time' })).toBeDisabled();
  });

  test('saved options persist after a refresh and are used by the next match', async ({ app, page }) => {
    await app.open();
    await page.getByRole('button', { name: 'Options' }).click();
    await page.locator('#duration').fill('120');
    await page.locator('#spawn').fill('3');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved. Applies to your next match.')).toBeVisible();
    expect(await app.storage(KEYS.options)).toEqual({ durationSec: 120, spawnIntervalSec: 3 });

    await page.reload();
    await expect(app.menuTitle).toBeVisible();
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.locator('#duration')).toHaveValue('120');
    await expect(page.locator('#spawn')).toHaveValue('3');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    const s = await app.startMatch();
    expect(s.config.durationSec).toBe(120);
    expect(s.config.spawnIntervalSec).toBe(3);
  });

  test('options edited from the pause menu only affect the next match', async ({ app, page }) => {
    const s0 = await app.startQuietMatch();
    expect(s0.config.durationSec).toBe(60);

    const dialog = await app.pauseWithButton();
    await dialog.getByRole('button', { name: 'Options' }).click();
    await page.locator('#duration').fill('150');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved. Applies to your next match.')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();

    expect((await app.game.state()).config.durationSec).toBe(60); // the running match keeps its snapshot

    await app.pauseWithButton();
    await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click();
    await expect(app.menuTitle).toBeVisible();
    const s1 = await app.startMatch();
    expect(s1.config.durationSec).toBe(150);
  });
});
