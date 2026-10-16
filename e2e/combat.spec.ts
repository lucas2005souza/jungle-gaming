import { expect, test, type App } from './fixtures';

/** Player at (200,600) facing up; a Shooter that is too close to advance and cannot shoot. */
async function setup(app: App, target: { x: number; y: number }, player = { x: 200, y: 600, heading: 0 }, hp?: number) {
  await app.startQuietMatch();
  await app.game.place({
    clearEnemies: true,
    player,
    enemies: [{ kind: 'shooter', x: target.x, y: target.y, heading: 0, cooldown: 99, hp }],
  });
}

const mine = (s: Awaited<ReturnType<App['game']['state']>>) => s.projectiles.filter(p => p.owner === 'player');

test.describe('Shooting, damage, cooldowns and score', () => {
  test('front shot: one projectile that damages the target exactly once', async ({ app }) => {
    await setup(app, { x: 200, y: 350 });
    let s = await app.game.tap('Space');
    expect(mine(s)).toHaveLength(1);
    s = await app.game.advance(1.2);
    expect(mine(s)).toHaveLength(0); // removed on impact
    expect(s.counters.hits).toBe(1);
    expect(s.enemies[0].hp).toBe(s.enemies[0].maxHp - s.config.front.damage);
  });

  test('right broadside (E): three parallel projectiles, all of them hit', async ({ app }) => {
    await setup(app, { x: 430, y: 600 });
    let s = await app.game.tap('KeyE');
    const shots = mine(s);
    expect(shots).toHaveLength(s.config.side.count);
    expect(new Set(shots.map(p => Math.round(p.vx))).size).toBe(1); // same direction
    expect(new Set(shots.map(p => Math.round(p.vy))).size).toBe(1);
    expect(shots[0].vx).toBeGreaterThan(0); // starboard
    const ys = shots.map(p => p.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(s.config.side.spacing, 0); // evenly spaced along the hull
    expect(ys[2] - ys[1]).toBeCloseTo(s.config.side.spacing, 0);

    s = await app.game.advance(1.2);
    expect(s.counters.hits).toBe(3);
    expect(s.enemies[0].hp).toBe(s.enemies[0].maxHp - 3 * s.config.side.damage);
  });

  test('left broadside (Q) fires to the port side', async ({ app }) => {
    await setup(app, { x: 370, y: 600 }, { x: 600, y: 600, heading: 0 });
    let s = await app.game.tap('KeyQ');
    expect(mine(s)).toHaveLength(s.config.side.count);
    expect(mine(s)[0].vx).toBeLessThan(0);
    s = await app.game.advance(1.2);
    expect(s.enemies[0].hp).toBe(s.enemies[0].maxHp - 3 * s.config.side.damage);
  });

  test('weapons respect their cooldown when the key stays pressed', async ({ app }) => {
    await app.startQuietMatch();
    let s = await app.game.hold(['Space'], 1);
    expect(s.counters.shotsFront).toBeGreaterThanOrEqual(3);
    expect(s.counters.shotsFront).toBeLessThanOrEqual(Math.floor(1 / s.config.front.cooldown) + 1);

    s = await app.game.hold(['KeyE'], 1);
    expect(s.counters.shotsSide).toBe(2); // one at once, the next after the 0.9 s cooldown
  });

  test('projectiles disappear when they leave the arena or hit an island', async ({ app }) => {
    await app.startQuietMatch();
    await app.game.place({ player: { x: 1100, y: 100, heading: Math.PI / 2 } }); // fires out of the arena
    await app.game.tap('Space');
    let s = await app.game.advance(0.5);
    expect(mine(s)).toHaveLength(0);

    await app.game.place({ player: { x: 400, y: 560, heading: 0 } }); // fires into an island
    await app.game.tap('Space');
    s = await app.game.advance(1);
    expect(mine(s)).toHaveLength(0);
    expect(s.counters.blocked).toBeGreaterThanOrEqual(1);
    expect(s.counters.hits).toBe(0);
  });

  test('a destroyed enemy scores exactly one point and stops taking part', async ({ app, page }) => {
    await app.startQuietMatch();
    const { config } = await app.game.state();
    await app.game.place({
      clearEnemies: true,
      player: { x: 200, y: 600, heading: 0, hp: 1000 },
      enemies: [{ kind: 'shooter', x: 200, y: 350, heading: Math.PI, cooldown: 99, hp: config.front.damage }],
    });
    let s = await app.game.hold(['Space'], 1);
    expect(s.score).toBe(1);
    expect(s.counters.destroyedByPlayer).toBe(1);
    expect(s.enemies).toHaveLength(0);
    const hitsAfterKill = s.counters.hits;

    s = await app.game.hold(['Space'], 1.5); // keep shooting at the empty sea
    expect(s.score).toBe(1);
    expect(s.counters.hits).toBe(hitsAfterKill);
    await expect(page.getByRole('group', { name: 'Match status' })).toContainText(/Score\s*1/);
  });

  test('enemy projectiles damage the player', async ({ app }) => {
    await app.startQuietMatch();
    await app.game.place({
      clearEnemies: true,
      player: { x: 200, y: 600, heading: 0 },
      enemies: [{ kind: 'shooter', x: 200, y: 400, heading: Math.PI, cooldown: 0 }],
    });
    const s = await app.game.advance(1);
    expect(s.counters.playerHits).toBeGreaterThanOrEqual(1);
    expect(s.player.hp).toBe(s.player.maxHp - s.counters.playerHits * s.config.shooter.damage);
  });
});
