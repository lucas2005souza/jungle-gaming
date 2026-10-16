# Architecture

Back to the [README](README.md)

## 1. Overview

```
              React (menus, forms, dialogs, HUD text)
                    │  useSyncExternalStore  (only when a shown value changes)
                    ▼
   GameSession ── owns ──► Pixi Application + ticker
        │                         │ reads each frame
        ├──► Simulation ◄─────────┘          GameRenderer (pure view, pools)
        │    (rules, no DOM / Pixi / React / wall clock)
        └──► InputMux ◄── KeyboardInput, TouchControls

   Ranking / history:  React ─► TanStack Query ─► Axios ─► MSW (service worker)
   Match saving:       Simulation 'ended' ─► recorder (outside React) ─► Axios ─► MSW
```

Four rules shape the code:

1. **The simulation is pure.** `Simulation` knows nothing about PixiJS, React, the DOM or real time. Time only moves when someone calls `advance(dt)` or `step()`.
2. **Rendering reads, never writes.** `GameRenderer` copies positions and health from the simulation each frame and owns the display objects it creates.
3. **React does not re-render per frame.** Continuous state (positions, projectiles, cooldowns) stays inside the simulation.
4. **The API is optional for play.** Ranking, history and saving can fail without blocking the game, the options or a running match.

## 2. React ↔ PixiJS integration and lifecycle

`mountGameSession(host, config, textures)` creates the PixiJS `Application` asynchronously and returns `{ ready, dispose }`. `dispose()` is valid at **any** moment, including while `app.init()` is still running: if disposal arrives first, the freshly created application is destroyed and `ready` resolves to `null`. This is what makes React Strict Mode (mount → unmount → mount) safe.

`GameSession` owns everything with a lifetime: the simulation, the renderer, the ticker callback, the keyboard listeners, the `visibilitychange` and `blur` listeners, a `ResizeObserver` and the application. `destroy()` is idempotent and removes all of them. Textures belong to the shared PixiJS `Assets` cache, so destroying a session destroys display objects only and restarting a match reuses the loaded textures.

**UI sync.** `GameSession` exposes `subscribe` / `getSnapshot` for `useSyncExternalStore`. The snapshot object is replaced only when `status`, `score`, whole seconds left, rounded health or the end reason change, so the HUD updates about once per second and on events, never per frame.

**Texture loading** (`render/assets.ts`) loads a manifest of ship, effect and tile textures in parallel with progress reporting. Failures reject with `AssetLoadError` (listing the failed keys) before combat starts; the game screen shows the error with *Try again*, and a retry reuses what is already cached and loads the rest.

## 3. Simulation loop

- **Fixed timestep:** `FIXED_STEP = 1/60 s`. `advance(frameDt)` accumulates real time (clamped to 0.25 s) and runs at most 5 steps per frame; if the backlog exceeds that it is dropped (no spiral of death). Movement, damage, cooldowns and spawns all use the step, so they do not depend on the frame rate. A headless run at 60 and 144 FPS produced identical results for the same seed and inputs.
- **Pause:** `pause()` stops stepping and the renderer receives `dt = 0`, so animations freeze too. `resume()` discards the accumulator and the held input; nothing from the paused period is replayed. Cooldowns and the clock are untouched while paused.
- **Auto-pause:** window `blur`, `document.hidden` and portrait orientation on touch devices call `pause()`. Resuming is always a player action (button or key).
- **End of match:** `finish(reason)` sets `ended`, clears the input and clamps the elapsed time to the configured duration. After that `step()` is a no-op: no movement, damage, spawns or score.

## 4. Gameplay rules

**Coordinates and heading.** Heading `0` points up and grows clockwise, which equals PixiJS `rotation` for bow-up sprites, so the renderer copies it directly.

