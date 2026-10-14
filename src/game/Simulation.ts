import type { GameConfig, ShipStats, WeaponStats } from './config';
import {
  circlesOverlap, clamp, createRng, forwardX, forwardY, headingTo, normalizeAngle,
  segmentHitsCircle, turnToward,
} from './math';
import {
  emptyInput, type EndReason, type GameEvent, type InputState, type MatchResult,
  type MatchStatus, type Projectile, type Ship, type ShipKind,
} from './types';

export const FIXED_STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;

export type EventListener = (e: GameEvent) => void;

/**
 * Pure game rules. No PixiJS, no React, no DOM, no wall-clock.
 * Time only advances through `advance()` / `step()`, so pause is exact and tests are deterministic.
 */
export class Simulation {
  readonly config: GameConfig;
  readonly player: Ship;
  readonly enemies: Ship[] = [];
  readonly projectiles: Projectile[] = [];
  readonly input: InputState = emptyInput();

  status: MatchStatus = 'running';
  endReason: EndReason | null = null;
  score = 0;
  /** active (unpaused) simulated seconds */
  elapsed = 0;

  private rng: () => number;
  private nextId = 1;
  private accumulator = 0;
  private spawnTimer: number;
  private spawnCount = 0;
  private listeners = new Set<EventListener>();

  constructor(config: GameConfig) {
    this.config = config;
    this.rng = createRng(config.seed);
    this.spawnTimer = config.match.spawnIntervalSec;
    const { width, height } = config.arena;
    this.player = this.makeShip('player', width * 0.2, height * 0.8, 0, config.player.ship);
  }

  // ---- public API ---------------------------------------------------------

