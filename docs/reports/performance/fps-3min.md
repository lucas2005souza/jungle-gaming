# Performance: 3-minute session

Scenario: 180 s match, enemy spawn every 0.5 s (max 12 at once), seed 1, real clock, ship invincible,
keys held for the whole run: KeyW, KeyD, Space, KeyQ, KeyE. Measured with requestAnimationFrame timestamps.

| Item | Value |
|---|---|
| Date | 2026-10-16T03:55:29.959Z |
| Target | production build (vite build + vite preview) |
| Browser | Chromium 156.0.8078.4 (headless, new mode) |
| OS | win32 10.0.26200 |
| CPU | AMD Ryzen 7 5800X 8-Core Processor (16 threads) |
| WebGL renderer | ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER (0x00002783) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| RAM | 16 GB |
| Node | v24.22.0 |

## Frame rate (steady state: first 2 s ignored, 178 s analysed)

| Metric | Value |
|---|---|
| Average FPS | 300.0 |
| Worst second (FPS) | 299 |
| 1 % low FPS (1000 / p99) | 294.1 |
| Time between frames, mean | 3.33 ms |
| Time between frames, median (p50) | 3.30 ms |
| **Time between frames, p95** | **3.40 ms** |
| Time between frames, p99 | 3.40 ms |
| Time between frames, max | 6.70 ms |
| Frames above 25 ms / above 50 ms | 0 / 0 (of 53367) |
| Main-thread tasks above 50 ms | 0 |

Whole run, warm-up included: average 300.0 FPS, p95 3.40 ms, max 6.70 ms (53968 frames, 180 s).

## Entities (sampled once per second)

| Entities | Min | Mean | p95 | Max |
|---|---|---|---|---|
| Total (player + enemies + projectiles) | 8 | 16.9 | 22 | 24 |
| Enemies | 2 | 11.6 | 12 | 12 |
| Projectiles | 0 | 4.3 | 9 | 11 |

Mean total entities in the first third of the run: 16.8; in the last third: 16.7 (they must not keep growing).

## JS heap during the run (not garbage-collected before reading: it normally looks like a saw)

Start 13.0 MB, end 12.5 MB, minimum 11.1 MB, maximum 16.1 MB.
