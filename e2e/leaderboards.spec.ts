import { expect, test } from './fixtures';

const FIRST_PAGE = ['Captain Flint', 'Red Sparrow', 'Tide Walker', 'Storm Rider', 'Sea Wolf'];
const SECOND_PAGE = ['Black Anne', 'Iron Hook', 'Salty Pete', 'Mad Morgan', 'Jolly Rose'];
const THIRD_PAGE = ['Barnacle Bill', 'Dread Mary'];

test.describe('Ranking', () => {
  test('lists the leaderboard for the player\'s configuration, ordered by score', async ({ app, page }) => {
    await app.open({ e2e: false });
    await app.openLog('Ranking');
    await expect(app.pagerLabel).toHaveText('Page 1 of 3');
    await expect.poll(() => app.rankingCaptains()).toEqual(FIRST_PAGE);
    expect(await page.locator('table.ranking tbody tr td:first-child').allInnerTexts()).toEqual(['01', '02', '03', '04', '05']);
    expect(await page.locator('table.ranking tbody td.points').allInnerTexts()).toEqual(['38', '32', '21', '21', '19']);
  });

  test('ties are broken deterministically: the earlier match ranks higher', async ({ app }) => {
    await app.open({ e2e: false });
    await app.openLog('Ranking');
    // Storm Rider and Tide Walker both have 21 points; Tide Walker finished first.
    await expect.poll(async () => (await app.rankingCaptains()).slice(2, 4)).toEqual(['Tide Walker', 'Storm Rider']);
  });

  test('paginates forward and back', async ({ app, page }) => {
    await app.open({ e2e: false });
    await app.openLog('Ranking');
    const prev = page.getByRole('button', { name: 'Previous page' });
    const next = page.getByRole('button', { name: 'Next page' });
    await expect(prev).toBeDisabled();

    await next.click();
    await expect(app.pagerLabel).toHaveText('Page 2 of 3');
    await expect.poll(() => app.rankingCaptains()).toEqual(SECOND_PAGE);

    await next.click();
    await expect(app.pagerLabel).toHaveText('Page 3 of 3');
    await expect.poll(() => app.rankingCaptains()).toEqual(THIRD_PAGE);
    await expect(next).toBeDisabled();

    await prev.click();
    await expect.poll(() => app.rankingCaptains()).toEqual(SECOND_PAGE);
  });

  test('only matches with the same configuration are compared', async ({ app, page }) => {
    await app.open({ e2e: false });
    await app.openLog('Ranking');
    await page.getByLabel('Battle length').selectOption('60');
    await page.getByLabel('Spawn interval').selectOption('2');
    await expect(page.locator('.log-sub')).toContainText('60 second battles · 2 second spawn interval');
    await expect.poll(() => app.rankingCaptains()).toEqual(['Captain Flint', 'Red Sparrow', 'Sea Wolf']);
    await expect(app.pagerLabel).toHaveText('Page 1 of 1');

    await page.getByRole('button', { name: 'Use my options' }).click();
    await expect.poll(() => app.rankingCaptains()).toEqual(FIRST_PAGE);
  });

  test('the tabs are keyboard accessible', async ({ app, page }) => {
    await app.open({ e2e: false });
    await app.openLog('Ranking');
    const ranking = page.getByRole('tab', { name: 'Ranking' });
    await ranking.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Match History' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(ranking).toHaveAttribute('aria-selected', 'true');
  });

  test('empty state', async ({ app, page }) => {
    await app.open({ e2e: false, scenario: 'empty' });
    await app.openLog('Ranking');
    await expect(page.getByText(/No captain has played 90-second battles/)).toBeVisible();
    await expect(app.pagerLabel).toHaveText('Page 1 of 1');
  });

  test('many pages', async ({ app }) => {
    await app.open({ e2e: false, scenario: 'multi-page' });
    await app.openLog('Ranking');
    await expect(app.pagerLabel).toHaveText('Page 1 of 15');
  });

  test('shows a loading state while the request is slow', async ({ app, page }) => {
    await app.open({ e2e: false, scenario: 'slow', latency: null });
    await app.openLog('Ranking');
    await expect(page.getByText('Loading…')).toBeVisible();
    await expect.poll(() => app.rankingCaptains(), { timeout: 10_000 }).toEqual(FIRST_PAGE);
    await expect(page.getByText('Loading…')).toBeHidden();
  });
});

