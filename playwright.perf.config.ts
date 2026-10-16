import { defineConfig, devices } from '@playwright/test';

/**
 * Performance configuration (npm run test:perf). Separate from the functional E2E suite on purpose:
 *  - always builds and serves the OPTIMIZED build on its own port (never the dev server, never a stale preview);
 *  - one worker, no parallelism, no retries: concurrent tests would steal CPU and distort the numbers;
 *  - no trace, video or screenshots while measuring: recording them costs frames;
 *  - uses the full Chromium (`channel: 'chromium'`, new headless mode) instead of the default headless shell,
 *    because the shell rasterizes WebGL in software and would measure the CPU, not the game. The report prints
 *    the WebGL renderer so this is verifiable;
 *  - PERF_HEADED=1 opens a visible window (keep it focused and uncovered while it runs);
 *  - E2E_BASE_URL=https://... measures an already deployed URL instead (no local server is started).
 */
const external = process.env.E2E_BASE_URL;
const port = 4174;
const baseURL = external ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './perf',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 10 * 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'perf-report' }]],
  // Playwright empties this folder at the start of every run, so the reports live in docs/reports/performance instead.
  outputDir: process.env.PERF_OUTPUT_DIR ?? 'test-results-perf',
  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'perf',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        channel: 'chromium',
        headless: !process.env.PERF_HEADED,
        launchOptions: {
          args: [
            // Use the GPU even if the driver is on Chromium's blocklist.
            '--ignore-gpu-blocklist',
            // Do not let Chromium throttle timers or frames if the window is covered by another one.
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            // Exact (not bucketed) performance.memory values.
            '--enable-precise-memory-info',
          ],
        },
      },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: `npm run build && npm run preview -- --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
