# Performance and profiling

Everything here is measured on the **real game**, on the **optimized build** (`vite build` + `vite preview`), with the **real clock**: the same artifact that is deployed. Nothing is simulated or sped up.

```bash
npm run test:perf                         # both measurements (about 6 minutes plus the build)
npm run test:perf -- --grep "3 min"       # only the 3-minute session
npm run test:perf -- --grep "5 game"      # only the memory cycles
npm run test:perf:report                  # HTML report of the last run
```

Each run writes its numbers to [`docs/reports/performance/`](reports/performance) (`fps-3min.md/.json`, `memory-5-cycles.md/.json`). The report is written **before** the thresholds are checked, so a failing threshold still leaves the data.

## What is measured and how

| Measurement | How |
|---|---|
| **FPS** | A probe inside the page records one `requestAnimationFrame` timestamp per displayed frame into a pre-allocated `Float64Array` (no allocation per frame). Average FPS = frames / seconds. The worst whole second and the "1 % low" (1000 / p99) are reported too. |
| **p95 time between frames** | Differences between consecutive timestamps, nearest-rank 95th percentile. p50, p99, max and the number of frames above 25 ms and 50 ms are reported next to it, plus main-thread tasks above 50 ms (Long Tasks API). |
| **Entities in 3 minutes** | Once per second the probe reads `window.__pirateGame.counts()` (test hook, no copies): alive enemies, alive projectiles and the total (player + enemies + projectiles). Reported as min / mean / p95 / max, and the mean of the first third of the run is compared with the last third to prove entities do not accumulate. |
| **Memory after 5 game cycles** | Five consecutive matches. After each one, back on the main menu, the test forces two garbage collections (`HeapProfiler.collectGarbage` through the Chrome DevTools Protocol) and reads `JSHeapUsedSize`, DOM nodes and JS event listeners (`Performance.getMetrics`). A baseline is read before the first match. |

### Scenario (3 minutes)

- Match of **180 s** (the longest the Options screen allows) with a new enemy every **0.5 s** (the shortest allowed), so the arena stays at its 12-enemy cap. This is the worst case a player can configure; the default (90 s, 2.5 s) is lighter.
- Seed 1, so spawns are reproducible.
- The ship is made invincible with the test hook (`place({ player: { hp } })`), otherwise the session would end early. Everything else is real: the keys `W D Space Q E` are held for the whole run (sailing in circles, front cannon and both broadsides firing whenever they reload).
- The first 2 s (shader compilation, first texture uploads) are excluded from the steady-state numbers; the whole-run numbers are reported as well.

### Scenario (5 cycles)

- Matches of about 20 s each with the same busy input and spawn rate.
- Cycles 1, 3 and 5 end by **ship destroyed** (a Chaser rams a nearly destroyed ship) and go through the result screen to the main menu; cycles 2 and 4 end by **Pause, then Main Menu**. Both teardown paths of `GameSession.destroy()` are therefore exercised.
- Cycle 1 pays one-time costs (textures, shaders, caches), so growth is judged **from cycle 1 to cycle 5**.

## Thresholds

| Check | Default | Override |
|---|---|---|
| Average FPS (steady state) | at least 55 | `PERF_MIN_FPS` |
| p95 time between frames | at most 20 ms | `PERF_MAX_P95_MS` |
| JS heap growth, cycle 1 to 5 | at most 5 MB | `PERF_MAX_HEAP_GROWTH_MB` |
| JS event listener growth, cycle 1 to 5 | at most 5 | `PERF_MAX_LISTENER_GROWTH` |
| DOM node growth, cycle 1 to 5 | at most 100 | `PERF_MAX_NODE_GROWTH` |
| Entities | at most 120 at any time, and not growing between the first and last third | - |
| Session validity | never paused, ended by itself, 180 simulated seconds played | - |

The defaults are deliberately simple budgets (a 60 Hz display gives 16.7 ms per frame, so 20 ms leaves a small margin). On a slow machine or a software-rendered browser, lower them with the variables above and say so in the results below.

## Results

Run on 2026-10-16. Full reports: [fps-3min.md](reports/performance/fps-3min.md) and [memory-5-cycles.md](reports/performance/memory-5-cycles.md).

| Item | Value |
|---|---|
| Browser | Chromium 156 (new headless mode), production build |
| CPU / RAM | AMD Ryzen 7 5800X (16 threads), 16 GB |
| WebGL renderer | ANGLE (NVIDIA GeForce RTX 4070 SUPER, Direct3D 11) |
| OS | Windows (win32 10.0.26200) |

### 3-minute session (180 s, an enemy every 0.5 s)

| Metric | Result |
|---|---|
| Average FPS | 300.0 |
| Worst second (FPS) | 299 |
| 1 % low FPS | 294.1 |
| Time between frames, p50 / **p95** / p99 / max | 3.30 ms / **3.40 ms** / 3.40 ms / 6.70 ms |
| Frames above 25 ms / 50 ms | 0 / 0 (of 53,367) |
| Main-thread tasks above 50 ms | 0 |
| Entities, total (min / mean / p95 / max) | 8 / 16.9 / 22 / 24 |
| Enemies (min / mean / p95 / max) | 2 / 11.6 / 12 / 12 |
| Projectiles (min / mean / p95 / max) | 0 / 4.3 / 9 / 11 |
| Mean entities, first third vs last third | 16.8 vs 16.7 |
| JS heap during the run | 13.0 MB at the start, 12.5 MB at the end (range 11.1 to 16.1 MB) |

