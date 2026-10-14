import { Container, Graphics, Sprite, TilingSprite, type Application, type Texture } from 'pixi.js';
import type { GameEvent, Ship, ShipKind } from '../types';
import type { Simulation } from '../Simulation';
import { forwardX, forwardY } from '../math';
import { DAMAGE_STAGES, SHIP_COLORS, shipTextureKey, type GameTextures } from './assets';

const WATER = 0x2a8fb5;

const KIND_STYLE: Record<ShipKind, { color: number; scale: number }> = {
  player: { color: SHIP_COLORS.blue, scale: 0.8 },
  chaser: { color: SHIP_COLORS.red, scale: 0.7 },
  shooter: { color: SHIP_COLORS.black, scale: 0.74 },
};

interface ShipView {
  sprite: Sprite;
  fire: Sprite;
  bar: Graphics;
  stage: number;
  hpShown: number;
  flash: number;
  seen: number;
  /** Distance from ship centre to where the health bar floats (half hull length + gap). */
  barOffset: number;
}

interface Effect {
  sprite: Sprite;
  active: boolean;
  age: number;
  life: number;
  frames: Texture[];
  s0: number;
  s1: number;
}

const MAX_EFFECTS = 96;
const damageStage = (hp: number, maxHp: number) => {
  const r = hp / maxHp;
  return r > 0.75 ? 0 : r > 0.5 ? 1 : r > 0.25 ? 2 : DAMAGE_STAGES - 1;
};

/**
 * Pure view of the Simulation. Reads state each frame, never mutates it, and owns every Pixi object
 * it creates so `destroy()` can release them deterministically.
 */
export class GameRenderer {
  private readonly app: Application;
  private readonly sim: Simulation;
  private readonly tex: GameTextures;
  private readonly world = new Container();
  private readonly waves = new Graphics();
  private readonly shipLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly effectLayer = new Container();
  private readonly barLayer = new Container();
  private readonly ships = new Map<number, ShipView>();
  private readonly projectiles = new Map<number, { sprite: Sprite; seen: number }>();
  private readonly freeProjectiles: Sprite[] = [];
  private readonly effects: Effect[] = [];
  private readonly unsubscribe: () => void;
  private frameId = 0;
  private time = 0;
  private shake = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(app: Application, sim: Simulation, tex: GameTextures) {
    this.app = app;
    this.sim = sim;
    this.tex = tex;
    const { width, height } = sim.config.arena;

    const bg = new Graphics().rect(0, 0, width, height).fill(WATER);
    this.buildWaves(width, height);
    const border = new Graphics().rect(2, 2, width - 4, height - 4).stroke({ width: 4, color: 0xffffff, alpha: 0.35 });

    this.world.addChild(bg, this.waves, this.buildIslands(), this.projectileLayer, this.shipLayer, this.effectLayer, this.barLayer, border);
    app.stage.addChild(this.world);
    this.unsubscribe = sim.on(e => this.onEvent(e));
  }

  /** Letterbox the fixed logical arena into the canvas, preserving proportions. */
  layout(canvasW: number, canvasH: number): void {
    const { width, height } = this.sim.config.arena;
    this.scale = Math.min(canvasW / width, canvasH / height);
    this.offsetX = (canvasW - width * this.scale) / 2;
    this.offsetY = (canvasH - height * this.scale) / 2;
    this.applyTransform();
  }

  /** Converts canvas CSS pixels to arena coordinates (for any pointer-based input). */
  screenToWorld(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
  }