**Collisions.** Everything is a circle (ships, islands) or a swept segment (projectiles).
- Ships vs islands: after each move the ship is pushed out along the island normal, so it **slides** along the shore and can never end a step inside an island. The arena is a clamp on the ship's radius.
- Projectiles use a swept segment-vs-circle test against islands and ships, so fast shots cannot tunnel. A projectile is removed the moment it hits (damage is applied once), when it expires or when it leaves the arena.
- Chaser vs player: overlapping circles damage the player and the Chaser is removed (it explodes). This never scores.
- Enemies vs enemies: soft separation in the steering plus a hard positional push, so hulls do not stack.

**Combat.** Front weapon: one projectile. Broadside (left/right): three projectiles spaced along the hull with the same direction and speed (parallel). Each weapon has its own cooldown.

**Enemy behaviour.**
- *Chaser* steers toward the player (blended with ally separation) at its own speed and turn rate.
- *Shooter* approaches until `keepDistance` (280 px), then holds range, turns toward the player and fires only when the player is within `attackRange` (420 px) **and** the bow is aimed within a tolerance (0.2 rad), respecting its cooldown. A fresh Shooter must reload before its first shot.
- *Island avoidance:* when the straight route would graze an island, the enemy steers along the tangent. The side is chosen once and kept (`avoidSide`) until the way is clear, which avoids the flip-flop that made ships hug shores.

**Spawning.** A seeded PRNG (mulberry32) drives the spawn point and type. The first spawn is a Chaser and the second a Shooter, so both appear in a default match; afterwards types follow `spawnWeights`. A spawn point must be inside the margin, ≥ `spawnMinDistanceFromPlayer` (360 px) from the player, clear of islands and of other ships; after 30 failed attempts that tick is skipped rather than spawning unsafely. The number of live enemies is capped by `maxEnemies`.

**Scoring and end.** +1 per enemy destroyed by the player's shots. The match ends when the clock reaches the configured duration or the player's health reaches zero; active (unpaused) time is what counts.

## 5. Rendering

- **Layout:** the arena is a fixed logical 1280×720 world scaled by `min(w/1280, h/720)` and centred (letterbox). `ResizeObserver` drives the canvas size; the resolution is `min(devicePixelRatio, 2)` with `autoDensity`. `screenToWorld` converts pointer coordinates back to arena coordinates.
- **Scene:** water with scrolling wave strokes, islands built from tiling sand/grass masks plus rocks and plants, ships, projectiles, effects and floating health bars.
- **Damage:** the ship sheets have four damage stages per colour; the stage follows the remaining health (>75 %, >50 %, >25 %, below). From the third stage (50 % health or less) a flame sprite flickers on the hull.
- **Feedback:** muzzle flashes (front and per broadside projectile), hit and island-impact bursts, a three-frame explosion on destruction, a red flash and screen shake when the player is hit.
- **Allocation:** projectile sprites and effect sprites are pooled (effects capped at 96); ship views are created on first sight and destroyed when the ship leaves the simulation.

## 6. Input

`InputMux` merges sources (keyboard, touch) by OR-ing their `InputState` into the simulation, so movement and firing can overlap and a held keyboard key never fights a touch. `KeyboardInput` attaches only while a session exists, ignores Space and arrows when focus is inside a dialog or a form field (so buttons and inputs keep working), and ignores `P` while typing in a field. Touch buttons use pointer events with pointer capture; each button owns its pointer, so several can be held at once. The touch layout is shown only for coarse pointers.

## 7. Resource management

| Resource | Created | Released |
|---|---|---|
| PixiJS Application and canvas | `mountGameSession` | `GameSession.destroy()` |
| Ticker callback | `GameSession` constructor | `destroy()` |
| Keyboard, blur, visibility listeners | constructor | `destroy()` |
| `ResizeObserver` | constructor | `destroy()` |
| Display objects (ships, projectiles, effects, bars) | `GameRenderer` | `GameRenderer.destroy()` (`children: true`, textures kept) |
| Simulation listeners and arrays | `Simulation` | `Simulation.dispose()` |
| Textures | `Assets` cache | kept across matches (shared) |
| Test hook (`window.__pirateGame`) | `?e2e=1` only | removed on unmount |