  on(l: EventListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Feed real frame time (seconds). Runs 0..N fixed steps; frame-rate independent. */
  advance(frameDt: number): void {
    if (this.status !== 'running') return;
    this.accumulator += clamp(frameDt, 0, 0.25);
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME && this.status === 'running') {
      this.step(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0; // drop backlog (spiral of death)
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  /** Resume discards buffered time and held keys so nothing from the paused period is replayed. */
  resume(): void {
    if (this.status !== 'paused') return;
    this.accumulator = 0;
    Object.assign(this.input, emptyInput());
    this.status = 'running';
  }

  setInput(patch: Partial<InputState>): void {
    if (this.status !== 'running') return;
    Object.assign(this.input, patch);
  }

  get timeLeft(): number {
    return Math.max(0, this.config.match.durationSec - this.elapsed);
  }

  getResult(): MatchResult | null {
    if (this.status !== 'ended' || !this.endReason) return null;
    const { durationSec, spawnIntervalSec } = this.config.match;
    return {
      score: this.score,
      playedSec: Math.min(this.elapsed, durationSec),
      reason: this.endReason,
      config: { durationSec, spawnIntervalSec },
    };
  }

  /** One deterministic fixed step. */
  step(dt: number): void {
    if (this.status !== 'running') return;
    this.elapsed += dt;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.resolveShipCollisions();
    this.updateSpawns(dt);
    this.compactDead();
    this.checkEnd();
  }

  // ---- ships ----------------------------------------------------------------

  private makeShip(kind: ShipKind, x: number, y: number, heading: number, s: ShipStats): Ship {
    return {
      id: this.nextId++, kind, x, y, heading, hp: s.maxHp, maxHp: s.maxHp,
      radius: s.radius, alive: true, avoidSide: 0, cooldowns: { front: 0, left: 0, right: 0 },
    };
  }

  /** Move with island sliding + arena clamp. Ships can never end a step inside an island. */
  private moveShip(ship: Ship, dx: number, dy: number): boolean {
    ship.x += dx;
    ship.y += dy;
    let blocked = false;
    for (const isl of this.config.islands) {
      const ox = ship.x - isl.x, oy = ship.y - isl.y;
      const min = isl.radius + ship.radius;
      const d2 = ox * ox + oy * oy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        ship.x = isl.x + (ox / d) * min;
        ship.y = isl.y + (oy / d) * min;
        blocked = true;
      }
    }
    const { width, height } = this.config.arena;
    const cx = clamp(ship.x, ship.radius, width - ship.radius);
    const cy = clamp(ship.y, ship.radius, height - ship.radius);
    if (cx !== ship.x || cy !== ship.y) blocked = true;
    ship.x = cx;
    ship.y = cy;
    return blocked;
  }

  private tickCooldowns(ship: Ship, dt: number): void {
    const c = ship.cooldowns;
    c.front = Math.max(0, c.front - dt);
    c.left = Math.max(0, c.left - dt);
    c.right = Math.max(0, c.right - dt);
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const cfg = this.config.player;
    this.tickCooldowns(p, dt);
    const turn = (this.input.turnRight ? 1 : 0) - (this.input.turnLeft ? 1 : 0);
    p.heading = normalizeAngle(p.heading + turn * cfg.ship.turnRate * dt);
    if (this.input.forward) {
      const v = cfg.ship.speed * dt;
      this.moveShip(p, forwardX(p.heading) * v, forwardY(p.heading) * v);
    }
    if (this.input.fireFront && p.cooldowns.front <= 0) {
      p.cooldowns.front = cfg.front.cooldown;
      this.fireProjectile(p, 'player', cfg.front, p.heading, 0, p.radius);
      this.emit({ type: 'shot', weapon: 'front', shipId: p.id, x: p.x, y: p.y, heading: p.heading });
    }
    if (this.input.fireLeft && p.cooldowns.left <= 0) {
      p.cooldowns.left = cfg.side.cooldown;
      this.fireBroadside(p, -1);
    }
    if (this.input.fireRight && p.cooldowns.right <= 0) {
      p.cooldowns.right = cfg.side.cooldown;
      this.fireBroadside(p, 1);
    }
  }

  /** Three parallel projectiles, spaced along the hull. side: -1 = port, +1 = starboard. */
  private fireBroadside(p: Ship, side: -1 | 1): void {
    const w = this.config.player.side;
    const dir = p.heading + side * (Math.PI / 2);
    for (let i = 0; i < w.count; i++) {
      const along = (i - (w.count - 1) / 2) * w.spacing;
      this.fireProjectile(p, 'player', w, dir, along, p.radius * 0.8);
    }
    this.emit({ type: 'shot', weapon: 'side', shipId: p.id, x: p.x, y: p.y, heading: dir });
  }

  private fireProjectile(
    ship: Ship, owner: 'player' | 'enemy', w: WeaponStats,
    dir: number, alongHull: number, muzzleOffset: number,
  ): void {
    const fx = forwardX(ship.heading), fy = forwardY(ship.heading);
    const dx = forwardX(dir), dy = forwardY(dir);
    const x = ship.x + fx * alongHull + dx * muzzleOffset;
    const y = ship.y + fy * alongHull + dy * muzzleOffset;
    this.projectiles.push({
      id: this.nextId++, owner, x, y, prevX: x, prevY: y,
      vx: dx * w.projectileSpeed, vy: dy * w.projectileSpeed,
      damage: w.damage, radius: w.projectileRadius, life: w.projectileLife, alive: true,
    });
  }

  // ---- enemies --------------------------------------------------------------

  private updateEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      this.tickCooldowns(e, dt);
      const stats = e.kind === 'chaser' ? this.config.chaser.ship : this.config.shooter.ship;
      const dx = p.x - e.x, dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      // Goal vector toward the player, bent away from nearby allies so they spread out.
      let tx = dx / (dist || 1), ty = dy / (dist || 1);
      const sepR = this.config.match.enemySeparation;
      for (const o of this.enemies) {
        if (o === e || !o.alive) continue;
        const ox = e.x - o.x, oy = e.y - o.y;
        const od = Math.hypot(ox, oy) || 0.001;
        const range = e.radius + o.radius + sepR;
        if (od < range) {
          const w = (1 - od / range) * 1.6;
          tx += (ox / od) * w;
          ty += (oy / od) * w;
        }
      }
      let desired = headingTo(tx, ty);
      desired = this.avoidIslands(e, desired, stats.speed);
      e.heading = turnToward(e.heading, desired, stats.turnRate * dt);

      let advance = true;
      if (e.kind === 'shooter') {
        const sh = this.config.shooter;
        advance = dist > sh.keepDistance;
        const aimErr = Math.abs(normalizeAngle(headingTo(dx, dy) - e.heading));
        if (dist <= sh.attackRange && aimErr <= sh.aimToleranceRad && e.cooldowns.front <= 0) {
          e.cooldowns.front = sh.weapon.cooldown;
          this.fireProjectile(e, 'enemy', sh.weapon, e.heading, 0, e.radius);
          this.emit({ type: 'shot', weapon: 'front', shipId: e.id, x: e.x, y: e.y, heading: e.heading });
        }
      }
      if (advance) {
        const v = stats.speed * dt;
        this.moveShip(e, forwardX(e.heading) * v, forwardY(e.heading) * v);
      }
    }
    this.separateEnemies();
  }

