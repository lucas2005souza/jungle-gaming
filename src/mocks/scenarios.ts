export const SCENARIOS = [
  { id: 'success', label: 'Success', description: 'Everything works with a short latency.' },
  { id: 'empty', label: 'Empty lists', description: 'Ranking and history come back empty.' },
  { id: 'multi-page', label: 'Many pages', description: 'Adds extra fixtures so both lists span several pages.' },
  { id: 'slow', label: 'Slow network', description: 'Every response takes about 2.5 seconds.' },
  { id: 'variable-latency', label: 'Variable latency', description: 'Seeded random delays, so responses arrive out of order.' },
  { id: 'timeout', label: 'Timeout (all)', description: 'No request is ever answered; the client gives up after 5 s.' },
  { id: 'network-error', label: 'Connection failure', description: 'Every request fails like a dropped connection.' },
  { id: 'http-4xx', label: 'HTTP 4xx', description: 'Every request answers 403.' },
  { id: 'http-5xx', label: 'HTTP 5xx', description: 'Every request answers 500.' },
  { id: 'ranking-fails', label: 'Ranking fails', description: 'Only the ranking query answers 500.' },
  { id: 'history-fails', label: 'History fails', description: 'Only the history query answers 500.' },
  { id: 'save-timeout', label: 'Save times out', description: 'The match is stored, but the response never arrives. Retrying must not duplicate it.' },
  { id: 'save-unavailable', label: 'Save unavailable', description: 'Saving answers 503 until you switch back to Success.' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];
export type Route = 'ranking' | 'history' | 'save';

export type Outcome =
  | { kind: 'ok' }
  | { kind: 'network' }
  | { kind: 'status'; status: number }
  | { kind: 'hang' }
  | { kind: 'save-then-hang' };

export interface Plan {
  delayMs: number;
  outcome: Outcome;
}

const STORAGE_KEY = 'pirate-battle:mock-scenario:v1';
const RNG_SEED = 1234;
const BASE_LATENCY_MS = 150;

export const isScenarioId = (v: unknown): v is ScenarioId => SCENARIOS.some((s) => s.id === v);

/** mulberry32: reproducible randomness; reseeded whenever the scenario changes. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readUrl(name: string): string | null {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get(name);
  } catch {
    return null;
  }
}

function readInitial(): ScenarioId {
  const fromUrl = readUrl('scenario');
  if (isScenarioId(fromUrl)) return fromUrl;
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (isScenarioId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return 'success';
}

/** `?latency=0` forces a fixed latency (used by automated tests). */
const latencyParam = readUrl('latency');
const latencyOverride = latencyParam !== null && Number.isFinite(Number(latencyParam)) ? Math.max(0, Number(latencyParam)) : null;

let current: ScenarioId = readInitial();
let rng = makeRng(RNG_SEED);
const listeners = new Set<() => void>();

export const getScenario = (): ScenarioId => current;
export const subscribeScenario = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setScenario(id: ScenarioId): void {
  current = id;
  rng = makeRng(RNG_SEED);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function planFor(route: Route): Plan {
  const ok: Outcome = { kind: 'ok' };
  let plan: Plan;
  switch (current) {
    case 'slow':
      plan = { delayMs: 2500, outcome: ok };
      break;
    case 'variable-latency':
      plan = { delayMs: 100 + Math.floor(rng() * 2900), outcome: ok };
      break;
    case 'timeout':
      return { delayMs: 0, outcome: { kind: 'hang' } };
    case 'network-error':
      plan = { delayMs: 0, outcome: { kind: 'network' } };
      break;
    case 'http-4xx':
      plan = { delayMs: BASE_LATENCY_MS, outcome: { kind: 'status', status: 403 } };
      break;
    case 'http-5xx':
      plan = { delayMs: BASE_LATENCY_MS, outcome: { kind: 'status', status: 500 } };
      break;
    case 'ranking-fails':
      plan = { delayMs: BASE_LATENCY_MS, outcome: route === 'ranking' ? { kind: 'status', status: 500 } : ok };
      break;
    case 'history-fails':
      plan = { delayMs: BASE_LATENCY_MS, outcome: route === 'history' ? { kind: 'status', status: 500 } : ok };
      break;
    case 'save-timeout':
      if (route === 'save') return { delayMs: 0, outcome: { kind: 'save-then-hang' } };
      plan = { delayMs: BASE_LATENCY_MS, outcome: ok };
      break;
    case 'save-unavailable':
      plan = { delayMs: BASE_LATENCY_MS, outcome: route === 'save' ? { kind: 'status', status: 503 } : ok };
      break;
    default:
      plan = { delayMs: BASE_LATENCY_MS, outcome: ok };
  }
  if (latencyOverride !== null) plan.delayMs = latencyOverride;
  return plan;
}
