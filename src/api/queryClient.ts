import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, refetchOnWindowFocus: true } },
});

/** Query-key prefixes, shared so invalidation never drifts from the hooks. */
export const RANKING_KEY = 'ranking';
export const HISTORY_KEY = 'history';
