import { emptyInput, type InputState } from '../types';

export class InputMux {
  private readonly sources = new Map<string, InputState>();
  private readonly apply: (state: InputState) => void;

  constructor(apply: (state: InputState) => void) {
    this.apply = apply;
  }

  set(source: string, patch: Partial<InputState>): void {
    const s = this.sources.get(source) ?? emptyInput();
    Object.assign(s, patch);
    this.sources.set(source, s);
    this.flush();
  }

  clear(): void {
    this.sources.clear();
    this.flush();
  }

  private flush(): void {
    const out = emptyInput();
    for (const s of this.sources.values()) {
      for (const k of Object.keys(out) as (keyof InputState)[]) out[k] = out[k] || s[k];
    }
    this.apply(out);
  }
}