import { DEFAULT_OPTIONS, validateOptions, type GameOptions } from '../game/config';
import type { MatchResult } from '../game/types';

const OPTIONS_KEY = 'pirate-battle:options:v1';
const LAST_RESULT_KEY = 'pirate-battle:last-result:v1';

export interface StoredMatchResult extends MatchResult {
  matchId: string;
  endedAt: string;
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function loadOptions(): GameOptions {
  const v = read(OPTIONS_KEY);
  if (isObj(v) && typeof v.durationSec === 'number' && typeof v.spawnIntervalSec === 'number') {
    const o: GameOptions = { durationSec: v.durationSec, spawnIntervalSec: v.spawnIntervalSec };
    if (Object.keys(validateOptions(o)).length === 0) return o;
  }
  return { ...DEFAULT_OPTIONS };
}

export const saveOptions = (o: GameOptions): boolean => write(OPTIONS_KEY, o);

export function parseStoredResult(v: unknown): StoredMatchResult | null {
  if (
    isObj(v) && typeof v.matchId === 'string' && typeof v.endedAt === 'string' &&
    typeof v.score === 'number' && typeof v.playedSec === 'number' &&
    (v.reason === 'time_up' || v.reason === 'player_destroyed') && isObj(v.config) &&
    typeof v.config.durationSec === 'number' && typeof v.config.spawnIntervalSec === 'number'
  ) {
    return v as unknown as StoredMatchResult;
  }
  return null;
}

export const loadLastResult = (): StoredMatchResult | null => parseStoredResult(read(LAST_RESULT_KEY));

export const saveLastResult = (r: StoredMatchResult): boolean => write(LAST_RESULT_KEY, r);

const LEGACY_HISTORY_KEY = 'pirate-battle:history:v1';
const LEGACY_MIGRATED_KEY = 'pirate-battle:legacy-migrated:v1';

export function loadLegacyHistory(): StoredMatchResult[] {
  const v = read(LEGACY_HISTORY_KEY);
  return Array.isArray(v) ? v.map(parseStoredResult).filter((r): r is StoredMatchResult => r !== null) : [];
}

export const isLegacyMigrated = (): boolean => read(LEGACY_MIGRATED_KEY) === true;

export function finishLegacyMigration(): void {
  write(LEGACY_MIGRATED_KEY, true);
  try {
    localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