  /** Hard positional separation so hulls never stack, even when steering is not enough. */
  private separateEnemies(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const ox = b.x - a.x, oy = b.y - a.y;
        const min = (a.radius + b.radius) * 0.9;
        const d2 = ox * ox + oy * oy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.001;
        const push = (min - d) / 2;
        const nx = ox / d, ny = oy / d;
        this.moveShip(a, -nx * push, -ny * push);
        this.moveShip(b, nx * push, ny * push);
      }
    }
  }

  /**
   * Island avoidance: when the straight route to the target would graze an island, steer along the
   * tangent. The side is chosen once and kept (avoidSide) until the way is clear, so ships commit to
   * one detour instead of flip-flopping and hugging the shore.
   */
  private avoidIslands(e: Ship, desired: number, speed: number): number {
    const look = speed * 1.1 + e.radius + 40;
    const fx = forwardX(desired), fy = forwardY(desired);
    for (const isl of this.config.islands) {
      const margin = isl.radius + e.radius + 26;
      const rx = isl.x - e.x, ry = isl.y - e.y;
      const proj = rx * fx + ry * fy;
      if (proj < -isl.radius * 0.3 || proj > look + isl.radius) continue;
      const lateral = rx * fy - ry * fx; // >0: island on the right of the desired line
      if (Math.abs(lateral) >= margin) continue;
      if (e.avoidSide === 0) e.avoidSide = lateral > 0 ? -1 : 1;
      const dist = Math.hypot(rx, ry) || 0.001;
      const subtended = Math.asin(Math.min(1, margin / dist));
      return normalizeAngle(headingTo(rx, ry) + e.avoidSide * (subtended + 0.12));
    }
    e.avoidSide = 0;
    return desired;
  }

  // ---- projectiles & collisions ---------------------------------------------

  private updateProjectiles(dt: number): void {
    const { width, height } = this.config.arena;
    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      pr.prevX = pr.x;
      pr.prevY = pr.y;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0 || pr.x < 0 || pr.y < 0 || pr.x > width || pr.y > height) {
        pr.alive = false;
        continue;
      }
      if (this.config.islands.some(i => segmentHitsCircle(pr.prevX, pr.prevY, pr.x, pr.y, pr.radius, i))) {
        pr.alive = false;
        this.emit({ type: 'blocked', x: pr.x, y: pr.y });
        continue;
      }
      if (pr.owner === 'player') {
        for (const e of this.enemies) {
          if (e.alive && segmentHitsCircle(pr.prevX, pr.prevY, pr.x, pr.y, pr.radius, e)) {
            pr.alive = false; // single-hit: removed immediately
            this.damageShip(e, pr.damage, true, pr.x, pr.y);
            break;
          }
        }
      } else if (this.player.alive && segmentHitsCircle(pr.prevX, pr.prevY, pr.x, pr.y, pr.radius, this.player)) {
        pr.alive = false;
        this.damageShip(this.player, pr.damage, false, pr.x, pr.y);
      }
    }
  }

  private resolveShipCollisions(): void {
    if (!this.player.alive) return;
    for (const e of this.enemies) {
      if (e.alive && e.kind === 'chaser' && circlesOverlap(e, this.player)) {
        this.emit({ type: 'playerCollision', x: e.x, y: e.y });
        this.damageShip(this.player, this.config.chaser.contactDamage, false, e.x, e.y);
        // Self-destruct: removed from play, never scores.
        e.alive = false;
        e.hp = 0;
        this.emit({ type: 'shipDestroyed', shipId: e.id, kind: e.kind, x: e.x, y: e.y, byPlayer: false });
      }
    }
  }

  private damageShip(ship: Ship, amount: number, byPlayer: boolean, x: number, y: number): void {
    if (!ship.alive) return;
    ship.hp = Math.max(0, ship.hp - amount);
    this.emit({ type: 'hit', targetId: ship.id, x, y, damage: amount });
    if (ship.hp <= 0) {
      ship.alive = false;
      if (ship.kind !== 'player' && byPlayer) this.score += 1;
      this.emit({ type: 'shipDestroyed', shipId: ship.id, kind: ship.kind, x: ship.x, y: ship.y, byPlayer });
    }
  }

  // ---- spawning ---------------------------------------------------------------

  private updateSpawns(dt: number): void {
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      this.spawnTimer += this.config.match.spawnIntervalSec;
      if (this.enemies.filter(e => e.alive).length < this.config.match.maxEnemies) this.trySpawn();
    }
  }

  private pickKind(): ShipKind {
    // Guarantee both types appear early in a default match, then follow the weights.
    if (this.spawnCount === 0) return 'chaser';
    if (this.spawnCount === 1) return 'shooter';
    const { chaser, shooter } = this.config.match.spawnWeights;
    return this.rng() * (chaser + shooter) < chaser ? 'chaser' : 'shooter';
  }

  private trySpawn(): void {
    const { width, height } = this.config.arena;
    const m = this.config.match;
    const kind = this.pickKind();
    const stats = kind === 'chaser' ? this.config.chaser.ship : this.config.shooter.ship;
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = m.spawnEdgeMargin + this.rng() * (width - 2 * m.spawnEdgeMargin);
      const y = m.spawnEdgeMargin + this.rng() * (height - 2 * m.spawnEdgeMargin);
      const probe = { x, y, radius: stats.radius + 20 };
      if (this.config.islands.some(i => circlesOverlap(probe, i))) continue;
      if (Math.hypot(x - this.player.x, y - this.player.y) < m.spawnMinDistanceFromPlayer) continue;
      if (this.enemies.some(e => e.alive && circlesOverlap(probe, e))) continue;
      const ship = this.makeShip(kind, x, y, headingTo(this.player.x - x, this.player.y - y), stats);
      // Spawn grace for shooters: they must reload before the first shot.
      if (kind === 'shooter') ship.cooldowns.front = this.config.shooter.weapon.cooldown;
      this.enemies.push(ship);
      this.spawnCount++;
      this.emit({ type: 'enemySpawned', shipId: ship.id, kind });
      return;
    }
    // No valid spot this tick: skip; the next interval retries (never spawn unsafely).
  }

  // ---- housekeeping -------------------------------------------------------------

  private compactDead(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
  }

  private checkEnd(): void {
    if (!this.player.alive) this.finish('player_destroyed');
    else if (this.elapsed >= this.config.match.durationSec) this.finish('time_up');
  }

  private finish(reason: EndReason): void {
    this.status = 'ended';
    this.endReason = reason;
    this.elapsed = Math.min(this.elapsed, this.config.match.durationSec);
    Object.assign(this.input, emptyInput());
    this.emit({ type: 'ended', reason });
  }

  private emit(e: GameEvent): void {
    this.listeners.forEach(l => l(e));
  }

  /** Release references; called on unmount/restart. */
  dispose(): void {
    this.listeners.clear();
    this.enemies.length = 0;
    this.projectiles.length = 0;
  }
}