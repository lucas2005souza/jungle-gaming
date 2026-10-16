import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration.
 *  - Default: builds the app and tests the optimized `vite preview` build (same artifact as the deploy).
 *  - E2E_DEV=1: tests the dev server instead (faster feedback while writing tests).
 *  - E2E_BASE_URL=https://...: tests an already running / deployed URL (no local server is started).
 */
const useDev = Boolean(process.env.E2E_DEV);
const port = useDev ? 5173 : 4173;
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  // Every test gets a fresh browser context: empty localStorage, no service worker, no cache.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 4,
  // CI runners (2 shared vCPUs) are ~2x slower than a dev machine: the longest tests sit right at 45 s there.
  timeout: process.env.CI ? 90_000 : 45_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.03, animations: 'disabled' },
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // Point E2E_OUTPUT_DIR outside a synced folder (e.g. OneDrive) to avoid EBUSY errors on Windows.
  outputDir: process.env.E2E_OUTPUT_DIR ?? 'test-results',
  // One baseline per project, shared across operating systems (fonts differ a little: see the tolerance above).
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
      testIgnore: /\.mobile\.spec\.ts$/,
    },
    {
      name: 'mobile',
      // Pixel 7 in landscape: the supported mobile orientation.
      use: { ...devices['Pixel 7'], viewport: { width: 851, height: 393 } },
      testIgnore: /visual\.spec\.ts$/,
    },
  ],
  webServer: external
    ? undefined
    : {
        command: useDev
          ? 'npm run dev -- --port 5173 --strictPort'
          : 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});