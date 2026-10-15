import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { describeError } from '../../api/client';
import { useHistory, useRanking } from '../../api/queries';
import type { GameOptions } from '../../game/config';
import { PLAYER_ID, PLAYER_NAME } from '../../player';
import { RESULT_LABEL, formatClock, formatLogDate } from '../format';

export type LogTab = 'ranking' | 'history';
const TABS: { id: LogTab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];
const UI = '/assets/png/default/ui';

interface Props {
  initialTab: LogTab;
  options: GameOptions;
  onBack: () => void;
}

export function LogScreen({ initialTab, options, onBack }: Props) {
  const [tab, setTab] = useState<LogTab>(initialTab);
  const [page, setPage] = useState(0); // zero-based; reset when the tab changes
  const tabRefs = useRef<Record<LogTab, HTMLButtonElement | null>>({ ranking: null, history: null });
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  // Both hooks are always called (rules of hooks); only the visible tab is enabled.
  const ranking = useRanking(options, page, tab === 'ranking');
  const history = useHistory(page, tab === 'history');
  const q = tab === 'ranking' ? ranking : history;

  const select = (next: LogTab) => { setTab(next); setPage(0); };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next: LogTab = tab === 'ranking' ? 'history' : 'ranking';
    select(next);
    tabRefs.current[next]?.focus();
  };

  const data = q.data;
  const pageCount = data?.pageCount ?? 1;
  const current = data ? data.page - 1 : page;
  const refreshing = q.isFetching && !q.isPending;

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

        <div role="tabpanel" id="log-panel" aria-labelledby={`tab-${tab}`} aria-busy={q.isPending}>
          <p className="log-sub">
            {tab === 'history'
              ? `${PLAYER_NAME} · your recent battles`
              : `${options.durationSec} second battles · ${options.spawnIntervalSec} second spawn interval`}
            {refreshing && <span className="refreshing"> · updating…</span>}
          </p>

          <div className="log-table-wrap">
            {tab === 'history' ? (
              <table className="log-table history">
                <thead>
                  <tr><th scope="col">Date</th><th scope="col">Points</th><th scope="col">Duration</th><th scope="col">Result</th></tr>
                </thead>
                <tbody>
                  {history.data?.items.map((r, i) => {
                    const d = formatLogDate(r.playedAt);
                    return (
                      <tr key={r.id} className={current === 0 && i === 0 ? 'latest' : undefined}>
                        <td><time dateTime={r.playedAt}><span className="strong">{d.day}</span> <span className="muted">· {d.time}</span></time></td>
                        <td className="points">{r.score}</td>
                        <td className="strong">{formatClock(r.durationSec)}</td>
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
                <tbody>
                  {ranking.data?.items.map((r) => {
                    const d = formatLogDate(r.playedAt);
                    const you = r.playerId === PLAYER_ID;
                    return (
                      <tr key={r.id} className={you ? 'latest' : undefined}>
                        <td className="strong">{String(r.rank).padStart(2, '0')}</td>
                        <td className="strong">
                          {r.rank === 1 && <img className="star" src={`${UI}/hud/icon_score.png`} alt="First place" />}
                          {r.playerName}
                          {you && <span className="you">You</span>}
                        </td>
                        <td className="points">{r.score}</td>
                        <td><time dateTime={r.playedAt} className="muted">{d.day} · {d.time}</time></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {q.isPending && <p className="log-state" role="status">Loading…</p>}
            {q.isError && (
              <div className="log-state error-box" role="alert">
                <p>{tab === 'ranking' ? 'Could not load the ranking.' : 'Could not load your match history.'} {describeError(q.error)}</p>
                <button className="wood-btn secondary small" onClick={() => void q.refetch()}>Try again</button>
              </div>
            )}
            {data && data.total === 0 && !q.isError && (
              <p className="log-state" role="status">
                {tab === 'history'
                  ? 'No battles yet. Finish a match and it will be logged here.'
                  : `No captain has played ${options.durationSec}-second battles with a ${options.spawnIntervalSec}-second spawn interval yet. Finish a match with these options to start this leaderboard.`}
              </p>
            )}
          </div>
        </div>

        <div className="pager">
          <button className="round-btn" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <img src={`${UI}/controls/icon_turn_left.png`} alt="" />
          </button>
          <span className="pager-label" aria-live="polite">Page {current + 1} of {pageCount}</span>
          <button className="round-btn" aria-label="Next page" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
            <img src={`${UI}/controls/icon_turn_right.png`} alt="" />
          </button>
        </div>

        <button className="wood-btn primary big" onClick={onBack}>Main Menu</button>
      </section>
      <img className="brand" src="/assets/logo_jungle_gaming.svg" alt="Jungle Gaming" />
    </main>
  );
}
