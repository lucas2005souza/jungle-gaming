import { useEffect, useRef } from 'react';
import type { StoredMatchResult } from '../../storage/localStore';
import { REASON_LABEL, formatTime } from '../format';

interface Props {
  result: StoredMatchResult;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function ResultScreen({ result, onPlayAgain, onMenu }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <main className="screen result">
      <h1 ref={headingRef} tabIndex={-1}>{REASON_LABEL[result.reason]}</h1>
      <section className="panel" aria-label="Match summary">
        <dl className="stats">
          <div><dt>Total score</dt><dd>{result.score}</dd></div>
          <div><dt>Time played</dt><dd>{formatTime(result.playedSec)}</dd></div>
          <div><dt>Reason</dt><dd>{REASON_LABEL[result.reason]}</dd></div>
          <div><dt>Match record</dt><dd>Not recorded (leaderboard service not connected yet)</dd></div>
        </dl>
        <div className="row">
          <button className="btn primary" onClick={onPlayAgain}>Play Again</button>
          <button className="btn" onClick={onMenu}>Main Menu</button>
        </div>
      </section>
    </main>
  );
}