  /** `dt` is 0 while paused so animations freeze together with the simulation. */
  render(dt: number): void {
    this.time += dt;
    this.frameId++;
    this.waves.x = -((this.time * 12) % 160);
    this.syncShips(dt);
    this.syncProjectiles();
    this.updateEffects(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.applyTransform();
  }

  destroy(): void {
    this.unsubscribe();
    this.app.stage.removeChild(this.world);
    // Textures belong to the shared Assets cache: destroy display objects only.
    this.world.destroy({ children: true });
    this.ships.clear();
    this.projectiles.clear();
    this.freeProjectiles.length = 0;
    this.effects.length = 0;
  }

  // ---- scene construction ---------------------------------------------------

  private applyTransform(): void {
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.world.scale.set(this.scale);
    this.world.position.set(this.offsetX + sx * this.scale, this.offsetY + sy * this.scale);
  }

  private buildWaves(width: number, height: number): void {
    const g = this.waves;
    for (let row = 0; row * 90 < height + 90; row++) {
      for (let col = -1; col * 160 < width + 320; col++) {
        const x = col * 160 + (row % 2) * 80;
        const y = row * 90 + 30;
        g.moveTo(x, y).quadraticCurveTo(x + 20, y - 8, x + 40, y).quadraticCurveTo(x + 60, y + 8, x + 80, y);
      }
    }
    g.stroke({ width: 2, color: 0xffffff, alpha: 0.22 });
  }

  private buildIslands(): Container {
    const layer = new Container();
    const sand = this.tex.get('tile_4');
    const grass = this.tex.get('tile_39');
    const rocks = ['tile_49', 'tile_50', 'tile_51'].map(k => this.tex.get(k));
    const plants = ['tile_70', 'tile_71', 'tile_72'].map(k => this.tex.get(k));
    this.sim.config.islands.forEach((isl, idx) => {
      const c = new Container();
      c.position.set(isl.x, isl.y);
      const r = isl.radius;
      const shallow = new Graphics()
        .circle(0, 0, r + 16).fill({ color: 0xffffff, alpha: 0.16 })
        .circle(0, 0, r + 7).fill({ color: 0xffffff, alpha: 0.22 });
      const sandFill = new TilingSprite({ texture: sand, width: r * 2, height: r * 2 });
      sandFill.tileScale.set(0.5);
      sandFill.position.set(-r, -r);
      const sandMask = new Graphics().circle(0, 0, r).fill(0xffffff);
      sandFill.mask = sandMask;
      const rim = new Graphics().circle(0, 0, r).stroke({ width: 3, color: 0xb98a4e, alpha: 0.7 });
      const gr = r * 0.62;
      const grassFill = new TilingSprite({ texture: grass, width: gr * 2, height: gr * 2 });
      grassFill.tileScale.set(0.5);
      grassFill.position.set(-gr, -gr);
      const grassMask = new Graphics().circle(0, 0, gr).fill(0xffffff);
      grassFill.mask = grassMask;
      c.addChild(shallow, sandFill, sandMask, rim, grassFill, grassMask);
      for (let i = 0; i < 6; i++) {
        const a = ((i + idx * 0.37) / 6) * Math.PI * 2;
        const rock = new Sprite(rocks[(i + idx) % 3]);
        rock.anchor.set(0.5);
        rock.scale.set(0.5);
        rock.position.set(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
        rock.rotation = a;
        c.addChild(rock);
      }
      for (let i = 0; i < 3; i++) {
        const a = ((i + idx * 0.5) / 3) * Math.PI * 2 + 0.6;
        const plant = new Sprite(plants[(i + idx) % 3]);
        plant.anchor.set(0.5);
        plant.scale.set(0.5);
        plant.position.set(Math.cos(a) * gr * 0.5, Math.sin(a) * gr * 0.5);
        c.addChild(plant);
      }
      layer.addChild(c);
    });
    return layer;
  }

  // ---- per-frame sync -----------------------------------------------------------

  private syncShips(dt: number): void {
    const list: Ship[] = [this.sim.player, ...this.sim.enemies];
    for (const ship of list) {
      if (!ship.alive) continue;
      const view = this.ships.get(ship.id) ?? this.createShipView(ship);
      view.seen = this.frameId;
      view.sprite.position.set(ship.x, ship.y);
      view.sprite.rotation = ship.heading;
      const stage = damageStage(ship.hp, ship.maxHp);
      if (stage !== view.stage) {
        view.stage = stage;
        view.sprite.texture = this.tex.get(shipTextureKey(KIND_STYLE[ship.kind].color, stage));
        view.fire.visible = stage >= 2;
      }
      if (view.fire.visible) view.fire.alpha = 0.7 + 0.3 * Math.sin(this.time * 18 + ship.id);
      if (view.flash > 0) {
        view.flash = Math.max(0, view.flash - dt);
        view.sprite.tint = view.flash > 0 ? 0xff7070 : 0xffffff;
      }
      if (ship.hp !== view.hpShown) {
        view.hpShown = ship.hp;
        this.drawBar(view.bar, ship.hp / ship.maxHp);
      }
      view.bar.position.set(ship.x, ship.y - view.barOffset);
    }
    for (const [id, view] of this.ships) {
      if (view.seen !== this.frameId) {
        view.sprite.destroy({ children: true });
        view.bar.destroy();
        this.ships.delete(id);
      }
    }
  }

  private createShipView(ship: Ship): ShipView {
    const style = KIND_STYLE[ship.kind];
    const stage = damageStage(ship.hp, ship.maxHp);
    const sprite = new Sprite(this.tex.get(shipTextureKey(style.color, stage)));
    sprite.anchor.set(0.5);
    sprite.scale.set(style.scale);
    const fire = new Sprite(this.tex.get('fire_1'));
    fire.anchor.set(0.5);
    fire.position.set(0, 10);
    fire.scale.set(0.9);
    fire.visible = stage >= 2;
    sprite.addChild(fire);
    const bar = new Graphics();
    this.shipLayer.addChild(sprite);
    this.barLayer.addChild(bar);
    const view: ShipView = { sprite, fire, bar, stage, hpShown: -1, flash: 0, seen: this.frameId, barOffset: sprite.height / 2 + 10 };
    this.ships.set(ship.id, view);
    return view;
  }

  private drawBar(g: Graphics, ratio: number): void {
    const w = 44, h = 6;
    const color = ratio > 0.5 ? 0x4cd964 : ratio > 0.25 ? 0xffb020 : 0xff4040;
    g.clear()
      .roundRect(-w / 2 - 1, -1, w + 2, h + 2, 3).fill({ color: 0x000000, alpha: 0.6 })
      .roundRect(-w / 2, 0, Math.max(0, w * ratio), h, 2).fill(color);
  }

  private syncProjectiles(): void {
    const ball = this.tex.get('cannon_ball');
    for (const p of this.sim.projectiles) {
      if (!p.alive) continue;
      let v = this.projectiles.get(p.id);
      if (!v) {
        const sprite = this.freeProjectiles.pop() ?? new Sprite(ball);
        sprite.anchor.set(0.5);
        sprite.scale.set(p.owner === 'player' ? 1.25 : 1.1);
        sprite.tint = p.owner === 'player' ? 0xffffff : 0xff9a9a;
        sprite.visible = true;
        if (!sprite.parent) this.projectileLayer.addChild(sprite);
        v = { sprite, seen: 0 };
        this.projectiles.set(p.id, v);
      }
      v.seen = this.frameId;
      v.sprite.position.set(p.x, p.y);
    }
    for (const [id, v] of this.projectiles) {
      if (v.seen !== this.frameId) {
        v.sprite.visible = false;
        this.freeProjectiles.push(v.sprite); // pooled: no per-shot allocation
        this.projectiles.delete(id);
      }
    }
  }

  // ---- effects --------------------------------------------------------------------

  private spawnEffect(
    frames: Texture[], x: number, y: number, life: number, s0: number, s1: number,
    rotation = 0, tint = 0xffffff,
  ): void {
    let fx = this.effects.find(e => !e.active);
    if (!fx) {
      if (this.effects.length >= MAX_EFFECTS) return;
      const sprite = new Sprite(frames[0]);
      sprite.anchor.set(0.5);
      this.effectLayer.addChild(sprite);
      fx = { sprite, active: false, age: 0, life: 1, frames, s0, s1 };
      this.effects.push(fx);
    }
    Object.assign(fx, { active: true, age: 0, life, frames, s0, s1 });
    fx.sprite.position.set(x, y);
    fx.sprite.rotation = rotation;
    fx.sprite.tint = tint;
    fx.sprite.visible = true;
    fx.sprite.texture = frames[0];
    fx.sprite.scale.set(s0);
    fx.sprite.alpha = 1;
  }

  private updateEffects(dt: number): void {
    for (const fx of this.effects) {
      if (!fx.active) continue;
      fx.age += dt;
      const k = fx.age / fx.life;
      if (k >= 1) {
        fx.active = false;
        fx.sprite.visible = false;
        continue;
      }
      fx.sprite.texture = fx.frames[Math.min(fx.frames.length - 1, Math.floor(k * fx.frames.length))];
      fx.sprite.scale.set(fx.s0 + (fx.s1 - fx.s0) * k);
      fx.sprite.alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    }
  }

  private onEvent(e: GameEvent): void {
    const explosion = [this.tex.get('explosion_3'), this.tex.get('explosion_2'), this.tex.get('explosion_1')];
    const hit = [this.tex.get('explosion_3')];
    const flame = [this.tex.get('fire_1'), this.tex.get('fire_2')];
    switch (e.type) {
      case 'shot': {
        const ship = e.shipId === this.sim.player.id ? this.sim.player : this.sim.enemies.find(s => s.id === e.shipId);
        if (!ship) return;
        if (e.weapon === 'front') {
          this.spawnEffect(flame, ship.x + forwardX(e.heading) * (ship.radius + 16), ship.y + forwardY(e.heading) * (ship.radius + 16), 0.14, 0.7, 1.1, e.heading);
        } else {
          const side = this.sim.config.player.side;
          for (let i = 0; i < side.count; i++) {
            const along = (i - (side.count - 1) / 2) * side.spacing;
            const px = ship.x + forwardX(ship.heading) * along + forwardX(e.heading) * (ship.radius + 4);
            const py = ship.y + forwardY(ship.heading) * along + forwardY(e.heading) * (ship.radius + 4);
            this.spawnEffect(flame, px, py, 0.14, 0.6, 1, e.heading);
          }
        }
        break;
      }
      case 'hit': {
        this.spawnEffect(hit, e.x, e.y, 0.22, 0.5, 1.1);
        if (e.targetId === this.sim.player.id) {
          this.shake = Math.min(14, this.shake + 8);
          const v = this.ships.get(e.targetId);
          if (v) v.flash = 0.15;
        }
        break;
      }
      case 'blocked':
        this.spawnEffect(hit, e.x, e.y, 0.18, 0.4, 0.8, 0, 0xffe0a0);
        break;
      case 'shipDestroyed':
        this.spawnEffect(explosion, e.x, e.y, 0.6, 1.0, e.kind === 'player' ? 2.6 : 1.8);
        if (e.kind === 'player') this.shake = 16;
        break;
      case 'playerCollision':
        this.shake = Math.min(14, this.shake + 10);
        break;
      default:
        break;
    }
  }
}