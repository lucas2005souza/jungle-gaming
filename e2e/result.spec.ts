import { KEYS, expect, test } from './fixtures';

test.describe('Result screen', () => {
  test('shows score, time, reason and record status; survives a refresh', async ({ app, page }) => {
    await app.startQuietMatch();
    await app.game.earnPoints(2);
    await app.game.endByTime();

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
    await expect(page.getByTestId('result-score')).toHaveText('2');
    await expect(page.getByTestId('result-time')).toHaveText('01:00');
    await expect(page.getByTestId('result-reason')).toHaveText('Time is up');
    await expect(page.getByTestId('record-status')).toHaveText('Saved to the leaderboard');
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible();

    // The last completed match is persisted locally.
    expect(await app.storage(KEYS.lastResult)).toMatchObject({ score: 2, reason: 'time_up' });

    await page.reload();
    await expect(app.menuTitle).toBeVisible();
    await page.getByRole('button', { name: /Last result · 2 pts/ }).click();
    await expect(page.getByTestId('result-score')).toHaveText('2');
    await expect(page.getByTestId('result-time')).toHaveText('01:00');
    await expect(page.getByTestId('result-reason')).toHaveText('Time is up');
    await expect(page.getByTestId('record-status')).toHaveText('Saved to the leaderboard');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(app.menuTitle).toBeVisible();
  });

  test('a defeat reports the real time played and the reason', async ({ app, page }) => {
    await app.startQuietMatch();
    await app.game.earnPoints(1);
    await app.game.endByDeath();

    await expect(page.getByRole('heading', { name: 'Ship sunk' })).toBeVisible();
    await expect(page.getByTestId('result-score')).toHaveText('1');
    await expect(page.getByTestId('result-reason')).toHaveText('Ship destroyed');
    await expect(page.getByTestId('result-time')).toHaveText(/^00:0\d$/); // well under the 60 s limit
  });

  test('Play Again from the result starts another match', async ({ app, page }) => {
    await app.startQuietMatch();
    await app.game.endByTime();
    await page.getByRole('button', { name: 'Play Again' }).click();
    const s = await app.game.ready();
    expect(s.elapsed).toBe(0);
  });
});
