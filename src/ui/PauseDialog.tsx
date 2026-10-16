import { useState } from 'react';
import type { GameSession } from '../game/GameSession';
import type { GameOptions } from '../game/config';
import { Dialog } from './Dialog';
import { OptionsForm } from './OptionsForm';
import './dialogs.css';

interface Props {
  session: GameSession;
  options: GameOptions;
  onExit: () => void;
  onOptionsSaved: (o: GameOptions) => void;
}


export function PauseDialog({ session, options, onExit, onOptionsSaved }: Props) {
  const [view, setView] = useState<'menu' | 'options'>('menu');

  if (view === 'options') {
    return (
      <Dialog label="Options">
        <h2 className="wood-title">Options</h2>
        <OptionsForm initial={options} onSaved={onOptionsSaved} onBack={() => setView('menu')} backLabel="Back" autoFocus />
        <p className="opt-hint">The current match keeps its settings.</p>
      </Dialog>
    );
  }
  return (
    <Dialog label="Game paused">
      <h2 className="wood-title">Paused</h2>
      <p className="result-meta">Ready when you are.</p>
      <div className="dialog-actions">
        <button className="wood-btn primary big" autoFocus onClick={() => session.resume()}>Resume</button>
        <button className="wood-btn primary big" onClick={() => setView('options')}>Options</button>
        <button className="wood-btn primary big" onClick={onExit}>Main Menu</button>
      </div>
    </Dialog>
  );
}