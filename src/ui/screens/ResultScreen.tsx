import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getVersion, statusOf, submitMatch, subscribe, toMatchRecord, type RecordStatus } from '../../api/recorder';
import type { StoredMatchResult } from '../../storage/localStore';
import { REASON_LABEL, formatTime } from '../format';

interface Props {
  result: StoredMatchResult;
  onPlayAgain: () => void;
  onMenu: () => void;
}

const STATUS_TEXT: Record<RecordStatus, string> = {
  idle: 'Not recorded yet.',
  pending: 'Waiting to be saved…',
  saving: 'Saving…',
  saved: 'Saved to the leaderboard.',
  failed: 'Could not be saved. It is kept on this device and will be retried.',
};

export function ResultScreen({ result, onPlayAgain, onMenu }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  useSyncExternalStore(subscribe, getVersion); // re-render when the save status changes
  const status = statusOf(result.matchId);
  const canRetry = status === 'failed' || status === 'idle';

  return (
    <main className="screen result">
      <h1 ref={headingRef} tabIndex={-1}>{REASON_LABEL[result.reason]}</h1>
      <section className="panel" aria-label="Match summary">
        <dl className="stats">
          <div><dt>Total score</dt><dd>{result.score}</dd></div>
          <div><dt>Time played</dt><dd>{formatTime(result.playedSec)}</dd></div>
          <div><dt>Reason</dt><dd>{REASON_LABEL[result.reason]}</dd></div>
          <div>
            <dt>Match record</dt>
            <dd role="status" aria-live="polite">{STATUS_TEXT[status]}</dd>
          </div>
        </dl>
        {canRetry && (
          <p className="row">
            <button className="btn small" onClick={() => submitMatch(toMatchRecord(result))}>
              {status === 'failed' ? 'Try again' : 'Save now'}
            </button>
          </p>
        )}
        <div className="row">
          <button className="btn primary" onClick={onPlayAgain}>Play Again</button>
          <button className="btn" onClick={onMenu}>Main Menu</button>
        </div>
      </section>
    </main>
  );
}
