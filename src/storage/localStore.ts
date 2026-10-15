import { DEFAULT_OPTIONS, validateOptions, type GameOptions } from '../game/config';
import type { MatchResult } from '../game/types';

const OPTIONS_KEY = 'pirate-battle:options:v1';
const LAST_RESULT_KEY = 'pirate-battle:last-result:v1';

/** A finished match as persisted locally. `matchId` is the idempotency key for the future API record. */
export interface StoredMatchResult extends MatchResult {
  matchId: string;
  endedAt: string;
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // storage blocked or corrupted JSON: behave as "nothing saved"
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
