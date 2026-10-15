import { setupWorker, type StartOptions } from 'msw/browser';
import { http } from '../api/client';
import { installBypassGuard } from './bypassGuard';
import { changeScenario, resetMocks } from './control';
import { handlers } from './handlers';
import { getScenario } from './scenarios';
import { MOCK_HEADER } from './shared';

declare global {
  interface Window {
    /** Hook for automated tests and manual debugging. */
    __pirateMock?: {
      setScenario: typeof changeScenario;
      getScenario: typeof getScenario;
      reset: typeof resetMocks;
      reactivate: () => Promise<void>;
    };
  }
}

const START_OPTIONS: StartOptions = {
  onUnhandledFrame: 'bypass',
  quiet: true,
  serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
};
const STOP_TIMEOUT_MS = 2000;

let worker: ReturnType<typeof setupWorker> | undefined;
let healing: Promise<void> | null = null;
let probing: Promise<void> | null = null;

/**
 * Browsers pause idle service workers. The MSW worker keeps its list of active pages only in
 * memory, so after a pause it stops answering until the page re-activates it (a reload would).
 * stop() + start() performs that re-activation without reloading. Concurrent calls share one run.
 */
export function reactivateMocks(): Promise<void> {
  if (!worker) return Promise.resolve();
  const w = worker;
  healing ??= (async () => {
    try {
      await Promise.race([w.stop(), new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS))]);
      await w.start(START_OPTIONS);
    } catch (error) {
      console.warn('Could not re-activate the mock API', error);
    }
  })().finally(() => {
    healing = null;
  });
  return healing;
}

/** Cheap probe: if the health endpoint did not go through MSW, re-activate before the user notices. */
function checkMocksAlive(): Promise<void> {
  probing ??= (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/health`, { cache: 'no-store' });
      if (res.headers.has(MOCK_HEADER)) return;
    } catch {
      /* treat as not alive */
    }
    await reactivateMocks();
  })().finally(() => {
    probing = null;
  });
  return probing;
}

/** Starts the mock API. Runs in dev, tests and the published build alike. */
export async function startMocks(): Promise<void> {
  worker = setupWorker(...handlers);
  await worker.start(START_OPTIONS);
  installBypassGuard(http, reactivateMocks);

  // Coming back to the tab/window is when a paused worker is most likely to have lost its state.
  const probe = () => void checkMocksAlive();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && probe());
  window.addEventListener('focus', probe);
  window.addEventListener('pageshow', probe);
  window.addEventListener('online', probe);

  window.__pirateMock = { setScenario: changeScenario, getScenario, reset: resetMocks, reactivate: reactivateMocks };
}
