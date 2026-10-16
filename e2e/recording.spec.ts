import { KEYS, expect, test, type App } from './fixtures';

/** A finished match with `points` points, played through the real game (60 s, quiet sea). */
async function finishMatch(app: App, o: { scenario?: string; points?: number } = {}) {
  await app.startQuietMatch({ scenario: o.scenario });
  if (o.points) await app.game.earnPoints(o.points);
  await app.game.endByTime();
}

const SAVED = 'Saved to the leaderboard';

test.describe('Recording a finished match', () => {
  test('is saved once and shows up in both tabs, also after a refresh', async ({ app, page }) => {
    await app.open({ seed: 1, options: { durationSec: 60, spawnIntervalSec: 10 } });

    // Look at both lists first so they are cached: they must refresh by themselves afterwards.
    await app.openLog('Ranking');
    await expect(page.getByText(/No captain has played 60-second battles/)).toBeVisible();
    await app.closeLog();

    await app.startMatch();
    await app.game.earnPoints(3);
    await app.game.endByTime();
    await expect(page.getByTestId('record-status')).toHaveText(SAVED);
    expect(await app.storedCount(KEYS.mockDb)).toBe(1);
    expect(await app.storedCount(KEYS.pending)).toBe(0);

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await app.openLog('Ranking');
    const rows = page.locator('table.ranking tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Captain Jack');
    await expect(rows.first().locator('.you')).toBeVisible(); // marks the player's own entry
    await expect(rows.first().locator('td.points')).toHaveText('3');

    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(app.historyRows()).toHaveCount(1);
    await expect(app.historyRows().first().locator('.points')).toHaveText('3');

    await page.reload();
    await expect(app.menuTitle).toBeVisible();
    await app.openLog('Match History');
    await expect(app.historyRows()).toHaveCount(1);
    expect(await app.storedCount(KEYS.mockDb)).toBe(1);
  });

  test('save unavailable: the result is kept, the player can play again, and a retry saves it once', async ({ app, page }) => {
    await finishMatch(app, { scenario: 'save-unavailable', points: 1 });
    await expect(page.getByTestId('record-status')).toContainText('Not saved yet', { timeout: 15_000 });
    expect(await app.storedCount(KEYS.pending)).toBe(1);
    expect(await app.storedCount(KEYS.mockDb)).toBe(0);

    // A pending record never blocks the next match.
    await page.getByRole('button', { name: 'Play Again' }).click();
    expect((await app.game.ready()).status).toBe('running');
    await app.pauseWithButton();
    await page.getByRole('dialog').getByRole('button', { name: 'Main Menu' }).click();
    await expect(app.menuTitle).toBeVisible();
    expect(await app.storedCount(KEYS.pending)).toBe(1); // the abandoned match added nothing

    await page.getByRole('button', { name: /Last result/ }).click();
    await expect(page.getByTestId('record-status')).toContainText('Not saved yet');

    // Repeated clicks while it is still failing must not start parallel saves.
    await page.evaluate(() => {
      const retry = [...document.querySelectorAll('button')].find(b => b.textContent === 'Try again');
      retry?.click();
      retry?.click();
      retry?.click();
    });
    await expect(page.getByTestId('record-status')).toContainText('Not saved yet', { timeout: 15_000 });
    expect(await app.storedCount(KEYS.mockDb)).toBe(0);

    await app.setScenario('success'); // recovery
    await expect(page.getByTestId('record-status')).toHaveText(SAVED, { timeout: 10_000 });
    expect(await app.storedCount(KEYS.mockDb)).toBe(1);
    expect(await app.storedCount(KEYS.pending)).toBe(0);
  });

  test('a pending record survives a refresh and is registered after the service recovers', async ({ app, page }) => {
    await finishMatch(app, { scenario: 'save-unavailable', points: 2 });
    await expect(page.getByTestId('record-status')).toContainText('Not saved yet', { timeout: 15_000 });
    expect(await app.storedCount(KEYS.pending)).toBe(1);

    await page.goto(app.url({ scenario: 'success' })); // refresh, service back
    await expect(app.menuTitle).toBeVisible();
    await expect.poll(() => app.storedCount(KEYS.mockDb), { timeout: 10_000 }).toBe(1);
    await expect.poll(() => app.storedCount(KEYS.pending)).toBe(0);

    await app.openLog('Match History');
    await expect(app.historyRows()).toHaveCount(1);
    await expect(app.historyRows().first().locator('.points')).toHaveText('2');
  });

  test('a save that times out after being stored is not duplicated by the retry', async ({ app, page }) => {
    test.setTimeout(60_000);
    await finishMatch(app, { scenario: 'save-timeout', points: 1 });
    await expect.poll(() => app.storedCount(KEYS.mockDb)).toBe(1); // the server stored it; the answer never comes

    await app.setScenario('success'); // the next attempt (after the client timeout) gets a real answer
    await expect(page.getByTestId('record-status')).toHaveText(SAVED, { timeout: 30_000 });
    expect(await app.storedCount(KEYS.mockDb)).toBe(1); // still exactly one record
    expect(await app.storedCount(KEYS.pending)).toBe(0);

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await app.openLog('Match History');
    await expect(app.historyRows()).toHaveCount(1);
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect.poll(() => page.locator('table.ranking tbody tr').count()).toBe(1);
  });

  test('"Reset mock state" restores the initial state', async ({ app, page }) => {
    await finishMatch(app, { points: 1 });
    await expect(page.getByTestId('record-status')).toHaveText(SAVED);
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await app.openLog('Match History');
    await expect(app.historyRows()).toHaveCount(1);
    await app.closeLog();

    await page.evaluate(() => (window as unknown as { __pirateMock: { reset: () => void } }).__pirateMock.reset());
    expect(await app.storedCount(KEYS.mockDb)).toBe(0);
    await app.openLog('Match History');
    await expect(page.getByText('No battles yet')).toBeVisible();
  });
});
