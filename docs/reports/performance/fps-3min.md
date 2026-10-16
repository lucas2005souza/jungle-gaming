# Performance: 3-minute session

Scenario: 180 s match, enemy spawn every 0.5 s (max 12 at once), seed 1, real clock, ship invincible,
keys held for the whole run: KeyW, KeyD, Space, KeyQ, KeyE. Measured with requestAnimationFrame timestamps.

| Item | Value |
|---|---|
| Date | 2026-10-16T03:46:50.641Z |
| Target | production build (vite build + vite preview) |
| Browser | Chromium 156.0.8078.4 (headless) |
| OS | win32 10.0.26200 |
| CPU | AMD Ryzen 7 5800X 8-Core Processor (16 threads) |
| RAM | 16 GB |
| Node | v24.22.0 |

## Frame rate (steady state: first 2 s ignored, 178 s analysed)

| Metric | Value |
|---|---|
| Average FPS | 24.1 |
| Worst second (FPS) | 16 |
| 1 % low FPS (1000 / p99) | 15.0 |
| Time between frames, mean | 41.49 ms |
| Time between frames, median (p50) | 33.40 ms |
| **Time between frames, p95** | **66.70 ms** |
| Time between frames, p99 | 66.70 ms |
| Time between frames, max | 83.40 ms |
| Frames above 25 ms / above 50 ms | 4291 / 677 (of 4291) |
| Main-thread tasks above 50 ms | 686 (longest 76 ms) |

Whole run, warm-up included: average 24.1 FPS, p95 66.70 ms, max 83.40 ms (4340 frames, 180 s).

## Entities (sampled once per second)

| Entities | Min | Mean | p95 | Max |
|---|---|---|---|---|
| Total (player + enemies + projectiles) | 7 | 17.4 | 23 | 24 |
| Enemies | 2 | 11.6 | 12 | 12 |
| Projectiles | 0 | 4.8 | 10 | 11 |

Mean total entities in the first third of the run: 17.4; in the last third: 17.0 (they must not keep growing).

## JS heap during the run (not garbage-collected before reading: it normally looks like a saw)

Start 12.7 MB, end 13.8 MB, minimum 11.5 MB, maximum 16.0 MB.
