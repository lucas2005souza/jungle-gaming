import { useRef, useState, type KeyboardEvent } from 'react';
import type { StoredMatchResult } from '../../storage/localStore';
import { REASON_LABEL } from '../format';

type Tab = 'ranking' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

interface Props {
  lastResult: StoredMatchResult | null;
  onPlay: () => void;
  onOptions: () => void;
  onViewResult: () => void;
}

export function MainMenu({ lastResult, onPlay, onOptions, onViewResult }: Props) {
  const [tab, setTab] = useState<Tab>('ranking');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ ranking: null, history: null });

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next: Tab = tab === 'ranking' ? 'history' : 'ranking';
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <main className="screen menu">
      <header className="menu-head">
        <img src="/assets/logo_jungle_gaming.svg" alt="" className="logo" />
        <h1>Pirate Battle</h1>
      </header>

      <div className="menu-actions">
        <button className="btn primary" autoFocus onClick={onPlay}>Play</button>
        <button className="btn" onClick={onOptions}>Options</button>
        {lastResult && <button className="btn ghost" onClick={onViewResult}>Last result ({lastResult.score} pts)</button>}
      </div>

      <div className="menu-grid">
        <section className="panel" aria-labelledby="controls-title">
          <h2 id="controls-title">Controls</h2>
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
        </section>

        <section className="panel" aria-label="Leaderboards">
          <div role="tablist" aria-label="Leaderboards" className="tabs" onKeyDown={onTabKey}>
            {TABS.map(t => (
              <button
                key={t.id}
                ref={el => { tabRefs.current[t.id] = el; }}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className={`tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel" tabIndex={0}>
            {/* Replaced by the TanStack Query powered lists in the ranking/history step. */}
            <p className="hint">
              {tab === 'ranking' ? 'The leaderboard will appear here.' : 'Your finished matches will appear here.'}
            </p>
            {lastResult && tab === 'history' && (
              <p>Latest local match: {lastResult.score} pts, {REASON_LABEL[lastResult.reason]}.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}