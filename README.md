# Pirate Battle

A 2D top-down naval shooter built with **React**, **TypeScript** and **PixiJS**. Sail between islands, fight Chaser and Shooter ships and score as many points as you can before the clock runs out or your hull is destroyed.

- **Live demo:** https://SEU-PROJETO.vercel.app
- **Architecture notes:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Test and performance reports:** [docs/reports](docs/reports) and [docs/PERFORMANCE.md](docs/PERFORMANCE.md)

## Stack

| Responsibility | Technology |
|---|---|
| Menus and UI | React 19 |
| Language | TypeScript (strict mode) |
| Game rendering | PixiJS 8 |
| Remote state (ranking, history) | TanStack Query 5 |
| HTTP client | Axios |
| API mocking | MSW 3 (service worker) |
| E2E and visual regression | Playwright (Chromium, desktop and mobile) |
| Build / lint | Vite 8 / Oxlint |

## Setup

Requirements: **Node.js 20.19+ or 22.12+** and npm.

```bash
git clone <repository-url>
cd jungle-game
npm ci
npx playwright install chromium   # only needed to run the E2E tests
npm run dev                       # http://localhost:5173
```

No private services are required: the ranking and history API is simulated in the browser by MSW, also in the published build.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-checks (`tsc -b`) and creates the optimized build in `dist/` |
| `npm run preview` | Serves the optimized build at http://localhost:4173 |
| `npm run lint` | Oxlint |
| `npm run typecheck` | `tsc -b` (strict) for the app |
| `npm run typecheck:e2e` | Type-checks the Playwright tests |
| `npm run test:e2e` | Whole E2E suite (desktop + mobile), against the optimized build |
| `npm run test:e2e:desktop` / `test:e2e:mobile` | One Playwright project only |
| `npm run test:e2e:update` | Creates or refreshes the visual baselines (desktop) |
| `npm run test:e2e:report` | Opens the last HTML report |
| `npm run typecheck:perf` | Type-checks the performance tests |
| `npm run test:perf` | Performance and profiling: 3-minute FPS / p95 frame time / entities session and memory after 5 game cycles (optimized build, real clock) |
| `npm run test:perf:report` | Opens the last performance HTML report |

## Environment variables

The app needs **none** to build or run. Optional switches:

| Variable | Used by | Meaning |
|---|---|---|
| `E2E_DEV=1` | Playwright | Test the dev server (`:5173`) instead of building and previewing |
| `E2E_BASE_URL=https://...` | Playwright | Test an already running or deployed URL (no local server is started) |
| `CI=1` | Playwright | 2 workers, 1 retry, `forbidOnly` |
| `PERF_MIN_FPS` | `test:perf` | Minimum average FPS (default 55) |
| `PERF_MAX_P95_MS` | `test:perf` | Maximum p95 time between frames in ms (default 20) |
| `PERF_MAX_HEAP_GROWTH_MB` | `test:perf` | Maximum JS heap growth between cycle 1 and 5 (default 5) |
| `PERF_MAX_LISTENER_GROWTH` / `PERF_MAX_NODE_GROWTH` | `test:perf` | Maximum growth of event listeners (default 5) / DOM nodes (default 100) |

Runtime query-string parameters (they work in dev, preview and the published build):

| Parameter | Meaning |
|---|---|
| `?scenario=<id>` | Start with a network scenario (see below) |
| `?latency=<ms>` | Fixed mock latency, used by the tests (scenarios with their own timing are overridden) |
| `?e2e=1` | Test hook: fixed seed support and a manual simulation clock. Off in normal play |
| `?clock=real` | With `e2e=1`: keep the real clock (pause tests) |
| `?seed=<n>` | With `e2e=1`: seed for the enemy spawn RNG |

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Sail forward | `W` / `↑` | ▲ |
| Rotate left / right | `A` `D` / `←` `→` | ◄ ► |
| Fire front (1 projectile) | `Space` | ● |
| Broadside left / right (3 parallel projectiles) | `Q` / `E` | ◄● / ●► |
| Pause / resume | `P` / `Esc` | Pause button |

You can sail, rotate and fire at the same time (multi-touch on phones). Touch controls appear on touch devices. **Phones: play in landscape**; in portrait the match pauses and asks you to rotate. The match also pauses when the window loses focus or the tab is hidden; resuming always needs a player action.

## Gameplay configuration

All balance values live in **one typed object**, `BASE_CONFIG` in [`src/game/config.ts`](src/game/config.ts): arena size, islands, ship stats (health, speed, turn rate, collision radius), every weapon (damage, projectile speed and lifetime, cooldown), Shooter range, spawn distance and weights, and the maximum number of enemies. Systems read from it, so balance changes never require touching the rules.

The player edits two values in **Options** (validated, saved in `localStorage`, kept after a refresh):

| Option | Limits | Default |
|---|---|---|
| Game session time | 60 – 180 s (step 5) | 90 s |
| Enemy spawn time | 0.5 – 10 s (step 0.5) | 2.5 s |

Each match runs on a **snapshot** of the options taken when it starts; changing them (also from the pause menu) only affects the next match.

## Network scenarios (mock API)