How to read it: the headless browser has no vertical sync, so it draws as fast as it can. 300 FPS is therefore **headroom**, not what a player sees: on a 60 Hz display the game is capped at 60 FPS, and each frame costs about 3.3 ms of the 16.7 ms available. The numbers that matter are that there were no frames above 25 ms and no long tasks, and that the entity count is bounded (at most 12 enemies and 11 projectiles) and stays flat for the whole session.

### Memory after 5 cycles

| Moment | Match ended by | JS heap after GC (MB) | DOM nodes | Event listeners |
|---|---|---|---|---|
| Baseline (menu, before any match) | - | 4.69 | 259 | 184 |
| After cycle 1 | ship destroyed | 7.87 | 266 | 214 |
| After cycle 2 | left to menu | 8.24 | 325 | 218 |
| After cycle 3 | ship destroyed | 8.32 | 266 | 214 |
| After cycle 4 | left to menu | 8.54 | 325 | 218 |
| After cycle 5 | ship destroyed | 8.61 | 266 | 214 |
| **Growth, cycle 1 to 5** | | **+0.74 MB** | **+0** | **+0** |

How to read it: DOM nodes and listeners return to exactly the same values after each type of ending (266 / 214 after a death, 325 / 218 after leaving through the pause menu), so no listener or element is left behind by `GameSession.destroy()` or by the React screens. The 59-node difference between the two endings is the main menu itself: it shows different content depending on whether a last result exists. The heap grows by about 0.1 to 0.2 MB per cycle in a decreasing pattern (+0.37, +0.08, +0.22, +0.07). That is well inside the 5 MB budget, and the jump from baseline to cycle 1 (3.2 MB) is the one-time cost of textures and caches.

### Why the browser choice matters

A first run with Playwright's default headless shell drew WebGL in software on the CPU and measured only 24 FPS (p95 66.7 ms) for the same scene on the same machine. That number described the CPU rasterizer, not the game, which is why the performance configuration uses the full Chromium and prints the WebGL renderer in every report.

## Limits of these measurements

- **Hardware dependent.** Numbers describe the machine in the environment table, including the **WebGL renderer** line. If it says SwiftShader, llvmpipe or similar, the browser is drawing on the CPU: the report then prints a warning and the FPS says nothing about the game on a real GPU. The Playwright default browser (`chromium-headless-shell`) does exactly that, which is why `playwright.perf.config.ts` uses the full Chromium (`channel: 'chromium'`). If it still falls back to software, run with `PERF_HEADED=1` (a visible window) and keep it focused.
- **Instrumentation overhead.** The `?e2e=1` hook listens to gameplay events and keeps counters; the probe adds one callback per frame. Both are small, but they are not zero. Normal play (without `?e2e=1`) runs neither.
- **GPU memory** (textures, buffers) is not part of the JS heap and is not measured. Check it by hand in DevTools if needed (see below).
- **Do not measure the dev server.** React development mode and hot reload are much slower than the build.
- **Keep the browser window focused and visible** (headless is the default). A match pauses on window blur or when the page is hidden, and the test fails with a clear message if that happens.
- Do not run other heavy programs during the 3 minutes.

## Manual profiling with Chrome DevTools (optional)

1. `npm run build && npm run preview`, open http://localhost:4173 in Chrome, start a match.
2. **Performance** tab: record 10 to 20 s while playing. Look at the *Frames* lane for red bars, and at *Main* for tasks above 50 ms. Many short `Minor GC` entries mean per-frame allocations.
3. **Memory** tab, *Allocation instrumentation on timeline*: play, finish the match and go to the menu, click the trash can (collect garbage). Blue bars that remain are retained objects.
4. **Memory** tab, *Heap snapshot*: take one on the menu before the first match and one after five matches; use *Comparison* and look at `# Delta` for `Sprite`, `Graphics`, `Container` or `Simulation`.
5. For GPU memory: `chrome://gpu` and the *Graphics* section of the Task Manager (Shift+Esc).

## Where to look first if a threshold fails

Not measured yet, so these are hypotheses taken from reading the code, to confirm with the Performance tab before changing anything:

- `GameRenderer.syncShips()` builds a new array (`[player, ...enemies]`) and iterates a `Map` every frame.
- `GameSession.readSnapshot()` creates a new object every frame, only to compare it with the previous one.
- `Simulation.updateProjectiles()` creates a closure (`islands.some(...)`) for every projectile on every fixed step.
- `GameRenderer.onEvent()` creates three small texture arrays for every gameplay event.
- `GameRenderer.spawnEffect()` uses `Array.find` with a closure and `Object.assign` with a literal.

Each one is a small, short-lived allocation. They only matter if the Performance tab shows frequent minor garbage collections coinciding with long frames.
