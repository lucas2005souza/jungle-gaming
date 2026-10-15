import type { EndReason } from '../game/types';

export type { EndReason };

/** Gameplay options a match was played with. Ranking only compares equal configs. */
export interface MatchConfig {
  durationSec: number;
  spawnIntervalSec: number;
}

/** One finished match. `id` is client-generated and doubles as the idempotency key. */
export interface MatchRecord {
  id: string;
  playerId: string;
  playerName: string;
  /** ISO-8601 end time. */
  playedAt: string;
  score: number;
  /** Effective active play time in seconds. */
  durationSec: number;
  reason: EndReason;
  config: MatchConfig;
}

export interface RankingEntry extends MatchRecord {
  /** 1-based position over the whole (unpaginated) ranking. */
  rank: number;
}

/** Pages are 1-based on the wire. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export type RankingPage = Page<RankingEntry>;
export type HistoryPage = Page<MatchRecord>;

export interface RankingQuery extends MatchConfig {
  page: number;
  pageSize: number;
}

export interface HistoryQuery {
  playerId: string;
  page: number;
  pageSize: number;
}

/** POST /api/matches: 201 when created, 200 when the same id was already stored. */
export interface SaveMatchResponse {
  record: MatchRecord;
  created: boolean;
}
