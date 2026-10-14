/** Central, typed gameplay configuration. Balance changes never require touching system logic. */

export interface ShipStats {
  maxHp: number;
  /** pixels / second */
  speed: number;
  /** radians / second */
  turnRate: number;
  /** collision radius in pixels */
  radius: number;
}

export interface WeaponStats {
  damage: number;
  /** pixels / second */
  projectileSpeed: number;
  /** seconds */
  projectileLife: number;
  /** seconds between shots */
  cooldown: number;
  projectileRadius: number;
}

export interface IslandDef {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface GameConfig {
  seed: number;
  arena: { width: number; height: number };
  match: {
    durationSec: number;
    spawnIntervalSec: number;
    maxEnemies: number;
    spawnMinDistanceFromPlayer: number;
    spawnEdgeMargin: number;
    /** Extra spacing (px) enemies try to keep between hulls. */
    enemySeparation: number;
    spawnWeights: { chaser: number; shooter: number };
  };
  player: {
    ship: ShipStats;
    front: WeaponStats;
    side: WeaponStats & { count: number; spacing: number };
  };
  chaser: { ship: ShipStats; contactDamage: number };
  shooter: {
    ship: ShipStats;
    weapon: WeaponStats;
    attackRange: number;
    /** Stops advancing once closer than this. */
    keepDistance: number;
    aimToleranceRad: number;
  };
  islands: IslandDef[];
}

/** Player-editable options (Options screen). */
export interface GameOptions {
  durationSec: number;
  spawnIntervalSec: number;
}

export const OPTION_LIMITS = {
  durationSec: { min: 60, max: 180, step: 5 },
  spawnIntervalSec: { min: 0.5, max: 10, step: 0.5 },
} as const;

export const DEFAULT_OPTIONS: GameOptions = { durationSec: 90, spawnIntervalSec: 2.5 };

export type OptionErrors = Partial<Record<keyof GameOptions, string>>;

export function validateOptions(o: GameOptions): OptionErrors {
  const e: OptionErrors = {};
  const d = OPTION_LIMITS.durationSec;
  const s = OPTION_LIMITS.spawnIntervalSec;
  if (!Number.isFinite(o.durationSec) || o.durationSec < d.min || o.durationSec > d.max)
    e.durationSec = `Game session time must be between ${d.min} and ${d.max} seconds.`;
  if (!Number.isFinite(o.spawnIntervalSec) || o.spawnIntervalSec < s.min || o.spawnIntervalSec > s.max)
    e.spawnIntervalSec = `Enemy spawn time must be between ${s.min} and ${s.max} seconds.`;
  return e;
}

export const BASE_CONFIG: GameConfig = {
  seed: 1,
  arena: { width: 1280, height: 720 },
  match: {
    durationSec: DEFAULT_OPTIONS.durationSec,
    spawnIntervalSec: DEFAULT_OPTIONS.spawnIntervalSec,
    maxEnemies: 12,
    spawnMinDistanceFromPlayer: 360,
    spawnEdgeMargin: 60,
    enemySeparation: 60,
    spawnWeights: { chaser: 0.5, shooter: 0.5 },
  },
  player: {
    ship: { maxHp: 100, speed: 190, turnRate: 2.2, radius: 30 },
    front: { damage: 12, projectileSpeed: 620, projectileLife: 1.1, cooldown: 0.28, projectileRadius: 5 },
    side: { damage: 8, projectileSpeed: 560, projectileLife: 0.9, cooldown: 0.9, projectileRadius: 5, count: 3, spacing: 22 },
  },
  chaser: { ship: { maxHp: 30, speed: 130, turnRate: 1.9, radius: 26 }, contactDamage: 25 },
  shooter: {
    ship: { maxHp: 45, speed: 90, turnRate: 1.5, radius: 28 },
    weapon: { damage: 8, projectileSpeed: 380, projectileLife: 1.6, cooldown: 1.6, projectileRadius: 5 },
    attackRange: 420,
    keepDistance: 280,
    aimToleranceRad: 0.2,
  },
  islands: [
    { id: 'i1', x: 400, y: 360, radius: 90 },
    { id: 'i2', x: 900, y: 210, radius: 70 },
    { id: 'i3', x: 960, y: 530, radius: 85 },
  ],
};

export function createConfig(options: GameOptions, seed = Date.now() >>> 0): GameConfig {
  const cfg = structuredClone(BASE_CONFIG); // snapshot: later option edits never affect a running match
  cfg.seed = seed;
  cfg.match.durationSec = options.durationSec;
  cfg.match.spawnIntervalSec = options.spawnIntervalSec;
  return cfg;
}