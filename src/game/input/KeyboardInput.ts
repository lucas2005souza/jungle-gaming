import type { InputState } from '../types';
import type { InputMux } from './InputMux';

const KEY_MAP: Record<string, keyof InputState> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyA: 'turnLeft', ArrowLeft: 'turnLeft',
  KeyD: 'turnRight', ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
};
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);

/** Captures game keys only between attach() and detach(), i.e. while a session is alive. */
export class KeyboardInput {
  private readonly mux: InputMux;
  private readonly onPauseKey: () => void;
  private attached = false;

  constructor(mux: InputMux, onPauseKey: () => void) {
    this.mux = mux;
    this.onPauseKey = onPauseKey;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (PAUSE_KEYS.has(e.code)) {
      // Typing in a form field (e.g. the Options inputs) must not toggle the pause.
      if (e.code === 'KeyP' && (e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
      if (!e.repeat) this.onPauseKey();
      e.preventDefault();
      return;
    }
    const action = KEY_MAP[e.code];
    if (!action) return;
    // Let dialogs and form controls keep Space/arrows (e.g. activating a focused button).
    if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"], input, select, textarea')) return;
    e.preventDefault();
    this.mux.set('keyboard', { [action]: true });
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.mux.set('keyboard', { [action]: false });
  };
}