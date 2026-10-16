import { setupWorker, type StartOptions } from 'msw/browser';
import { http } from '../api/client';
import { installBypassGuard } from './bypassGuard';
import { changeScenario, resetMocks } from './control';
import { handlers } from './handlers';
import { getScenario } from './scenarios';
import { MOCK_HEADER } from './shared';

declare global {
  interface Window {
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

function checkMocksAlive(): Promise<void> {
  probing ??= (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/health`, { cache: 'no-store' });
      if (res.headers.has(MOCK_HEADER)) return;
    } catch {
    }
    await reactivateMocks();
  })().finally(() => {
    probing = null;
  });
  return probing;
}

export async function startMocks(): Promise<void> {
  worker = setupWorker(...handlers);
  await worker.start(START_OPTIONS);
  installBypassGuard(http, reactivateMocks);

  const probe = () => void checkMocksAlive();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && probe());
  window.addEventListener('focus', probe);
  window.addEventListener('pageshow', probe);
  window.addEventListener('online', probe);

  window.__pirateMock = { setScenario: changeScenario, getScenario, reset: resetMocks, reactivate: reactivateMocks };
}