The ranking and match history use a REST API (`GET /api/ranking`, `GET /api/matches`, `POST /api/matches`) simulated by MSW. Confirmed matches and pending saves persist in `localStorage`.

**Pick a scenario:** open the **"Network scenario"** panel (available on every screen except during a match), or start the app with `?scenario=<id>`. **Restore the initial state:** the **"Reset mock data"** button (clears stored matches and the pending queue and selects *Success*). Console API: `window.__pirateMock.setScenario('<id>')`, `.getScenario()`, `.reset()`.

| Id | Reproduces |
|---|---|
| `success` | Everything works (150 ms latency) |
| `empty` | Empty ranking and history |
| `multi-page` | Many pages in both lists |
| `slow` | Every response takes ~2.5 s |
| `variable-latency` | Seeded random latency (100 – 3000 ms) |
| `out-of-order` | Alternate responses take 2 s, so older ones arrive after newer ones |
| `timeout` | Requests never answer (client gives up after 5 s) |
| `network-error` | Dropped connection |
| `http-4xx` | Every request answers 403 |
| `http-5xx` | Every request answers 500 |
| `ranking-fails` / `history-fails` | Only that query answers 500 |
| `save-timeout` | The match is stored, but the answer never arrives (retry must not duplicate it) |
| `save-unavailable` | Saving answers 503 until you switch back to `success` |

**Reproduce "unavailable at the end of the match":** choose `save-unavailable`, finish a match: the result screen shows *Not saved yet*. Start another match (it is never blocked), then switch to `success`: the pending record is sent once and appears in both tabs. Refreshing with a pending record also re-sends it on start.

## Tests

```bash
npx playwright install chromium
npm run test:e2e            # builds, serves the optimized build, runs desktop + mobile
npm run test:e2e:report     # HTML report; failed tests keep a trace in test-results/
```

77 tests run on desktop (Chromium 1280×720) and 81 on mobile (Pixel 7, landscape, real multi-touch through CDP). They cover options, asset loading and failure, movement, rotation, arena limits and islands, front and broadside shots, damage, cooldowns, score, Chaser and Shooter behaviour, spawn interval, end by time and by death, clean restart, pause and focus loss, result persistence, abandoning a match, ranking and history (pagination, loading, empty, error), saving, pending records, timeouts without duplication and late responses. Three visual baselines (menu, arena, result) are versioned in `e2e/__screenshots__`.

Tests press real keys and touch real buttons. A small hook (`?e2e=1`, [`src/game/testHooks.ts`](src/game/testHooks.ts)) only **observes state and drives the clock** in exact fixed steps, so rules, input, collisions and rendering run unchanged. Each test starts from an isolated browser context (empty storage). Reference the baselines with `npm run test:e2e:update` after an intentional visual change.

### Performance

```bash
npm run test:perf     # builds, serves the optimized build on :4174, runs one 3-minute session and 5 game cycles
```

Measures FPS, the 95th percentile of the time between frames and the number of entities over a full 3-minute match (worst-case configuration: 180 s, an enemy every 0.5 s), and the JS heap, DOM nodes and event listeners after 5 consecutive matches, with garbage collection forced before each reading. Method, thresholds, results and manual profiling steps: [docs/PERFORMANCE.md](docs/PERFORMANCE.md). Raw reports: [docs/reports/performance](docs/reports/performance).

## Project structure

```
src/
  game/          pure rules (Simulation, config, math, types) + GameSession, input/, render/
  api/           contracts, Axios client, TanStack Query hooks, match recorder
  mocks/         MSW handlers, fixtures, scenarios, local "database", self-healing guard
  storage/       typed localStorage access (options, last result)
  ui/            React screens (menu, options, game, result, log), dialogs, touch controls
public/          assets (ships, tiles, UI, effects), mockServiceWorker.js
e2e/             Playwright tests, helpers and visual baselines
perf/            Performance tests (3-minute session, memory cycles), probe and statistics helpers
docs/            PERFORMANCE.md and generated reports
```

## Deployment

The app is a static site (Vite build), so it needs no server. It is deployed on **Vercel**:

1. Push the repository to GitHub.
2. In Vercel choose **Add New → Project** and import the repository.
3. Keep the detected settings: preset **Vite**, build command `npm run build`, output directory `dist`, no environment variables.
4. Use **Node.js 22.x** (Settings → General → Node.js Version).
5. Click **Deploy**. Every push to `main` publishes a new production build; other branches and pull requests get preview URLs.

The ranking and history API is simulated by MSW (service worker `public/mockServiceWorker.js`), which also runs in the published build, so no backend is required. To run the E2E suite against the deployed site:

```bash
E2E_BASE_URL=https://SEU-PROJETO.vercel.app npm run test:e2e
```

## Assets and licenses

All art (ships, tiles, effects, UI sprites, logo) comes from the challenge's `assets/` folder and is used as provided: no conversion and no extra resources were added. The pack ships no license file, so check its terms with the challenge owner before reusing it elsewhere. The sound files in `assets/sounds/` are not used yet (see limitations). Code dependencies and their licenses are those listed in `package.json`.

## Known limitations

See [ARCHITECTURE.md](ARCHITECTURE.md#limitations-and-trade-offs).