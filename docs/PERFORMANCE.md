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

> Run `npm run test:perf` and paste the tables from `docs/reports/performance/*.md` here, together with the environment table the report prints (browser, OS, CPU, RAM).

### 3-minute session

| Metric | Result |
|---|---|
| Average FPS | _fill in_ |
| Worst second (FPS) | _fill in_ |
| Time between frames, p50 / **p95** / p99 / max | _fill in_ |
| Frames above 25 ms / 50 ms | _fill in_ |
| Entities (min / mean / p95 / max) | _fill in_ |

### Memory after 5 cycles

| Moment | JS heap after GC (MB) | DOM nodes | Event listeners |
|---|---|---|---|
| Baseline | _fill in_ | _fill in_ | _fill in_ |
| Cycle 1 | _fill in_ | _fill in_ | _fill in_ |
| Cycle 5 | _fill in_ | _fill in_ | _fill in_ |
| **Growth 1 to 5** | _fill in_ | _fill in_ | _fill in_ |

## Limits of these measurements

- **Hardware dependent.** Numbers describe the machine in the environment table. Headless Chromium may rasterize WebGL in software; a real GPU is normally faster, not slower.
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