An E2E test runs four start → quit cycles and checks that no canvas and no hook is left behind and that the console stays clean.

## 8. Local persistence

| Key (`localStorage`) | Content |
|---|---|
| `pirate-battle:options:v1` | Player options (validated on read; invalid data falls back to defaults) |
| `pirate-battle:last-result:v1` | Last completed match (id, score, time played, reason, config) |
| `pirate-battle:pending-matches:v1` | Finished matches not yet confirmed by the API |
| `pirate-battle:saved-match-ids:v1` | Ids already confirmed (last 50), to show the status after a refresh |
| `pirate-battle:mock-db:v1` | Matches confirmed by the mock API |
| `pirate-battle:mock-scenario:v1` | Selected network scenario |

All reads are defensive (blocked storage or corrupt JSON behave like "nothing saved"). An abandoned match writes nothing.

## 9. Ranking and match history

**Contracts** (`src/api/contracts.ts`): a `MatchRecord` holds `id` (client-generated UUID, also the idempotency key), `playerId`, `playerName`, `playedAt` (ISO), `score`, `durationSec` (effective play time), `reason` (`time_up` | `player_destroyed`) and `config` (`durationSec`, `spawnIntervalSec`). Lists use `Page<T>` (`items`, `page`, `pageSize`, `total`, `pageCount`; pages are 1-based on the wire).

| Endpoint | Behaviour |
|---|---|
| `GET /api/ranking?durationSec&spawnIntervalSec&page&pageSize` | Matches with the **same configuration**, ordered by score desc, then earlier `playedAt`, then `id` (a total, deterministic order); each entry carries its `rank` |
| `GET /api/matches?playerId&page&pageSize` | The player's matches, newest first |
| `POST /api/matches` | Stores a match; `201` when created, `200` with the stored record when the `id` already exists (idempotent) |

**Client.** One Axios instance (`baseURL /api`, 5 s timeout). TanStack Query keeps **one cache entry per list, configuration and page** (`['ranking', duration, spawn, page]`, `['history', player, page]`) with `keepPreviousData` for smooth paging, `staleTime: 0` (a tab shown again refetches in the background) and the request `AbortSignal`. A slow answer for an old page therefore lands in its own entry and can never overwrite what is on screen. Retries: up to 2, exponential delay (800 ms, 1.6 s, capped at 4 s), only for network errors, timeouts, 408, 429 and 5xx. The UI shows loading, empty, error (with *Try again*) and "updating…" states.

**Saving a match** lives in `api/recorder.ts`, deliberately outside React so it survives screen changes:
1. On `ended` the result is written to `last-result`, then `submitMatch(record)` queues it in `pending-matches` **before** the first request.
2. Status flow: `pending → saving → saved | failed`. One request per match at a time (`saving` guard), so repeated clicks cannot start parallel saves.
3. Up to 3 attempts with 0.6 s / 1.2 s backoff; on success the record leaves the pending queue, its id is remembered and both query families are invalidated, so the two tabs refresh.
4. On failure the record stays pending. `flushAll()` re-sends everything pending at app start, when the browser goes back online, and when the scenario changes (recovery). A pending record never blocks a new match.
5. Because the server is idempotent by `id`, a request that timed out *after* being stored is simply answered with the stored record on retry: **no duplicate** in history or ranking.

## 10. Mock API layer

- **MSW in the browser** (service worker `public/mockServiceWorker.js`) in dev, in the tests and in the published build. `startMocks()` runs before the first render so no request reaches the real network.
- **Shared by everything:** the same contracts, fixtures and handlers serve development, tests and the demo. Fixtures hold other captains (three configurations; the default has 12 matches, 3 pages of 5, with a deliberate score tie). The player's matches come only from `POST`.
- **Scenarios** wrap each response with a *plan* (delay + outcome: ok, network error, status, hang, or "store then hang"). Randomness uses a seeded generator reseeded on every scenario change; `?latency=` pins the latency for tests.
- **Self-healing guard:** every mocked response carries `x-mock-api`. If an `/api` response lacks it (a browser paused the service worker), an Axios interceptor re-activates the worker and repeats the request once.
- **Persistence:** confirmed matches and the scenario survive a refresh; *Reset mock data* clears them and the pending queue.

