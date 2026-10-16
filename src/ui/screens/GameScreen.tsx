import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createConfig, type GameOptions } from '../../game/config';
import { loadGameTextures, type GameTextures } from '../../game/render/assets';
import { mountGameSession, type GameSession } from '../../game/GameSession';
import { installTestHooks, readE2EParams } from '../../game/testHooks';
import { submitMatch, toMatchRecord } from '../../api/recorder';
import { saveLastResult, type StoredMatchResult } from '../../storage/localStore';
import { Dialog } from '../Dialog';
import { PauseDialog } from '../PauseDialog';
import '../dialogs.css';
import { TouchControls } from '../TouchControls';
import { REASON_LABEL, formatTime } from '../format';

interface Props {
  options: GameOptions;
  onExit: () => void;
  onFinished: (r: StoredMatchResult) => void;
  /** Options edited from the pause menu: they only affect the next match. */
  onOptionsSaved: (o: GameOptions) => void;
}

/** Loads textures (progress + retry), then mounts the match. Leaving the screen destroys the match. */
export function GameScreen({ options, onExit, onFinished, onOptionsSaved }: Props) {
  const [textures, setTextures] = useState<GameTextures | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    loadGameTextures(p => { if (alive) setProgress(p); })
      .then(t => { if (alive) { setTextures(t); setLoadError(null); } })
      .catch(e => { if (alive) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoadError(null);
    setProgress(0);
    setAttempt(n => n + 1);
  }, []);

  if (loadError) {
    return (
      <main className="scene">
        <section className="wood-panel dialog-panel" role="alert" aria-labelledby="load-error-title">
          <h1 id="load-error-title" className="wood-title">Could not load game assets</h1>
          <p className="opt-hint">{loadError}</p>
          <div className="dialog-actions">
            <button className="wood-btn primary big" autoFocus onClick={retry}>Try again</button>
            <button className="wood-btn secondary big" onClick={onExit}>Main Menu</button>
          </div>
        </section>
      </main>
    );
  }
  if (!textures) {
    return (
      <main className="scene">
        <section className="wood-panel dialog-panel" aria-labelledby="loading-title">
          <h1 id="loading-title" className="wood-title">Loading</h1>
          <progress className="wood-progress" max={1} value={progress} aria-label="Loading game assets" />
          <p className="result-meta" role="status">{Math.round(progress * 100)}%</p>
        </section>
      </main>
    );
  }
  return <Match textures={textures} options={options} onExit={onExit} onFinished={onFinished} onOptionsSaved={onOptionsSaved} />;
}

function Match({ textures, options, onExit, onFinished, onOptionsSaved }: Props & { textures: GameTextures }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Snapshot of the options at match start: later edits only affect new matches.
  // `?e2e=1` (tests only): fixed seed, manual clock and a state/clock hook. Off in normal play.
  const [e2e] = useState(readE2EParams);
  const [config] = useState(() => createConfig(options, e2e.seed));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    let removeHooks: (() => void) | undefined;
    const mounted = mountGameSession(host, config, textures, e2e.enabled ? { manualClock: e2e.manualClock } : undefined);
    mounted.ready
      .then(s => {
        if (!alive || !s) return;
        if (e2e.enabled) removeHooks = installTestHooks(s);
        setSession(s);
      })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => {
      alive = false;
      removeHooks?.();
      mounted.dispose();
      setSession(null);
    };
  }, [config, textures, e2e]);

  // Portrait phones: pause instead of squeezing the arena.
  useEffect(() => {
    if (!session) return;
    const mq = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
    const onChange = () => { if (mq.matches) session.pause(); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [session]);

  return (
    <main className="game-screen">
      <div className="host" ref={hostRef} aria-label="Game arena" role="img" />
      {session && <MatchOverlay session={session} options={options} onExit={onExit} onFinished={onFinished} onOptionsSaved={onOptionsSaved} />}
      {error && (
        <Dialog label="Game error">
          <h2 className="wood-title">Could not start the match</h2>
          <p role="alert" className="opt-hint">{error}</p>
          <button className="wood-btn primary big" onClick={onExit}>Main Menu</button>
        </Dialog>
      )}
      <div className="rotate-hint" aria-hidden="true">Rotate your device to landscape</div>
    </main>
  );
}

function MatchOverlay({ session, options, onExit, onFinished, onOptionsSaved }: Props & { session: GameSession }) {
  const s = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const storedRef = useRef<StoredMatchResult | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // Match finished: persist once, then show the result after a short beat so the last explosion is seen.
  useEffect(() => {
    if (s.status !== 'ended') return;
    if (!storedRef.current) {
      const r = session.getResult();
      if (!r) return;
      storedRef.current = { ...r, matchId: crypto.randomUUID(), endedAt: new Date().toISOString() };
      saveLastResult(storedRef.current);
      submitMatch(toMatchRecord(storedRef.current));
    }
    const stored = storedRef.current;
    const t = window.setTimeout(() => onFinished(stored), 1300);
    return () => window.clearTimeout(t);
  }, [s.status, session, onFinished]);

  // Screen-reader announcements: state changes only, never per frame.
  useEffect(() => {
    if (s.status === 'paused') setAnnouncement('Game paused');
    else if (s.status === 'ended') setAnnouncement(`${REASON_LABEL[s.reason ?? 'time_up']}. Final score ${s.score}.`);
    else setAnnouncement('');
  }, [s.status, s.reason, s.score]);
  useEffect(() => {
    if (s.status === 'running' && (s.timeLeftSec === 30 || s.timeLeftSec === 10)) setAnnouncement(`${s.timeLeftSec} seconds left`);
  }, [s.status, s.timeLeftSec]);
  useEffect(() => {
    if (s.status === 'running' && s.score > 0) setAnnouncement(`Score ${s.score}`);
  }, [s.score, s.status]);

  const hpPct = Math.round((s.hp / s.maxHp) * 100);
  return (
    <>
      <div className="hud" role="group" aria-label="Match status">
        <span className="chip">Score <strong>{s.score}</strong></span>
        <span className="chip">Time <strong>{formatTime(s.timeLeftSec)}</strong></span>
        <span className="chip">
          Hull <strong>{s.hp}</strong>/{s.maxHp}
          <span className="hp-track" aria-hidden="true"><span className="hp-fill" style={{ width: `${hpPct}%` }} /></span>
        </span>
        <button className="btn small" onClick={() => session.pause()} disabled={s.status !== 'running'}>Pause</button>
      </div>

      <TouchControls session={session} />

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {s.status === 'paused' && (
        <PauseDialog session={session} options={options} onExit={onExit} onOptionsSaved={onOptionsSaved} />
      )}
    </>
  );
}