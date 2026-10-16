# Performance: memory after 5 game cycles

Scenario: 5 consecutive matches of about 20 s each (busy play, spawn every 0.5 s), alternating the two ways a match ends
(ship destroyed -> result screen -> Main Menu, and Pause -> Main Menu). Every reading is taken on the main menu, after two forced garbage collections (Chrome DevTools Protocol).

| Item | Value |
|---|---|
| Date | 2026-10-16T03:57:21.148Z |
| Target | production build (vite build + vite preview) |
| Browser | Chromium 156.0.8078.4 (headless, new mode) |
| OS | win32 10.0.26200 |
| CPU | AMD Ryzen 7 5800X 8-Core Processor (16 threads) |
| WebGL renderer | ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER (0x00002783) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| RAM | 16 GB |
| Node | v24.22.0 |

| Moment | Match ended by | JS heap after GC (MB) | Heap vs cycle 1 (MB) | DOM nodes | JS event listeners |
|---|---|---|---|---|---|
| Baseline (menu, before any match) | - | 4.69 | - | 259 | 184 |
| After cycle 1 | ship destroyed | 7.87 | - | 266 | 214 |
| After cycle 2 | left to menu | 8.24 | +0.37 | 325 | 218 |
| After cycle 3 | ship destroyed | 8.32 | +0.45 | 266 | 214 |
| After cycle 4 | left to menu | 8.54 | +0.67 | 325 | 218 |
| After cycle 5 | ship destroyed | 8.61 | +0.74 | 266 | 214 |

**Growth from cycle 1 to cycle 5:** heap +0.74 MB, DOM nodes +0, event listeners +0.

GPU memory (WebGL textures and buffers) is not part of the JS heap and is not measured here.
