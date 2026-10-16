import type { GameSession } from './GameSession';
import { FIXED_STEP } from './Simulation';
import type { Ship, ShipKind } from './types';

/**
 * Test instrumentation, active only with `?e2e=1`.
 *
 * It observes the state and drives the *clock*. Rules, input, collisions and rendering run unchanged:
 * tests press real keys / touch real buttons, then advance simulated time in exact fixed steps.
 * `place()` only sets initial conditions (where ships start); it never decides an outcome.
 *
 *   ?e2e=1                manual clock (the simulation only moves when the test advances it)
 *   ?e2e=1&clock=real     real clock (used by the pause tests)
 *   ?seed=N               seeds the spawn RNG
 */

export interface E2EParams {
  enabled: boolean;
  manualClock: boolean;
  seed: number | undefined;
}

export function readE2EParams(): E2EParams {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const seed = Number(q.get('seed'));
  return {
    enabled: q.get('e2e') === '1',
    manualClock: q.get('clock') !== 'real',
    seed: q.has('seed') && Number.isFinite(seed) ? seed : undefined,
  };
}

export interface PlaceSpec {
  clearEnemies?: boolean;
  player?: { x?: number; y?: number; heading?: number; hp?: number };
  enemies?: { kind: ShipKind & ('chaser' | 'shooter'); x: number; y: number; heading?: number; hp?: number; cooldown?: number }[];
}

export interface E2EState {
  instanceId: number;
  clock: 'manual' | 'real';
  status: 'running' | 'paused' | 'ended';
  reason: 'time_up' | 'player_destroyed' | null;
  elapsed: number;
  timeLeft: number;
  score: number;
  player: { x: number; y: number; heading: number; hp: number; maxHp: number; radius: number; alive: boolean; cooldowns: { front: number; left: number; right: number } };
  enemies: { id: number; kind: ShipKind; x: number; y: number; heading: number; hp: number; maxHp: number; radius: number }[];
  projectiles: { id: number; owner: 'player' | 'enemy'; x: number; y: number; vx: number; vy: number; damage: number }[];
  arena: { width: number; height: number };
  islands: { x: number; y: number; radius: number }[];
  config: {
    durationSec: number;
    spawnIntervalSec: number;
    spawnMinDistance: number;
    maxEnemies: number;
    front: { damage: number; cooldown: number };
    side: { damage: number; cooldown: number; count: number; spacing: number };
    shooter: { attackRange: number; keepDistance: number; damage: number; cooldown: number };
    chaserContactDamage: number;
  };
  counters: {
    shotsFront: number; shotsSide: number; enemyShots: number;
    hits: number; playerHits: number; blocked: number; playerCollisions: number;
    destroyedByPlayer: number; destroyedTotal: number;
    spawned: { chaser: number; shooter: number };
  };
  spawns: { t: number; kind: ShipKind; x: number; y: number; playerX: number; playerY: number }[];
  enemyShotDistances: number[];
  metrics: { minIslandGap: number; stepsOutOfArena: number; stepsEnemyInIsland: number };
}

/** Lightweight snapshot (no copies of the entity lists): safe to read every frame or every second. */
export interface E2ECounts {
  status: E2EState['status'];
  elapsed: number;
  score: number;
  enemies: number;
  projectiles: number;
  /** player (if alive) + live enemies + live projectiles */
  entities: number;
}

export interface E2EGame {
  state(): E2EState;
  /** Cheap status read (no allocation): used by the performance probe. */
  status(): E2EState['status'];
  /** Cheap counters (alive enemies / projectiles / entities): used by the performance probe. */
  counts(): E2ECounts;
  /** Advances simulated time by `seconds` using exact fixed steps (manual clock only). */
  advance(seconds: number): E2EState;
  place(spec: PlaceSpec): void;
  resetMetrics(): void;
}

declare global {
  interface Window {
    __pirateGame?: E2EGame;
  }
}

let instanceCounter = 0;