test.describe('Match history', () => {
  test('empty state for a player with no matches', async ({ app, page }) => {
    await app.open({ e2e: false });
    await app.openLog('Match History');
    await expect(page.getByText('No battles yet')).toBeVisible();
    await expect(app.pagerLabel).toHaveText('Page 1 of 1');
  });

  test('paginates a long history', async ({ app, page }) => {
    await app.open({ e2e: false, scenario: 'multi-page' });
    await app.openLog('Match History');
    await expect(app.pagerLabel).toHaveText('Page 1 of 5');
    await expect(app.historyRows()).toHaveCount(5);
    const next = page.getByRole('button', { name: 'Next page' });
    for (let p = 2; p <= 5; p++) {
      await next.click();
      await expect(app.pagerLabel).toHaveText(`Page ${p} of 5`);
    }
    await expect(app.historyRows()).toHaveCount(3); // 23 matches: 4 full pages + 3
    await expect(next).toBeDisabled();
  });
});

test.describe('Failures', () => {
  test.use({ strictConsole: false }); // failing requests are logged by the browser on purpose
  test.setTimeout(60_000);

  test('a failing ranking shows an accessible error and recovers when the service is back', async ({ app, page }) => {
    await app.open({ e2e: false, scenario: 'ranking-fails' });
    await app.openLog('Ranking');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Could not load the ranking.', { timeout: 15_000 });
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();

    await app.setScenario('success'); // the service is back: lists refetch on their own
    await expect.poll(() => app.rankingCaptains(), { timeout: 10_000 }).toEqual(FIRST_PAGE);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('Try again retries the request', async ({ app, page }) => {
    await app.open({ e2e: false, scenario: 'ranking-fails' });
    await app.openLog('Ranking');
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 15_000 });

    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('#log-panel')).toHaveAttribute('aria-busy', 'true'); // a new attempt is running
    await expect(page.getByRole('status').filter({ hasText: 'Loading…' })).toBeVisible();
    await app.setScenario('success');
    await expect.poll(() => app.rankingCaptains(), { timeout: 10_000 }).toEqual(FIRST_PAGE);
  });

  test('a failing history does not break the ranking tab', async ({ app, page }) => {
    await app.open({ e2e: false, scenario: 'history-fails' });
    await app.openLog('Ranking');
    await expect.poll(() => app.rankingCaptains()).toEqual(FIRST_PAGE);

    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not load your match history.', { timeout: 15_000 });

    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect.poll(() => app.rankingCaptains()).toEqual(FIRST_PAGE);
  });

  test('a 4xx answer is reported without retrying', async ({ app, page }) => {
    await app.open({ e2e: false, scenario: 'http-4xx' });
    await app.openLog('Ranking');
    await expect(page.getByRole('alert')).toContainText('403', { timeout: 4_000 }); // no retry delays for 4xx
  });

  test('a connection failure is reported', async ({ app, page }) => {
    await app.open({ e2e: false, scenario: 'network-error' });
    await app.openLog('Ranking');
    await expect(page.getByRole('alert')).toContainText('Could not load the ranking.', { timeout: 15_000 });
  });

  test('a timeout is reported', async ({ app, page }) => {
    test.setTimeout(90_000);
    await app.open({ e2e: false, scenario: 'timeout', latency: null });
    await app.openLog('Ranking');
    await expect(page.getByRole('alert')).toContainText('timed out', { timeout: 45_000 });
  });

  test('the game and the options stay usable while the API is down', async ({ app, page }) => {
    await app.open({ scenario: 'http-5xx', seed: 1, options: { durationSec: 60, spawnIntervalSec: 10 } });
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();
    const s = await app.startMatch();
    expect(s.status).toBe('running');
    await app.game.hold(['KeyW'], 1);
    expect((await app.game.state()).status).toBe('running');
  });
});

test.describe('Late responses', () => {
  test('a slow answer for an old request never overwrites what the player is looking at', async ({ app, page }) => {
    // out-of-order: requests alternate fast / slow (2 s), so older answers arrive after newer ones.
    await app.open({ e2e: false, scenario: 'out-of-order', latency: null });
    await app.openLog('Ranking');
    await expect.poll(() => app.rankingCaptains()).toEqual(FIRST_PAGE); // request #1: fast

    await page.getByRole('button', { name: 'Next page' }).click(); // request #2: slow (2 s)
    await page.getByLabel('Spawn interval').selectOption('2'); // request #3: fast, for another leaderboard
    await expect(page.getByText(/No captain has played 90-second battles with a 2-second spawn interval/)).toBeVisible();

    await page.waitForTimeout(3_000); // the slow answer for the old page has arrived by now
    await expect(page.getByText(/No captain has played 90-second battles with a 2-second spawn interval/)).toBeVisible();
    expect(await app.rankingCaptains()).toEqual([]);
    await expect(app.pagerLabel).toHaveText('Page 1 of 1');

    await page.getByRole('button', { name: 'Use my options' }).click();
    await expect.poll(() => app.rankingCaptains()).toEqual(FIRST_PAGE);
    await expect(app.pagerLabel).toHaveText('Page 1 of 3');
  });
});