import { useState, type FormEvent } from 'react';
import { OPTION_LIMITS, validateOptions, type GameOptions } from '../game/config';
import { saveOptions } from '../storage/localStore';
import './dialogs.css';

const ICON = '/assets/png/default/ui/controls';
const round2 = (n: number) => Math.round(n * 100) / 100;
const parse = (s: string) => (s.trim() === '' ? NaN : Number(s));

interface StepperProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  min: number;
  max: number;
  step: number;
  error?: string;
  autoFocus?: boolean;
  onChange: (v: string) => void;
}

/** [-] value s [+] : buttons clamp to the documented limits, typing is still validated. */
function Stepper({ id, label, hint, value, min, max, step, error, autoFocus, onChange }: StepperProps) {
  const n = parse(value);
  const valid = Number.isFinite(n);
  const nudge = (dir: 1 | -1) => {
    const base = valid ? n : dir > 0 ? min - step : max + step;
    onChange(String(round2(Math.min(max, Math.max(min, base + dir * step)))));
  };
  return (
    <div className="opt-field">
      <label className="opt-label" htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" className="round-btn" aria-label={`Decrease ${label.toLowerCase()}`} autoFocus={autoFocus}
          disabled={valid && n <= min} onClick={() => nudge(-1)}>
          <img src={`${ICON}/icon_minus.png`} alt="" />
        </button>
        <span className="stepper-value">
          <input
            id={id} className="stepper-input" type="number" inputMode="decimal" min={min} max={max} step={step}
            value={value} onChange={e => onChange(e.target.value)}
            aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          />
          <span aria-hidden="true">s</span>
        </span>
        <button type="button" className="round-btn" aria-label={`Increase ${label.toLowerCase()}`}
          disabled={valid && n >= max} onClick={() => nudge(1)}>
          <img src={`${ICON}/icon_plus.png`} alt="" />
        </button>
      </div>
      <p id={`${id}-hint`} className="opt-hint">{hint}</p>
      {error && <p id={`${id}-error`} role="alert" className="opt-error">{error}</p>}
    </div>
  );
}

interface Props {
  initial: GameOptions;
  onSaved: (o: GameOptions) => void;
  onBack: () => void;
  backLabel?: string;
  autoFocus?: boolean;
}

/** Shared by the Options screen and the pause dialog. */
export function OptionsForm({ initial, onSaved, onBack, backLabel = 'Main Menu', autoFocus = false }: Props) {
  const [duration, setDuration] = useState(String(initial.durationSec));
  const [spawn, setSpawn] = useState(String(initial.spawnIntervalSec));
  const [status, setStatus] = useState('');
  const { durationSec: d, spawnIntervalSec: s } = OPTION_LIMITS;

  const values: GameOptions = { durationSec: parse(duration), spawnIntervalSec: parse(spawn) };
  const errors = validateOptions(values);
  const invalid = Object.keys(errors).length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    const saved = saveOptions(values);
    onSaved(values);
    setStatus(saved
      ? 'Saved. Applies to your next match.'
      : 'Could not save in this browser. Applies until you reload.');
  };

  return (
    <form className="opt-form" onSubmit={submit} noValidate>
      <Stepper
        id="duration" label="Game session time" hint={`${d.min} to ${d.max} seconds of active play`}
        value={duration} min={d.min} max={d.max} step={d.step} error={errors.durationSec} autoFocus={autoFocus}
        onChange={v => { setDuration(v); setStatus(''); }}
      />
      <Stepper
        id="spawn" label="Enemy spawn time" hint={`A new enemy every ${s.min} to ${s.max} seconds`}
        value={spawn} min={s.min} max={s.max} step={s.step} error={errors.spawnIntervalSec}
        onChange={v => { setSpawn(v); setStatus(''); }}
      />
      <div className="dialog-actions">
        <button type="submit" className="wood-btn primary big" disabled={invalid}>Save</button>
        <button type="button" className="wood-btn secondary big" onClick={onBack}>{backLabel}</button>
      </div>
      <p role="status" className="opt-hint">{status}</p>
    </form>
  );
}