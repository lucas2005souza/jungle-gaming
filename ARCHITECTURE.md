# Architecture

This document describes the current implementation of **Pirate Battle**,
a React + TypeScript + PixiJS top-down naval shooter.

## Design overview

The application is split into four main areas:

1.  **React UI** --- menus, settings, match HUD, dialogs, results,
    ranking, and history.
2.  **Game runtime** --- the deterministic gameplay simulation, PixiJS
    renderer, input adapters, and match lifecycle.
3.  **API/data layer** --- typed request contracts, Axios client, React
    Query hooks, and a durable match-recording queue.
4.  **Mock service layer** --- MSW handlers and fixtures that simulate
    the `/api` endpoints in the browser.

The API is currently mocked in the browser. There is no production
backend implementation in the supplied source.

## Runtime flow

``` mermaid
flowchart TD
    A[main.tsx] --> B[Start MSW browser worker]
    B --> C[Render React providers and App]
    C --> D[App screen state]
    D --> E[Main menu / Options / Ranking & History]
    D --> F[GameScreen]
    F --> G[Load PixiJS textures]
    G --> H[Mount GameSession]
    H --> I[Simulation]
    H --> J[GameRenderer]
    H --> K[KeyboardInput + TouchControls]
    I --> L[Match result]
    L --> M[localStorage result]
    L --> N[Match recorder queue]
    N --> O[Axios /api/matches]
    O --> P[MSW handlers]
    P --> Q[Mock database in localStorage + fixtures]
    Q --> R[Ranking / history queries]
```

At startup, `main.tsx` waits for MSW to start before rendering React.
This ordering is intentional: it prevents initial `/api` requests from
bypassing the mock layer and reaching a nonexistent real API. After
rendering, legacy local-only match history is migrated and pending
records are flushed.

## UI and navigation

-   `src/App.tsx` owns the top-level screen state: menu, options,
    ranking/history, active game, and result.
-   `src/ui/screens/MainMenu.tsx` presents Play, Options, Ranking, Match
    History, controls, and the last result shortcut.
-   `src/ui/screens/OptionsScreen.tsx` delegates settings to
    `OptionsForm`.
-   `src/ui/screens/GameScreen.tsx` loads textures, mounts a match
    session, and presents the HUD and pause overlay.
-   `src/ui/screens/ResultScreen.tsx` displays the outcome and recording
    status, and lets the player retry a failed save.
-   `src/ui/screens/LogScreen.tsx` presents paginated ranking and match
    history.
-   `src/ui/TouchControls.tsx` sends pointer-held controls into the same
    input pipeline as the keyboard.

The game screen is responsible for creating and destroying a match.
Leaving the screen disposes the session and its listeners/resources.

## Game runtime

### Configuration and domain types

-   `src/game/config.ts` contains typed ship and weapon stats, arena
    dimensions, islands, enemy spawning parameters, and user-editable
    options.
-   `src/game/types.ts` defines ships, projectiles, input state, match
    status, result types, and gameplay events.
-   `src/game/math.ts` contains reusable math helpers.

Gameplay options are validated centrally before they are persisted or
used to create a game configuration.

### Simulation

`src/game/Simulation.ts` is the gameplay rules layer. It is kept
separate from rendering so gameplay can be advanced independently of
PixiJS frames.

Responsibilities include:

-   Player movement and turning.
-   Enemy movement/steering and enemy spawning.
-   Weapon cooldowns and projectile movement.
-   Collision resolution, damage, and destruction.
-   Score and match-time updates.
-   End conditions and gameplay events.

The simulation uses a fixed-step accumulator rather than relying on the
browser's frame rate. Large frame deltas are clamped and the number of
simulation steps per frame is capped to avoid an unbounded backlog. This
makes gameplay behavior more stable across devices and provides a
controlled stepping API for tests.

### Session lifecycle

`src/game/GameSession.ts` owns the resources for one match:

-   PixiJS `Application`.
-   `Simulation` and `GameRenderer`.
-   Keyboard and merged input sources.
-   Resize and document/window event listeners.
-   The React-facing snapshot subscription.

React consumes snapshots through `subscribe()` and `getSnapshot()`
rather than rendering every simulation frame. The session's `destroy()`
method removes listeners, disconnects observers, destroys the renderer
and simulation, and releases PixiJS display objects.

### Input

