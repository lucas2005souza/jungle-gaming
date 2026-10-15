import axios, { isAxiosError } from 'axios';
import type { HistoryPage, HistoryQuery, MatchRecord, RankingPage, RankingQuery, SaveMatchResponse } from './contracts';

export const REQUEST_TIMEOUT_MS = 5000;

export const http = axios.create({
  baseURL: '/api',
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

export async function fetchRanking(query: RankingQuery, signal?: AbortSignal): Promise<RankingPage> {
  const { data } = await http.get<RankingPage>('/ranking', { params: query, signal });
  return data;
}

export async function fetchHistory(query: HistoryQuery, signal?: AbortSignal): Promise<HistoryPage> {
  const { data } = await http.get<HistoryPage>('/matches', { params: query, signal });
  return data;
}

/** Safe to repeat: the server answers with the stored record when `record.id` already exists. */
export async function saveMatch(record: MatchRecord): Promise<SaveMatchResponse> {
  const { data } = await http.post<SaveMatchResponse>('/matches', record);
  return data;
}

/** Timeouts, dropped connections, 5xx, 408 and 429 are worth retrying; other 4xx are not. */
export function isRetryable(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === undefined) return error.code !== 'ERR_CANCELED';
  return status >= 500 || status === 408 || status === 429;
}

export function describeError(error: unknown): string {
  if (!isAxiosError(error)) return 'Something went wrong.';
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'The request timed out.';
  if (!error.response) return 'Could not reach the server.';
  return `The server answered with an error (${error.response.status}).`;
}
