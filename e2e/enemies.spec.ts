import { expect, test } from './fixtures';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test.describe('Enemy behaviour and spawning', () => {
  test('a Chaser pursues the player, rams the ship and does not score', async ({ app }) => {
    await app.startQuietMatch();
    await app.game.place({
      clearEnemies: true,
      player: { x: 200, y: 650, heading: 0 },
      enemies: [{ kind: 'chaser', x: 200, y: 100, heading: Math.PI }],
    });
    const s0 = await app.game.state();
    const d0 = dist(s0.enemies[0], s0.player);

    const s1 = await app.game.advance(2);
    expect(dist(s1.enemies[0], s1.player)).toBeLessThan(d0 - 200); // closing in

    const s2 = await app.game.advance(5);
    expect(s2.counters.playerCollisions).toBe(1);
    expect(s2.player.hp).toBe(s2.player.maxHp - s2.config.chaserContactDamage);
    expect(s2.enemies).toHaveLength(0); // exploded on impact
    expect(s2.score).toBe(0); // self-destruction never scores
    expect(s2.counters.destroyedByPlayer).toBe(0);
  });

  test('a Shooter approaches, fires only inside its attack range and keeps its distance', async ({ app }) => {
    await app.startQuietMatch();
    await app.game.place({
      clearEnemies: true,
      player: { x: 200, y: 650, heading: 0, hp: 1000 },
      enemies: [{ kind: 'shooter', x: 200, y: 100, heading: Math.PI }],
    });
    const s1 = await app.game.advance(0.5);
    expect(dist(s1.enemies[0], s1.player)).toBeGreaterThan(s1.config.shooter.attackRange); // still out of range
    expect(s1.counters.enemyShots).toBe(0);

    const s2 = await app.game.advance(6);
    expect(s2.counters.enemyShots).toBeGreaterThanOrEqual(1);
    for (const d of s2.enemyShotDistances) expect(d).toBeLessThanOrEqual(s2.config.shooter.attackRange + 1);
    expect(dist(s2.enemies[0], s2.player)).toBeGreaterThanOrEqual(s2.config.shooter.keepDistance - 5);
  });

  test('enemies steer around islands instead of sailing through them', async ({ app }) => {
    await app.startQuietMatch();
    await app.game.place({
      clearEnemies: true,
      player: { x: 700, y: 360, heading: 0, hp: 5000 },
      enemies: [{ kind: 'chaser', x: 150, y: 360, heading: Math.PI / 2 }], // island between it and the player
    });
    await app.game.resetMetrics();
    const s = await app.game.advance(12);
    expect(s.metrics.stepsEnemyInIsland).toBe(0);
  });

  for (const interval of [1, 2]) {
    test(`enemies spawn every ${interval} s, in a safe spot (both types appear)`, async ({ app }) => {
      await app.open({ seed: 1, options: { durationSec: 60, spawnIntervalSec: interval } });
      await app.startMatch();
      await app.game.place({ player: { hp: 1000 } });
      const s = await app.game.advance(4.5);

      const expected = Math.floor(4.5 / interval);
      expect(s.spawns).toHaveLength(expected);
      s.spawns.forEach((sp, i) => expect(sp.t).toBeCloseTo((i + 1) * interval, 1));

      for (const sp of s.spawns) {
        expect(Math.hypot(sp.x - sp.playerX, sp.y - sp.playerY)).toBeGreaterThanOrEqual(s.config.spawnMinDistance - 0.5);
        for (const isl of s.islands) expect(Math.hypot(sp.x - isl.x, sp.y - isl.y)).toBeGreaterThan(isl.radius);
        expect(sp.x).toBeGreaterThan(0);
        expect(sp.x).toBeLessThan(s.arena.width);
        expect(sp.y).toBeGreaterThan(0);
        expect(sp.y).toBeLessThan(s.arena.height);
      }
      if (expected >= 2) {
        expect(s.spawns[0].kind).toBe('chaser');
        expect(s.spawns[1].kind).toBe('shooter');
      }
    });
  }

  test('the enemy count never exceeds the configured maximum', async ({ app }) => {
    await app.open({ seed: 3, options: { durationSec: 60, spawnIntervalSec: 0.5 } });
    await app.startMatch();
    await app.game.place({ player: { hp: 100000 } });
    const s = await app.game.advance(20);
    expect(s.status).toBe('running');
    expect(s.enemies.length).toBeLessThanOrEqual(s.config.maxEnemies);
  });
});
