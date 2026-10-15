import { finishLegacyMigration, isLegacyMigrated, loadLegacyHistory, type StoredMatchResult } from '../storage/localStore';
import { PLAYER_ID, PLAYER_NAME } from '../player';
import { isRetryable, saveMatch } from './client';
import type { MatchRecord } from './contracts';
import { HISTORY_KEY, RANKING_KEY, queryClient } from './queryClient';

/**
 * Registers finished matches with the API, outside React so it survives screen changes.
 *  - Idempotent: the match id is the key; clicks/retries/refreshes never duplicate a record.
 *  - Durable: unsaved matches live in localStorage and are re-sent on the next start.
 *  - One request per match at a time ("saving" guard).
 */
export type RecordStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

const PENDING_KEY = 'pirate-battle:pending-matches:v1';
const SAVED_KEY = 'pirate-battle:saved-match-ids:v1';
const SAVED_LIMIT = 50;
const MAX_ATTEMPTS = 3;

interface Entry {
  record: MatchRecord;
  status: Exclude<RecordStatus, 'idle' | 'saved'>;
}

const entries = new Map<string, Entry>();
let savedIds: string[] = [];
let version = 0;
const listeners = new Set<() => void>();

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the in-memory state still works for this session */
  }
}

const isRecord = (v: unknown): v is MatchRecord =>
  typeof v === 'object' && v !== null && typeof (v as MatchRecord).id === 'string' && typeof (v as MatchRecord).score === 'number';

function load(): void {
  const pending = readJson(PENDING_KEY);
  if (Array.isArray(pending)) for (const r of pending) if (isRecord(r)) entries.set(r.id, { record: r, status: 'pending' });
  const saved = readJson(SAVED_KEY);
  if (Array.isArray(saved)) savedIds = saved.filter((s): s is string => typeof s === 'string');
}
load();

function persist(): void {
  writeJson(PENDING_KEY, [...entries.values()].map((e) => e.record));
  writeJson(SAVED_KEY, savedIds);
}

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getVersion = (): number => version;

export function statusOf(matchId: string): RecordStatus {
  const e = entries.get(matchId);
  if (e) return e.status;
  return savedIds.includes(matchId) ? 'saved' : 'idle';
}

export function toMatchRecord(r: StoredMatchResult): MatchRecord {
  return {
    id: r.matchId,
    playerId: PLAYER_ID,
    playerName: PLAYER_NAME,
    playedAt: r.endedAt,
    score: r.score,
    durationSec: r.playedSec,
    reason: r.reason,
    config: { durationSec: r.config.durationSec, spawnIntervalSec: r.config.spawnIntervalSec },
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function markSaved(id: string): void {
  entries.delete(id);
  savedIds = [id, ...savedIds.filter((s) => s !== id)].slice(0, SAVED_LIMIT);
  persist();
  emit();
  void queryClient.invalidateQueries({ queryKey: [RANKING_KEY] });
  void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] });
}

async function flush(id: string): Promise<void> {
  const entry = entries.get(id);
  if (!entry || entry.status === 'saving') return;
  entry.status = 'saving';
  emit();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await saveMatch(entry.record);
      markSaved(id);
      return;
    } catch (error) {
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) break;
      await sleep(600 * 2 ** attempt);
    }
  }
  entry.status = 'failed'; // stays stored; retried by retry(), flushAll() or the next app start
  emit();
}

/** Queue + send. Calling it again for the same match is a no-op while saving, a retry after a failure. */
export function submitMatch(record: MatchRecord): void {
  if (savedIds.includes(record.id)) return;
  if (!entries.has(record.id)) {
    entries.set(record.id, { record, status: 'pending' });
    persist();
    emit();
  }
  void flush(record.id);
}

/** Re-sends everything not yet confirmed: app start, back online, scenario recovery. */
export function flushAll(): void {
  for (const [id, e] of entries) if (e.status !== 'saving') void flush(id);
}

/**
 * One-time import of matches saved by the old local-only history, so nothing a player already
 * won gets lost. Safe to interrupt: submitMatch() persists each match before the old data is dropped,
 * and the server ignores repeated ids.
 */
export function migrateLegacyMatches(): void {
  if (isLegacyMigrated()) return;
  for (const r of loadLegacyHistory()) submitMatch(toMatchRecord(r));
  finishLegacyMigration();
}

export function resetRecorder(): void {
  entries.clear();
  savedIds = [];
  persist();
  emit();
}

if (typeof window !== 'undefined') window.addEventListener('online', flushAll);
