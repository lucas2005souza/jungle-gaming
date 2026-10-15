# Pirate Battle

A top-down 2D naval arcade shooter built with **React, TypeScript, and
PixiJS**. Sail around islands, fight enemy ships, survive the match
timer, and try to earn a high score.

> **Project status:** Front-end game prototype. The ranking and
> match-history API is simulated in the browser with Mock Service Worker
> (MSW); this repository does not include a production backend.

## Features

-   Top-down naval combat rendered with PixiJS.
-   Keyboard and touch controls.
-   Forward cannon and left/right broadside weapons.
-   Enemy ship types with different behavior.
-   Islands, collision handling, projectiles, hit effects, and ship
    damage states.
-   Match timer, player health, score, pause/resume, and end-of-match
    results.
-   Configurable match duration and enemy spawn interval.
-   Ranking and match history screens with pagination.
-   Local persistence for options and recent results.
-   Mock API scenarios for loading, latency, network failures, server
    errors, and save-retry behavior.
-   Responsive interface with touch controls for mobile devices.

## Tech stack

-   **React** --- menus, options, HUD, results, and history screens.
-   **TypeScript** --- typed gameplay rules, API contracts, and UI.
-   **PixiJS 8** --- 2D rendering and asset management.
-   **Vite** --- development server and production build.
-   **TanStack Query** --- ranking/history request state and caching.
-   **Axios** --- API client.
-   **Mock Service Worker (MSW)** --- browser-side mock API.
-   **Playwright** --- browser-test configuration is present in the
    repository.

## Getting started

### Requirements

Install a current Node.js LTS release that is compatible with the
installed Vite version, then verify that Node and npm are available:

``` bash
node --version
npm --version
```

### Install dependencies

From the project root (the folder containing `package.json`):

``` bash
npm install
```

### Start the development server

``` bash
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173/`.

If PowerShell blocks `npm.ps1` on Windows, use the **Command Prompt
(cmd)** terminal in VS Code and run the same command there. This avoids
changing the system's PowerShell execution policy.

## Controls

  Action                 Keyboard                 Touch
  ---------------------- ------------------------ -----------------------------
  Sail forward           `W` or `↑`               Forward button
  Turn left / right      `A` / `D` or `←` / `→`   Left / right buttons
  Fire forward           `Space`                  Front-fire button
  Fire left broadside    `Q`                      Left-fire button
  Fire right broadside   `E`                      Right-fire button
  Pause / resume         `P` or `Esc`             Pause button / pause dialog

On phones, the game is designed to be played in landscape orientation.
You can steer and fire at the same time.

## Gameplay options

The Options screen allows the player to change:

-   **Match duration:** 60--180 seconds, in 5-second increments.
-   **Enemy spawn interval:** 0.5--10 seconds, in 0.5-second increments.

Options are validated and saved in browser `localStorage`. Changes made
from the pause menu apply to the next match.

## Ranking, history, and mock API

The client sends requests to relative `/api` endpoints:

-   `GET /api/ranking`
-   `GET /api/matches`
-   `POST /api/matches`

During app startup, MSW registers browser-side handlers for these
endpoints. The handlers use deterministic fixture records and a mock
database persisted in `localStorage`; they are not a substitute for a
deployed backend.

The **Network scenario** panel (available outside a match) can be used
to simulate conditions such as empty results, slow responses, timeouts,
connection failures, HTTP 4xx/5xx responses, and match-save timeouts.
This helps exercise the UI's loading, error, retry, and recovery states
without relying on a real server.

Unsent match records are queued in `localStorage` and retried after
failures or when the browser comes back online. Match IDs are used to
avoid creating duplicate records during retries.

## Available scripts

Run these commands from the project root:

  -----------------------------------------------------------------------
  Command                             Purpose
  ----------------------------------- -----------------------------------
  `npm run dev`                       Start the Vite development server.

  `npm run build`                     Run TypeScript project checks and
                                      create the production build in
                                      `dist/`.

  `npm run lint`                      Run Oxlint.

  `npm run preview`                   Serve the production build locally
                                      (run `npm run build` first).
  -----------------------------------------------------------------------

### Testing note

The supplied project contains a Playwright configuration that targets
`tests/e2e` and starts a production preview for browser tests. However,
the source archive used to prepare this documentation did not contain
E2E test files, and `package.json` does not currently define a `test`
script. Do not assume browser tests have passed just because Playwright
reports or a configuration file exists.

Before submitting, run at least:

``` bash
npm run build
npm run lint
```

If E2E tests are required, confirm that the `tests/e2e` test files are
present and add an appropriate script, for example
`"test:e2e": "playwright test"`, before running `npm run test:e2e`.

## Project structure

``` text
src/
├── api/                  # API client, contracts, React Query hooks, match recorder
├── game/                 # Gameplay configuration, simulation, session, input, renderer
│   ├── input/            # Keyboard input and merged input sources
│   └── render/           # PixiJS renderer and texture loading
├── mocks/                # MSW handlers, fixtures, scenarios, mock database
├── storage/              # Options and result persistence
├── ui/                   # Shared UI, dialogs, forms, touch controls
│   └── screens/          # Main menu, game, options, results, ranking/history
├── App.tsx               # Top-level screen navigation
├── main.tsx              # App bootstrap, MSW startup, providers, recovery
└── index.css             # Global styles

public/
├── assets/               # Game sprites, effects, UI art, and brand logo
└── mockServiceWorker.js  # MSW browser service worker
```

For details about runtime responsibilities and data flow, see
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Build for production

``` bash
npm run build
npm run preview
```

Vite prints the local preview URL. The current mock API is part of the
browser app, so a production deployment of this prototype still uses
mock data unless a real backend and API integration are added.

## License and assets

No project license is declared in the supplied `package.json`. Before
redistributing this project or its art assets publicly, add an
appropriate license and verify that the included assets are licensed for
your intended use.
