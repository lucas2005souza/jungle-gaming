import { Application, type Ticker } from 'pixi.js';
import type { GameConfig } from './config';
import { Simulation } from './Simulation';
import { GameRenderer } from './render/GameRenderer';
import type { GameTextures } from './render/assets';
import { InputMux } from './input/InputMux';
import { KeyboardInput } from './input/KeyboardInput';
import type { EndReason, GameEvent, InputState, MatchResult, MatchStatus } from './types';

export interface SessionSnapshot {
  status: MatchStatus;
  score: number;
  timeLeftSec: number;
  hp: number;
  maxHp: number;
  reason: EndReason | null;
}

export interface SessionOptions {
  /** Tests: the ticker no longer advances the simulation; call `advanceBy()` instead. */
  manualClock?: boolean;
}

type Listener = () => void;

/**
 * Owns one match: Pixi Application, Simulation, input and every listener.
 * React reads it through subscribe()/getSnapshot() (useSyncExternalStore); the snapshot object only
 * changes when a displayed value changes, so React never re-renders per frame.
 */
export class GameSession {
  readonly sim: Simulation;
  private readonly app: Application;
  private readonly host: HTMLElement;
  private readonly renderer: GameRenderer;
  private readonly mux: InputMux;
  private readonly keyboard: KeyboardInput;
  private readonly resizeObserver: ResizeObserver;
  private readonly manualClock: boolean;
  private readonly listeners = new Set<Listener>();
  private snapshot: SessionSnapshot;
  private destroyed = false;

  constructor(app: Application, host: HTMLElement, config: GameConfig, textures: GameTextures, opts: SessionOptions = {}) {
    this.app = app;
    this.host = host;
    this.manualClock = opts.manualClock ?? false;
    this.sim = new Simulation(config);
    this.renderer = new GameRenderer(app, this.sim, textures);
    this.mux = new InputMux(state => this.sim.setInput(state));
    this.keyboard = new KeyboardInput(this.mux, this.togglePause);
    this.snapshot = this.readSnapshot();

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(host);
    this.handleResize();
    this.keyboard.attach();
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    this.sim.on(this.handleSimEvent);
    app.ticker.add(this.tick);
  }

  // ---- React bridge ---------------------------------------------------------

  readonly subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  readonly getSnapshot = (): SessionSnapshot => this.snapshot;

  /** Forward gameplay events (sound, analytics...) without exposing the simulation internals. */
  onEvent(l: (e: GameEvent) => void): () => void {
    return this.sim.on(l);
  }

  getResult(): MatchResult | null {
    return this.sim.getResult();
  }

  // ---- controls -----------------------------------------------------------------

  setTouchInput(patch: Partial<InputState>): void {
    this.mux.set('touch', patch);
  }

  pause(): void {
    if (this.sim.status !== 'running') return;
    this.sim.pause();
    this.mux.clear(); // held keys do not carry over the pause
    this.publish();
  }

  /** Must be called from a player action (button / key). Buffered time and input are discarded. */
  resume(): void {
    if (this.sim.status !== 'paused') return;
    this.mux.clear();
    this.sim.resume();
    this.publish();
  }

  /** Deterministic stepping for tests (works with `manualClock`). */
  advanceBy(seconds: number): void {
    this.sim.advance(seconds);
    this.publish();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    this.keyboard.detach();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    this.mux.clear();
    this.renderer.destroy();
    this.sim.dispose();
    this.listeners.clear();
    this.app.destroy({ removeView: true }, { children: true });
  }

  // ---- internals ------------------------------------------------------------------

  private readonly tick = (ticker: Ticker): void => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    const running = this.sim.status === 'running';
    if (running && !this.manualClock) this.sim.advance(dt);
    this.renderer.render(running ? dt : 0);
    this.publish();
  };

  private readonly togglePause = (): void => {
    if (this.sim.status === 'running') this.pause();
    else if (this.sim.status === 'paused') this.resume();
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.pause();
  };
  private readonly handleBlur = (): void => this.pause();

  private readonly handleSimEvent = (e: GameEvent): void => {
    if (e.type === 'ended') this.publish();
  };

  private readonly handleResize = (): void => {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(w, h);
    this.renderer.layout(w, h);
  };

  private readSnapshot(): SessionSnapshot {
    const s = this.sim;
    return {
      status: s.status,
      score: s.score,
      timeLeftSec: Math.ceil(s.timeLeft),
      hp: Math.ceil(s.player.hp),
      maxHp: s.player.maxHp,
      reason: s.endReason,
    };
  }

  private publish(): void {
    const n = this.readSnapshot();
    const o = this.snapshot;
    if (n.status === o.status && n.score === o.score && n.timeLeftSec === o.timeLeftSec && n.hp === o.hp && n.reason === o.reason) return;
    this.snapshot = n;
    this.listeners.forEach(l => l());
  }
}

export interface MountedSession {
  /** Resolves to null if disposed before PixiJS finished initialising (React Strict Mode double-mount). */
  ready: Promise<GameSession | null>;
  dispose(): void;
}

/** Async-safe factory: dispose() is valid at any moment, including mid-initialisation. */
export function mountGameSession(host: HTMLElement, config: GameConfig, textures: GameTextures, opts?: SessionOptions): MountedSession {
  let disposed = false;
  let session: GameSession | null = null;
  const ready = (async () => {
    const app = new Application();
    await app.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      background: 0x1b6f8f,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    if (disposed) {
      app.destroy({ removeView: true }, { children: true });
      return null;
    }
    app.canvas.style.display = 'block';
    host.appendChild(app.canvas);
    session = new GameSession(app, host, config, textures, opts);
    return session;
  })();
  return {
    ready,
    dispose() {
      disposed = true;
      session?.destroy();
      session = null;
    },
  };
}