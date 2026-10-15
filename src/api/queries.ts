import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { GameOptions } from '../game/config';
import { PLAYER_ID } from '../player';
import { fetchHistory, fetchRanking, isRetryable } from './client';
import { HISTORY_KEY, RANKING_KEY } from './queryClient';

export const PAGE_SIZE = 5;

const retry = (failureCount: number, error: unknown) => failureCount < 2 && isRetryable(error);
const retryDelay = (attempt: number) => Math.min(800 * 2 ** attempt, 4000);

/**
 * `page` is zero-based here. Each page is its own cache entry, so a slow answer for an old
 * page can never replace the data of the page being shown; `signal` also cancels it in flight.
 */
export function useRanking(options: GameOptions, page: number, enabled: boolean) {
  return useQuery({
    queryKey: [RANKING_KEY, options.durationSec, options.spawnIntervalSec, page],
    queryFn: ({ signal }) =>
      fetchRanking(
        { page: page + 1, pageSize: PAGE_SIZE, durationSec: options.durationSec, spawnIntervalSec: options.spawnIntervalSec },
        signal,
      ),
    enabled,
    placeholderData: keepPreviousData,
    retry,
    retryDelay,
  });
}

export function useHistory(page: number, enabled: boolean) {
  return useQuery({
    queryKey: [HISTORY_KEY, PLAYER_ID, page],
    queryFn: ({ signal }) => fetchHistory({ playerId: PLAYER_ID, page: page + 1, pageSize: PAGE_SIZE }, signal),
    enabled,
    placeholderData: keepPreviousData,
    retry,
    retryDelay,
  });
}
