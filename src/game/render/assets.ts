import { Assets, type Texture } from 'pixi.js';

const BASE = import.meta.env.BASE_URL;
const DEFAULT_DIR = `${BASE}assets/png/default`;
const RETINA_DIR = `${BASE}assets/png/retina`;

/** Ship sprite sheets: 24 ships = 4 damage stages x 6 colours (1-6 intact ... 19-24 wrecked). */
export const SHIP_COLORS = { white: 0, black: 1, red: 2, green: 3, blue: 4, yellow: 5 } as const;
export const DAMAGE_STAGES = 4;
export const shipTextureKey = (color: number, stage: number) => `ship_${stage * 6 + color + 1}`;

/** key -> URL. Single source of truth for everything the match needs before it can start. */
const MANIFEST: Record<string, string> = {};
for (let n = 1; n <= 24; n++) MANIFEST[`ship_${n}`] = `${DEFAULT_DIR}/ships/ship_${n}.png`;
MANIFEST.cannon_ball = `${DEFAULT_DIR}/ship_parts/cannon_ball.png`;
for (const n of [1, 2, 3]) MANIFEST[`explosion_${n}`] = `${DEFAULT_DIR}/effects/explosion_${n}.png`;
for (const n of [1, 2]) MANIFEST[`fire_${n}`] = `${DEFAULT_DIR}/effects/fire_${n}.png`;
// Tiles are 2x in the retina folder (128px); renderer scales them by 0.5.
for (const n of [4, 39, 49, 50, 51, 70, 71, 72]) MANIFEST[`tile_${n}`] = `${RETINA_DIR}/tiles/tile_${n}.png`;

export class AssetLoadError extends Error {
  readonly failed: string[];
  constructor(failed: string[]) {
    super(`Failed to load ${failed.length} asset(s): ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '...' : ''}`);
    this.name = 'AssetLoadError';
    this.failed = failed;
  }
}

export class GameTextures {
  private readonly map: Map<string, Texture>;
  constructor(map: Map<string, Texture>) {
    this.map = map;
  }
  get(key: string): Texture {
    const t = this.map.get(key);
    if (!t) throw new Error(`Missing texture "${key}"`);
    return t;
  }
}

/**
 * Loads every texture once (PixiJS Assets caches successes, so restarts/retries reuse them).
 * Rejects with AssetLoadError listing what failed; calling again retries only what is missing.
 */
export async function loadGameTextures(onProgress?: (ratio: number) => void): Promise<GameTextures> {
  const keys = Object.keys(MANIFEST);
  const textures = new Map<string, Texture>();
  const failed: string[] = [];
  let done = 0;
  await Promise.all(
    keys.map(async key => {
      try {
        textures.set(key, await Assets.load<Texture>(MANIFEST[key]));
      } catch {
        failed.push(key);
      } finally {
        done++;
        onProgress?.(done / keys.length);
      }
    }),
  );
  if (failed.length > 0) throw new AssetLoadError(failed);
  return new GameTextures(textures);
}