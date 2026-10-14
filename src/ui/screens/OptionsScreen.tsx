import { useRef, useState, type FormEvent } from 'react';
import { OPTION_LIMITS, validateOptions, type GameOptions } from '../../game/config';
import { saveOptions } from '../../storage/localStore';

interface Props {
  initial: GameOptions;
  onSaved: (o: GameOptions) => void;
  onBack: () => void;
}

export function OptionsScreen({ initial, onSaved, onBack }: Props) {
  const [duration, setDuration] = useState(String(initial.durationSec));
  const [spawn, setSpawn] = useState(String(initial.spawnIntervalSec));
  const [status, setStatus] = useState<string>('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const parse = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const values: GameOptions = { durationSec: parse(duration), spawnIntervalSec: parse(spawn) };
  const errors = validateOptions(values);
  const invalid = Object.keys(errors).length > 0;
  const { durationSec: d, spawnIntervalSec: s } = OPTION_LIMITS;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    if (saveOptions(values)) {
      onSaved(values);
      setStatus('Options saved. They apply to your next match.');
    } else {
      setStatus('Could not save options in this browser. They will apply until you reload.');
      onSaved(values);
    }
  };

  return (
    <main className="screen options">
      <h1 ref={headingRef}>Options</h1>
      <form className="panel form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="duration">Game session time (seconds)</label>
          <input
            id="duration" type="number" inputMode="numeric" min={d.min} max={d.max} step={d.step}
            value={duration} onChange={e => { setDuration(e.target.value); setStatus(''); }}
            aria-invalid={Boolean(errors.durationSec)}
            aria-describedby={`duration-hint ${errors.durationSec ? 'duration-error' : ''}`}
          />
          <p id="duration-hint" className="hint">Between {d.min} and {d.max} seconds of active play.</p>
          {errors.durationSec && <p id="duration-error" role="alert" className="error">{errors.durationSec}</p>}
        </div>

        <div className="field">
          <label htmlFor="spawn">Enemy spawn time (seconds)</label>
          <input
            id="spawn" type="number" inputMode="decimal" min={s.min} max={s.max} step={s.step}
            value={spawn} onChange={e => { setSpawn(e.target.value); setStatus(''); }}
            aria-invalid={Boolean(errors.spawnIntervalSec)}
            aria-describedby={`spawn-hint ${errors.spawnIntervalSec ? 'spawn-error' : ''}`}
          />
          <p id="spawn-hint" className="hint">A new enemy appears every {s.min} to {s.max} seconds. Lower is harder.</p>
          {errors.spawnIntervalSec && <p id="spawn-error" role="alert" className="error">{errors.spawnIntervalSec}</p>}
        </div>

        <div className="row">
          <button type="submit" className="btn primary" disabled={invalid}>Save</button>
          <button type="button" className="btn" onClick={onBack}>Back to menu</button>
        </div>
        <p role="status" className="hint">{status}</p>
      </form>
    </main>
  );
}