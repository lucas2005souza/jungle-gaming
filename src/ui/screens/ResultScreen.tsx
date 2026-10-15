import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getVersion, statusOf, submitMatch, subscribe, toMatchRecord, type RecordStatus } from '../../api/recorder';
import type { StoredMatchResult } from '../../storage/localStore';
import { REASON_LABEL, formatClock } from '../format';
import '../dialogs.css';

interface Props {
  result: StoredMatchResult;
  onPlayAgain: () => void;
  onMenu: () => void;
}

const TITLE = { time_up: 'Battle complete', player_destroyed: 'Ship sunk' } as const;

const STATUS_TEXT: Record<RecordStatus, string> = {
  idle: 'Not recorded yet',
  pending: 'Waiting to be saved…',
  saving: 'Saving…',
  saved: 'Saved to the leaderboard',
  failed: 'Not saved yet. It is kept on this device and will be retried.',
};

export function ResultScreen({ result, onPlayAgain, onMenu }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  useSyncExternalStore(subscribe, getVersion); // re-render when the save status changes
  const status = statusOf(result.matchId);
  const canRetry = status === 'failed' || status === 'idle';

  return (
    <main className="scene">
      <section className="wood-panel result-panel" aria-labelledby="result-title">
        <h1 id="result-title" ref={headingRef} tabIndex={-1} className="wood-title">{TITLE[result.reason]}</h1>

        {/* Screen readers get the full sentence; sighted players get the compact arcade layout. */}
        <dl className="sr-only">
          <dt>Total score</dt><dd>{result.score}</dd>
          <dt>Time played</dt><dd>{formatClock(result.playedSec)}</dd>
          <dt>Reason</dt><dd>{REASON_LABEL[result.reason]}</dd>
        </dl>
        <p className="result-score" data-testid="result-score" aria-hidden="true">{result.score}</p>
        <p className="result-meta" aria-hidden="true">
          Points · <span data-testid="result-time">{formatClock(result.playedSec)}</span> · <span data-testid="result-reason">{REASON_LABEL[result.reason]}</span>
        </p>

        <p className="record" data-testid="record-status" data-status={status} role="status" aria-live="polite">
          {STATUS_TEXT[status]}
        </p>
        {canRetry && (
          <button className="wood-btn secondary small" onClick={() => submitMatch(toMatchRecord(result))}>
            {status === 'failed' ? 'Try again' : 'Save now'}
          </button>
        )}

        <div className="dialog-actions">
          <button className="wood-btn primary big" onClick={onPlayAgain}>Play Again</button>
          <button className="wood-btn primary big" onClick={onMenu}>Main Menu</button>
        </div>
      </section>
      <img className="brand" src="/assets/logo_jungle_gaming.svg" alt="Jungle Gaming" />
    </main>
  );
}