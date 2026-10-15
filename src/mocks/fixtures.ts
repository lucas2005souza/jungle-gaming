import type { EndReason, MatchConfig, MatchRecord } from '../api/contracts';
import { PLAYER_ID, PLAYER_NAME } from '../player';

/** Same as the game's default options, so a fresh install has a populated ranking. */
const DEFAULT_CFG: MatchConfig = { durationSec: 90, spawnIntervalSec: 2.5 };

type Row = [name: string, score: number, playedAt: string, reason: EndReason, durationSec: number];

const row = (id: string, cfg: MatchConfig, [name, score, playedAt, reason, durationSec]: Row): MatchRecord => ({
  id, playerId: `fx-${name.toLowerCase().replace(/\W+/g, '-')}`, playerName: name, playedAt, score, durationSec, reason, config: cfg,
});

const MAIN: Row[] = [
  ['Captain Flint', 38, '2026-09-08T21:42:00.000Z', 'time_up', 90],
  ['Red Sparrow', 32, '2026-09-08T20:18:00.000Z', 'time_up', 90],
  ['Storm Rider', 21, '2026-09-08T18:50:00.000Z', 'time_up', 90],
  ['Tide Walker', 21, '2026-09-07T22:10:00.000Z', 'time_up', 90], // ties Storm Rider: earlier match ranks higher
  ['Sea Wolf', 19, '2026-09-08T18:24:00.000Z', 'player_destroyed', 74],
  ['Black Anne', 17, '2026-09-07T20:01:00.000Z', 'time_up', 90],
  ['Iron Hook', 15, '2026-09-06T19:30:00.000Z', 'player_destroyed', 61],
  ['Salty Pete', 14, '2026-09-06T16:12:00.000Z', 'time_up', 90],
  ['Mad Morgan', 12, '2026-09-05T21:45:00.000Z', 'player_destroyed', 55],
  ['Jolly Rose', 11, '2026-09-05T18:09:00.000Z', 'time_up', 90],
  ['Barnacle Bill', 9, '2026-09-04T22:33:00.000Z', 'player_destroyed', 47],
  ['Dread Mary', 7, '2026-09-04T17:20:00.000Z', 'player_destroyed', 38],
];

const SHORT_CFG: MatchConfig = { durationSec: 60, spawnIntervalSec: 2 };
const SHORT: Row[] = [
  ['Captain Flint', 24, '2026-09-08T10:15:00.000Z', 'time_up', 60],
  ['Red Sparrow', 18, '2026-09-07T10:40:00.000Z', 'time_up', 60],
  ['Sea Wolf', 9, '2026-09-06T11:05:00.000Z', 'player_destroyed', 33],
];

const LONG_CFG: MatchConfig = { durationSec: 120, spawnIntervalSec: 3 };
const LONG: Row[] = [
  ['Captain Flint', 38, '2026-09-08T21:42:00.000Z', 'time_up', 120],
  ['Red Sparrow', 32, '2026-09-08T20:18:00.000Z', 'time_up', 120],
  ['Storm Rider', 21, '2026-09-08T18:50:00.000Z', 'time_up', 120],
  ['Sea Wolf', 19, '2026-09-08T18:24:00.000Z', 'time_up', 120],
];

/** Static fixtures: other captains only. The local player's matches come from POST /matches. */
export const FIXTURES: MatchRecord[] = [
  ...MAIN.map((r, i) => row(`fx-main-${i}`, DEFAULT_CFG, r)),
  ...SHORT.map((r, i) => row(`fx-short-${i}`, SHORT_CFG, r)),
  ...LONG.map((r, i) => row(`fx-long-${i}`, LONG_CFG, r)),
];

const FIRST = ['Salty', 'Iron', 'Mad', 'Dread', 'Jolly', 'Silver', 'Crimson', 'Lucky'];
const LAST = ['Pete', 'Hook', 'Morgan', 'Mary', 'Rose', 'Beard', 'Kate', 'Bill'];
const BASE_TIME = Date.UTC(2026, 8, 3, 12, 0, 0);
const HOUR = 3_600_000;

/** "Many pages" scenario: deterministic extra data (no randomness involved). */
export const EXTRA_FIXTURES: MatchRecord[] = [
  ...Array.from({ length: 40 }, (_, i): MatchRecord => {
    const name = `${FIRST[i % 8]} ${LAST[(i * 3 + 1) % 8]}`;
    const score = (i * 7) % 29 + 2;
    return {
      id: `fx-extra-${i}`, playerId: `fx-extra-player-${i}`, playerName: name, score, config: DEFAULT_CFG,
      playedAt: new Date(BASE_TIME - i * 5 * HOUR).toISOString(),
      reason: score % 3 === 0 ? 'player_destroyed' : 'time_up',
      durationSec: score % 3 === 0 ? 40 + (i % 40) : DEFAULT_CFG.durationSec,
    };
  }),
  ...Array.from({ length: 23 }, (_, i): MatchRecord => {
    const score = (i * 5) % 23 + 3;
    return {
      id: `fx-me-${i}`, playerId: PLAYER_ID, playerName: PLAYER_NAME, score, config: DEFAULT_CFG,
      playedAt: new Date(BASE_TIME - 2 * 24 * HOUR - i * 3 * HOUR).toISOString(),
      reason: i % 4 === 1 ? 'player_destroyed' : 'time_up',
      durationSec: i % 4 === 1 ? 35 + i : DEFAULT_CFG.durationSec,
    };
  }),
];