export function installTestHooks(session: GameSession): () => void {
  const sim = session.sim;
  const manual = readE2EParams().manualClock;
  const instanceId = ++instanceCounter;
  let nextEnemyId = -1;

  const counters: E2EState['counters'] = {
    shotsFront: 0, shotsSide: 0, enemyShots: 0, hits: 0, playerHits: 0, blocked: 0, playerCollisions: 0,
    destroyedByPlayer: 0, destroyedTotal: 0, spawned: { chaser: 0, shooter: 0 },
  };
  const spawns: E2EState['spawns'] = [];
  const enemyShotDistances: number[] = [];
  const metrics: E2EState['metrics'] = { minIslandGap: Infinity, stepsOutOfArena: 0, stepsEnemyInIsland: 0 };

  const off = session.onEvent(e => {
    switch (e.type) {
      case 'shot': {
        if (e.shipId === sim.player.id) {
          if (e.weapon === 'front') counters.shotsFront++;
          else counters.shotsSide++;
        } else {
          counters.enemyShots++;
          const ship = sim.enemies.find(s => s.id === e.shipId);
          if (ship) enemyShotDistances.push(Math.hypot(ship.x - sim.player.x, ship.y - sim.player.y));
        }
        break;
      }
      case 'hit':
        counters.hits++;
        if (e.targetId === sim.player.id) counters.playerHits++;
        break;
      case 'blocked': counters.blocked++; break;
      case 'playerCollision': counters.playerCollisions++; break;
      case 'shipDestroyed':
        if (e.kind !== 'player') {
          counters.destroyedTotal++;
          if (e.byPlayer) counters.destroyedByPlayer++;
        }
        break;
      case 'enemySpawned': {
        const ship = sim.enemies.find(s => s.id === e.shipId);
        if (e.kind === 'chaser' || e.kind === 'shooter') counters.spawned[e.kind]++;
        if (ship) spawns.push({ t: sim.elapsed, kind: e.kind, x: ship.x, y: ship.y, playerX: sim.player.x, playerY: sim.player.y });
        break;
      }
      default: break;
    }
  });

  const sample = (): void => {
    const { width, height } = sim.config.arena;
    const p = sim.player;
    for (const isl of sim.config.islands) {
      const gap = Math.hypot(p.x - isl.x, p.y - isl.y) - (isl.radius + p.radius);
      if (gap < metrics.minIslandGap) metrics.minIslandGap = gap;
      for (const e of sim.enemies) {
        if (Math.hypot(e.x - isl.x, e.y - isl.y) - (isl.radius + e.radius) < -0.01) metrics.stepsEnemyInIsland++;
      }
    }
    if (p.x < p.radius - 0.01 || p.y < p.radius - 0.01 || p.x > width - p.radius + 0.01 || p.y > height - p.radius + 0.01) metrics.stepsOutOfArena++;
  };

  const state = (): E2EState => {
    const c = sim.config;
    const p = sim.player;
    return {
      instanceId,
      clock: manual ? 'manual' : 'real',
      status: sim.status,
      reason: sim.endReason,
      elapsed: sim.elapsed,
      timeLeft: sim.timeLeft,
      score: sim.score,
      player: { x: p.x, y: p.y, heading: p.heading, hp: p.hp, maxHp: p.maxHp, radius: p.radius, alive: p.alive, cooldowns: { ...p.cooldowns } },
      enemies: sim.enemies.filter(e => e.alive).map(e => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, heading: e.heading, hp: e.hp, maxHp: e.maxHp, radius: e.radius })),
      projectiles: sim.projectiles.filter(pr => pr.alive).map(pr => ({ id: pr.id, owner: pr.owner, x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, damage: pr.damage })),
      arena: { ...c.arena },
      islands: c.islands.map(i => ({ x: i.x, y: i.y, radius: i.radius })),
      config: {
        durationSec: c.match.durationSec,
        spawnIntervalSec: c.match.spawnIntervalSec,
        spawnMinDistance: c.match.spawnMinDistanceFromPlayer,
        maxEnemies: c.match.maxEnemies,
        front: { damage: c.player.front.damage, cooldown: c.player.front.cooldown },
        side: { damage: c.player.side.damage, cooldown: c.player.side.cooldown, count: c.player.side.count, spacing: c.player.side.spacing },
        shooter: { attackRange: c.shooter.attackRange, keepDistance: c.shooter.keepDistance, damage: c.shooter.weapon.damage, cooldown: c.shooter.weapon.cooldown },
        chaserContactDamage: c.chaser.contactDamage,
      },
      counters: { ...counters, spawned: { ...counters.spawned } },
      spawns: spawns.map(s => ({ ...s })),
      enemyShotDistances: [...enemyShotDistances],
      metrics: { ...metrics },
    };
  };

  const api: E2EGame = {
    state,
    status: () => sim.status,
    counts() {
      let enemies = 0;
      for (const e of sim.enemies) if (e.alive) enemies++;
      let projectiles = 0;
      for (const pr of sim.projectiles) if (pr.alive) projectiles++;
      return {
        status: sim.status,
        elapsed: sim.elapsed,
        score: sim.score,
        enemies,
        projectiles,
        entities: (sim.player.alive ? 1 : 0) + enemies + projectiles,
      };
    },
    advance(seconds) {
      if (!manual) throw new Error('advance() needs the manual clock: open the app with ?e2e=1');
      const steps = Math.round(seconds / FIXED_STEP);
      for (let i = 0; i < steps && sim.status === 'running'; i++) {
        session.stepFixed();
        sample();
      }
      return state();
    },
    place(spec) {
      const p = sim.player;
      if (spec.player) {
        const { x, y, heading, hp } = spec.player;
        if (x !== undefined) p.x = x;
        if (y !== undefined) p.y = y;
        if (heading !== undefined) p.heading = heading;
        if (hp !== undefined) {
          p.hp = hp;
          p.maxHp = Math.max(p.maxHp, hp);
        }
      }
      if (spec.clearEnemies) sim.enemies.length = 0;
      for (const e of spec.enemies ?? []) {
        const stats = e.kind === 'chaser' ? sim.config.chaser.ship : sim.config.shooter.ship;
        const ship: Ship = {
          id: nextEnemyId--, kind: e.kind, x: e.x, y: e.y, heading: e.heading ?? 0,
          hp: e.hp ?? stats.maxHp, maxHp: Math.max(stats.maxHp, e.hp ?? 0), radius: stats.radius, alive: true, avoidSide: 0,
          cooldowns: { front: e.cooldown ?? (e.kind === 'shooter' ? sim.config.shooter.weapon.cooldown : 0), left: 0, right: 0 },
        };
        sim.enemies.push(ship);
      }
    },
    resetMetrics() {
      metrics.minIslandGap = Infinity;
      metrics.stepsOutOfArena = 0;
      metrics.stepsEnemyInIsland = 0;
    },
  };

  window.__pirateGame = api;
  return () => {
    off();
    if (window.__pirateGame === api) delete window.__pirateGame;
  };
}
