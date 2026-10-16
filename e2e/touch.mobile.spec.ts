import { expect, test, type App } from './fixtures';

/** Real multi-touch through the DevTools protocol: pointer events with real pointer ids. */
async function touches(app: App) {
  const cdp = await app.page.context().newCDPSession(app.page);
  const center = async (name: string) => {
    const box = await app.page.getByRole('button', { name }).boundingBox();
    if (!box) throw new Error(`button "${name}" not found`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  return {
    async press(names: string[]) {
      const points = await Promise.all(names.map(async (n, id) => ({ ...(await center(n)), id })));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    },
    async release() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
  };
}

test.describe('Touch controls (mobile, landscape)', () => {
  test('touch buttons are visible, inside the screen and do not cut the arena or the HUD', async ({ app, page }) => {
    await app.startQuietMatch();
    const vp = page.viewportSize()!;
    for (const name of ['Turn left', 'Sail diagonally left', 'Sail forward', 'Sail diagonally right', 'Turn right', 'Fire left side', 'Fire front', 'Fire right side']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44); // usable touch target
    }
    const hud = await page.getByRole('group', { name: 'Match status' }).boundingBox();
    expect(hud!.x + hud!.width).toBeLessThanOrEqual(vp.width);
    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(canvas!.height).toBeLessThanOrEqual(vp.height + 1);
  });

  test('holding the forward button sails; releasing it stops', async ({ app }) => {
    const s0 = await app.startQuietMatch();
    const t = await touches(app);
    await t.press(['Sail forward']);
    const moving = await app.game.advance(0.5);
    expect(s0.player.y - moving.player.y).toBeCloseTo(95, 0);
    await t.release();
    const stopped = await app.game.advance(0.5);
    expect(stopped.player.y).toBeCloseTo(moving.player.y, 1);
  });

  test('turn buttons rotate in both directions', async ({ app }) => {
    await app.startQuietMatch();
    const t = await touches(app);
    await t.press(['Turn right']);
    let s = await app.game.advance(0.5);
    await t.release();
    expect(s.player.heading).toBeCloseTo(1.1, 1);
    await t.press(['Turn left']);
    s = await app.game.advance(0.5);
    await t.release();
    expect(s.player.heading).toBeCloseTo(0, 1);
  });

  test('diagonal buttons sail forward while turning to each side', async ({ app }) => {
    const s0 = await app.startQuietMatch();
    const t = await touches(app);
    await t.press(['Sail diagonally right']);
    const right = await app.game.advance(0.5);
    await t.release();
    expect(right.player.heading).toBeCloseTo(1.1, 1);
    expect(right.player.x).toBeGreaterThan(s0.player.x + 20);
    expect(right.player.y).toBeLessThan(s0.player.y - 20);

    await t.press(['Sail diagonally left']);
    const left = await app.game.advance(0.5);
    await t.release();
    expect(left.player.heading).toBeCloseTo(0, 1);
    const stopped = await app.game.advance(0.5);
    expect(stopped.player.x).toBeCloseTo(left.player.x, 1);
    expect(stopped.player.y).toBeCloseTo(left.player.y, 1);
  });

  test('moving and firing at the same time (multi-touch)', async ({ app }) => {
    const s0 = await app.startQuietMatch();
    const t = await touches(app);
    await t.press(['Sail forward', 'Fire front']);
    const s = await app.game.advance(1);
    await t.release();
    expect(s0.player.y - s.player.y).toBeGreaterThan(150);
    expect(s.counters.shotsFront).toBeGreaterThanOrEqual(3);
  });

  test('both broadsides fire from their buttons', async ({ app }) => {
    await app.startQuietMatch();
    const t = await touches(app);
    await t.press(['Fire right side']);
    let s = await app.game.advance(0.1);
    await t.release();
    expect(s.counters.shotsSide).toBe(1);
    await t.press(['Fire left side']);
    s = await app.game.advance(0.1);
    await t.release();
    expect(s.counters.shotsSide).toBe(2);
  });

  test('the pause button works with a tap', async ({ app, page }) => {
    await app.startQuietMatch();
    await page.getByRole('button', { name: 'Pause' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Game paused' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Resume' }).tap();
    await expect(dialog).toBeHidden();
  });

  test('portrait pauses the match and asks to rotate; landscape lets the player resume', async ({ app, page }) => {
    await app.startQuietMatch();
    await page.setViewportSize({ width: 393, height: 851 });
    await expect(page.getByText('Rotate your device to landscape')).toBeVisible();
    await expect.poll(async () => (await app.game.state()).status).toBe('paused');

    await page.setViewportSize({ width: 851, height: 393 });
    await expect(page.getByText('Rotate your device to landscape')).toBeHidden();
    await page.getByRole('button', { name: 'Resume' }).tap();
    expect((await app.game.state()).status).toBe('running');
  });
});