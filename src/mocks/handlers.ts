import { HttpResponse, delay, http, type JsonBodyType } from 'msw';
import type { MatchRecord } from '../api/contracts';
import { insertRecord, queryHistory, queryRanking } from './db';
import { planFor, type Route } from './scenarios';
import { MOCK_HEADER } from './shared';

/** JSON response tagged as coming from the mock layer (see MOCK_HEADER). */
const json = (body: JsonBodyType, status = 200): Response => HttpResponse.json(body, { status, headers: { [MOCK_HEADER]: 'msw' } });

/** Applies the active scenario (latency, failure, hang) around the real response. */
async function respond(route: Route, ok: () => Response, saveEffect?: () => void): Promise<Response> {
  const { delayMs, outcome } = planFor(route);
  if (outcome.kind === 'hang') {
    await delay('infinite');
    return ok();
  }
  if (delayMs > 0) await delay(delayMs);
  switch (outcome.kind) {
    case 'network':
      return HttpResponse.error();
    case 'status':
      return json({ message: `Mocked failure (${outcome.status})` }, outcome.status);
    case 'save-then-hang':
      saveEffect?.(); // the "server" did store it, only the answer is lost
      await delay('infinite');
      return ok();
    default:
      return ok();
  }
}

const int = (v: string | null, fallback: number): number => {
  const n = Number(v);
  return Number.isInteger(n) ? n : fallback;
};

function parseRecord(body: unknown): MatchRecord | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const c = b.config as Record<string, unknown> | undefined;
  const validDate = typeof b.playedAt === 'string' && !Number.isNaN(Date.parse(b.playedAt));
  if (
    typeof b.id !== 'string' || b.id.length < 4 || b.id.length > 64 ||
    typeof b.playerId !== 'string' || typeof b.playerName !== 'string' || !validDate ||
    typeof b.score !== 'number' || !Number.isInteger(b.score) || b.score < 0 || b.score > 9999 ||
    typeof b.durationSec !== 'number' || b.durationSec < 0 || b.durationSec > 600 ||
    (b.reason !== 'time_up' && b.reason !== 'player_destroyed') ||
    !c || typeof c.durationSec !== 'number' || typeof c.spawnIntervalSec !== 'number'
  ) return null;
  return b as unknown as MatchRecord;
}

// '*/api/...' also matches when the app is served from a sub-path.
export const handlers = [
  // Not affected by scenarios: used to detect that the mock layer is alive.
  http.get('*/api/health', () => json({ ok: true })),

  http.get('*/api/ranking', ({ request }) => {
    const q = new URL(request.url).searchParams;
    const durationSec = Number(q.get('durationSec'));
    const spawnIntervalSec = Number(q.get('spawnIntervalSec'));
    if (!Number.isFinite(durationSec) || !Number.isFinite(spawnIntervalSec)) {
      return json({ message: 'durationSec and spawnIntervalSec are required' }, 400);
    }
    const pageSize = Math.min(Math.max(int(q.get('pageSize'), 5), 1), 50);
    return respond('ranking', () => json(queryRanking({ durationSec, spawnIntervalSec }, int(q.get('page'), 1), pageSize)));
  }),

  http.get('*/api/matches', ({ request }) => {
    const q = new URL(request.url).searchParams;
    const playerId = q.get('playerId');
    if (!playerId) return json({ message: 'playerId is required' }, 400);
    const pageSize = Math.min(Math.max(int(q.get('pageSize'), 5), 1), 50);
    return respond('history', () => json(queryHistory(playerId, int(q.get('page'), 1), pageSize)));
  }),

  http.post('*/api/matches', async ({ request }) => {
    const record = parseRecord(await request.json().catch(() => null));
    if (!record) return json({ message: 'Invalid match record' }, 422);
    return respond(
      'save',
      () => {
        const { record: stored, created } = insertRecord(record);
        return json({ record: stored, created }, created ? 201 : 200);
      },
      () => { insertRecord(record); },
    );
  }),
];
