import type { StoredMatchResult } from '../../storage/localStore';
import type { LogTab } from './LogScreen';

interface Props {
  lastResult: StoredMatchResult | null;
  onPlay: () => void;
  onOptions: () => void;
  onOpenLog: (tab: LogTab) => void;
  onViewResult: () => void;
}

const UI = '/assets/png/default/ui';

export function MainMenu({ lastResult, onPlay, onOptions, onOpenLog, onViewResult }: Props) {
  return (
    <main className="scene">
      <section className="wood-panel menu-panel" aria-labelledby="menu-title">
        <h1 id="menu-title" className="menu-title">
          <img src={`${UI}/menu/title_pirate_battle.png`} alt="Pirate Battle" />
        </h1>
        <p className="eyebrow">Set sail. Take command.</p>

        <div className="menu-actions">
          <button className="wood-btn primary big" autoFocus onClick={onPlay}>Play</button>
          <button className="wood-btn primary big" onClick={onOptions}>Options</button>
        </div>

        <img className="menu-ship" src="/assets/png/default/ships/ship_2.png" alt="" />
        <p className="tagline">Navigate the islands. Survive the battle.</p>

        <nav className="menu-links" aria-label="Leaderboards">
          <button className="wood-btn secondary small" onClick={() => onOpenLog('ranking')}>Ranking</button>
          <button className="wood-btn secondary small" onClick={() => onOpenLog('history')}>Match History</button>
        </nav>

        {lastResult && (
          <button className="link-btn" onClick={onViewResult}>Last result · {lastResult.score} pts</button>
        )}

        <details className="controls-details">
          <summary>Controls</summary>
          <table className="controls">
            <thead><tr><th scope="col">Action</th><th scope="col">Keyboard</th><th scope="col">Touch</th></tr></thead>
            <tbody>
              <tr><th scope="row">Sail forward</th><td><kbd>W</kbd> <kbd>↑</kbd></td><td>▲ button</td></tr>
              <tr><th scope="row">Rotate</th><td><kbd>A</kbd><kbd>D</kbd> <kbd>←</kbd><kbd>→</kbd></td><td>◄ ► buttons</td></tr>
              <tr><th scope="row">Fire front</th><td><kbd>Space</kbd></td><td>● button</td></tr>
              <tr><th scope="row">Broadside left / right</th><td><kbd>Q</kbd> / <kbd>E</kbd></td><td>◄● / ●► buttons</td></tr>
              <tr><th scope="row">Pause</th><td><kbd>P</kbd> <kbd>Esc</kbd></td><td>Pause button</td></tr>
            </tbody>
          </table>
          <p className="hint">You can sail and fire at the same time. On phones, play in landscape.</p>
        </details>
      </section>
      <img className="brand" src="/assets/logo_jungle_gaming.svg" alt="Jungle Gaming" />
    </main>
  );
}
