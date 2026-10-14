import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GameOptions } from '../../game/config';
import { PLAYER_NAME } from '../../player';
import type { StoredMatchResult } from '../../storage/localStore';
import { RESULT_LABEL, formatClock, formatLogDate } from '../format';

export type LogTab = 'ranking' | 'history';
const TABS: { id: LogTab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];
const PAGE_SIZE = 5;
const CONTROLS = '/assets/png/default/ui/controls';

interface Props {
  initialTab: LogTab;
  options: GameOptions;
  history: StoredMatchResult[];
  onBack: () => void;
}

export function LogScreen({ initialTab, options, history, onBack }: Props) {
  const [tab, setTab] = useState<LogTab>(initialTab);
  const [page, setPage] = useState(0);
  const tabRefs = useRef<Record<LogTab, HTMLButtonElement | null>>({ ranking: null, history: null });
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => titleRef.current?.focus(), []);

  const select = (next: LogTab) => { setTab(next); setPage(0); };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next: LogTab = tab === 'ranking' ? 'history' : 'ranking';
    select(next);
    tabRefs.current[next]?.focus();
  };

  // The ranking has no data source yet, so it always shows its empty state.
  const total = tab === 'history' ? history.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = history.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <main className="scene">
      <section className="wood-panel log-panel" aria-labelledby="log-title">
        <h1 id="log-title" ref={titleRef} tabIndex={-1} className="log-title">Captain's Log</h1>

        <div role="tablist" aria-label="Captain's Log sections" className="log-tabs" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="log-panel"
              tabIndex={tab === t.id ? 0 : -1}
              className={`wood-btn small ${tab === t.id ? 'primary' : 'secondary'}`}
              onClick={() => select(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="log-panel" aria-labelledby={`tab-${tab}`}>
          <p className="log-sub">
            {tab === 'history'
              ? `${PLAYER_NAME} · your recent battles`
              : `${options.durationSec} second battles · ${options.spawnIntervalSec} second spawn interval`}
          </p>

          <div className="log-table-wrap">
            {tab === 'history' ? (
              <table className="log-table history">
                <thead>
                  <tr><th scope="col">Date</th><th scope="col">Points</th><th scope="col">Duration</th><th scope="col">Result</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const d = formatLogDate(r.endedAt);
                    const isLatest = current === 0 && i === 0;
                    return (
                      <tr key={r.matchId} className={isLatest ? 'latest' : undefined}>
                        <td><time dateTime={r.endedAt}><span className="strong">{d.day}</span> <span className="muted">· {d.time}</span></time></td>
                        <td className="points">{r.score}</td>
                        <td className="strong">{formatClock(r.playedSec)}</td>
                        <td className={`result ${r.reason === 'time_up' ? 'win' : 'loss'}`}>{RESULT_LABEL[r.reason]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="log-table ranking">
                <thead>
                  <tr><th scope="col">Rank</th><th scope="col">Captain</th><th scope="col">Points</th><th scope="col">Played</th></tr>
                </thead>
              </table>
            )}
            {total === 0 && (
              <p className="log-empty" role="status">
                {tab === 'history'
                  ? 'No battles yet. Finish a match and it will be logged here.'
                  : 'The leaderboard is not connected yet. Rankings will appear here.'}
              </p>
            )}
          </div>
        </div>

        <div className="pager">
          <button className="round-btn" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <img src={`${CONTROLS}/icon_turn_left.png`} alt="" />
          </button>
          <span className="pager-label" aria-live="polite">Page {current + 1} of {pageCount}</span>
          <button className="round-btn" aria-label="Next page" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
            <img src={`${CONTROLS}/icon_turn_right.png`} alt="" />
          </button>
        </div>

        <button className="wood-btn primary big" onClick={onBack}>Main Menu</button>
      </section>
      <img className="brand" src="/assets/logo_jungle_gaming.svg" alt="Jungle Gaming" />
    </main>
  );
}