-   `KeyboardInput` maps keyboard events to gameplay actions and
    detaches its listeners when the session ends.
-   `InputMux` merges multiple input sources, allowing keyboard and
    touch controls to operate simultaneously.
-   `TouchControls` uses pointer events and pointer capture to support
    held buttons and multiple touch inputs.

### Rendering and assets

-   `src/game/render/assets.ts` defines the asset manifest and loads
    PixiJS textures with progress/error reporting.
-   `src/game/render/GameRenderer.ts` builds the ocean arena and visual
    layers, then synchronizes display objects with the simulation state.
-   Game sprites and UI art are served from `public/assets/`.

The renderer does not own the gameplay rules. It reads simulation state
and updates PixiJS display objects; the simulation does not depend on
React components.

## Data and persistence

### API contracts and client

-   `src/api/contracts.ts` defines `MatchRecord`, ranking/history pages,
    query parameters, and save responses.
-   `src/api/client.ts` configures Axios with `/api` as the base URL and
    a request timeout. It also classifies retryable errors and formats
    user-facing error messages.
-   `src/api/queries.ts` exposes React Query hooks for ranking and match
    history. Query keys include the relevant filters and page so
    different views have separate cache entries.
-   `src/api/queryClient.ts` creates the shared QueryClient and defines
    query-key prefixes.

### Match recorder

`src/api/recorder.ts` is deliberately outside React component state so
pending saves survive screen changes. It:

1.  Stores unfinished records in `localStorage`.
2.  Prevents concurrent saves for the same match.
3.  Retries transient failures with bounded backoff.
4.  Uses the match ID as an idempotency key.
5.  Marks successful records as saved and invalidates ranking/history
    queries.
6.  Retries pending records at startup and when the browser comes back
    online.
7.  Migrates results from the earlier local-only history format.

The UI can show `pending`, `saving`, `saved`, or `failed` states and
offer a manual retry after a failed save.

### Local storage

`src/storage/localStore.ts` persists validated game options and the
latest result, and contains the one-time legacy history migration
helpers. The mock database and recorder use their own versioned keys.
Data is browser-local and is not shared between users or devices.

## Mock API and failure scenarios

`src/mocks/browser.ts` starts MSW and installs a guard that detects API
responses that bypassed the mock worker. It can reactivate the worker
and retry a request once.

-   `src/mocks/handlers.ts` implements the ranking, history, and
    match-save routes.
-   `src/mocks/db.ts` provides a local mock database, stable ranking
    order, pagination, and duplicate-safe inserts.
-   `src/mocks/fixtures.ts` supplies sample records.
-   `src/mocks/scenarios.ts` defines simulated conditions such as empty
    results, latency, timeout, connection errors, HTTP errors, and
    save-timeout recovery.
-   `src/mocks/control.ts` switches scenarios and resets mock data.
-   `src/ui/MockPanel.tsx` exposes scenario selection outside an active
    match.

These scenarios make it possible to manually exercise API-related UI
states without a remote server. They should not be described as
integration with a real online leaderboard.

## Error handling and lifecycle considerations

-   Texture loading reports progress and displays a retry path if
    loading fails.
-   Axios requests have a timeout and distinguish retryable transient
    errors from non-retryable client errors.
-   The match recorder retains failed records locally instead of
    silently discarding them.
-   The mock worker has a recovery path for browser service-worker
    suspension.
-   `GameSession.destroy()` centralizes cleanup for event listeners,
    resize observation, ticker callbacks, and PixiJS objects.
-   Screen-reader status announcements are used for selected gameplay
    state changes.

## Build and quality checks

Available `package.json` scripts in the supplied project:

``` bash
npm run dev
npm run build
npm run lint
npm run preview
```

The build runs TypeScript project checks before creating the Vite
production bundle. Oxlint is used for linting.

A Playwright configuration is present and points to `tests/e2e`, but the
supplied source archive did not include E2E test files and
`package.json` has no test script. Verify the test directory and scripts
in the working repository before claiming that E2E tests pass.

## Known scope and future work

-   Replace the MSW mock API with a real backend if persistent, shared
    rankings are required.
-   Add or restore automated E2E tests under `tests/e2e` and expose them
    through an npm script.
-   Add deployment instructions and environment-specific configuration
    once the hosting target and real API are known.
-   Add a repository license and verify redistribution rights for the
    included art assets.