## 11. Testing

Playwright runs against the **optimized build** by default (`vite build` + `vite preview`), in Chromium desktop and mobile (landscape, touch, real multi-touch via CDP). The tests drive the real game with real keys and touches. `?e2e=1` adds a hook that observes state and moves the clock in exact fixed steps; `place()` only sets starting positions. With the manual clock the renderer also advances only with simulated time, so screenshots are reproducible. Pause and focus tests use the real clock (`?clock=real`). Every test gets a fresh browser context, and by default a test fails on any console error (disabled only where failures are provoked on purpose). Visual baselines (menu, arena, result) are versioned and generated on Linux, the same environment as the CI; they use a 3 % pixel tolerance for small rendering differences, and the visual tests are skipped on other operating systems because fonts differ too much (Windows and macOS).

**Performance** is measured separately (`npm run test:perf`, `playwright.perf.config.ts`, [`perf/`](perf)) so it never competes for CPU with the functional suite: one worker, no retries, no trace or video, always the optimized build on its own port. A probe records one `requestAnimationFrame` timestamp per frame into a pre-allocated typed array (no allocation per frame) and reads the entity counters through two cheap hook methods (`status()` and `counts()` in `testHooks.ts`, which copy nothing). The tests report FPS, the p95 time between frames and the entity count over a 3-minute match, and the JS heap, DOM nodes and event listeners after 5 match cycles (garbage collection forced through the Chrome DevTools Protocol, one cycle ending by death and the next by leaving through the pause menu, so both `destroy()` paths are covered). Method, thresholds and results: [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## 12. Balancing decisions

| Parameter | Value | Why |
|---|---|---|
| Player health / speed / turn | 100 / 190 px/s / 2.2 rad/s | A Chaser hit (25) is survivable, four are not |
| Front shot | 12 dmg, 0.28 s cooldown | A Chaser (30 hp) needs 3 hits, a Shooter (45 hp) 4: sustained fire is rewarded |
| Broadside | 3 × 8 dmg, 0.9 s cooldown | Strong burst, but the slow reload forces positioning |
| Chaser | 30 hp, 130 px/s, 25 contact damage | Slower than the player, so it can be outrun or shot |
| Shooter | 45 hp, 90 px/s, 8 dmg every 1.6 s, range 420 px | Projectiles are slower than the player's (380 vs 620 px/s) and can be dodged |
| Spawn | ≥ 360 px from the player, max 12 enemies | No unavoidable instant damage; the screen stays readable |

Defaults: 90 s sessions and a 2.5 s spawn interval. Every value above is in `BASE_CONFIG`, so tuning is a data change.

## Limitations and trade-offs

- **Sound** effects from `assets/sounds` are not wired in yet.
- **The "server" is simulated in the browser:** records are per browser and are not shared between devices. The ranking lists every finished match (not one best score per player).
- **Identity:** a single anonymous local player ("Captain Jack"); there are no accounts.
- **Pixel density** is read when a match starts; moving the window between monitors with different densities adjusts the size but not the density until the next match.
- **Touch layout** appears for coarse pointers; on hybrid laptops with a mouse the on-screen buttons are hidden (the keyboard works).
- **Phones in portrait** are not supported: the match pauses and asks for landscape.
- **Collisions are circles**: islands are round and ships are approximated by their radius, so very close shots at the bow or stern are forgiving.
- **Bundle size:** PixiJS makes the main chunk larger than 500 kB; code splitting was not needed for the targets.
- **WebGL** is required by PixiJS; there is no fallback screen when it is unavailable.
- **Profiling** results are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).