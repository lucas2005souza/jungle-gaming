import type { HistoryPage, MatchConfig, MatchRecord, Page, RankingPage } from '../api/contracts';
import { EXTRA_FIXTURES, FIXTURES } from './fixtures';
import { getScenario } from './scenarios';


const DB_KEY = 'pirate-battle:mock-db:v1';

const isStored = (v: unknown): v is MatchRecord =>
  typeof v === 'object' && v !== null && typeof (v as MatchRecord).id === 'string' && typeof (v as MatchRecord).playedAt === 'string';

function loadStored(): MatchRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(DB_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isStored) : [];
  } catch {
    return [];
  }
}

function saveStored(list: MatchRecord[]): void {
  try {
    globalThis.localStorage?.setItem(DB_KEY, JSON.stringify(list));
  } catch {
  }
}

export function resetDb(): void {
  try {
    globalThis.localStorage?.removeItem(DB_KEY);
  } catch {
  }
}

export function insertRecord(record: MatchRecord): { record: MatchRecord; created: boolean } {
  const stored = loadStored();
  const existing = stored.find((r) => r.id === record.id);
  if (existing) return { record: existing, created: false };
  saveStored([...stored, record]);
  return { record, created: true };
}

function allRecords(): MatchRecord[] {
  const scenario = getScenario();
  if (scenario === 'empty') return [];
  const extra = scenario === 'multi-page' ? EXTRA_FIXTURES : [];
  return [...FIXTURES, ...extra, ...loadStored()];
}

function paginate<T>(list: T[], page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return { items: list.slice(start, start + pageSize), page: safePage, pageSize, total: list.length, pageCount };
}

/** Score desc, then the earlier match (who got there first), then id: a total, stable order. */
const byRanking = (a: MatchRecord, b: MatchRecord): number =>
  b.score - a.score || a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id);

export function queryRanking(cfg: MatchConfig, page: number, pageSize: number): RankingPage {
  const sorted = allRecords()
    .filter((r) => r.config.durationSec === cfg.durationSec && r.config.spawnIntervalSec === cfg.spawnIntervalSec)
    .sort(byRanking)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return paginate(sorted, page, pageSize);
}

export function queryHistory(playerId: string, page: number, pageSize: number): HistoryPage {
  const mine = allRecords()
    .filter((r) => r.playerId === playerId)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || a.id.localeCompare(b.id));
  return paginate(mine, page, pageSize);
}
