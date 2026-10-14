import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createConfig, type GameOptions } from '../../game/config';
import { loadGameTextures, type GameTextures } from '../../game/render/assets';
import { mountGameSession, type GameSession } from '../../game/GameSession';
import { saveLastResult, type StoredMatchResult } from '../../storage/localStore';
import { Dialog } from '../Dialog';
import { TouchControls } from '../TouchControls';
import { REASON_LABEL, formatTime } from '../format';

interface Props {
  options: GameOptions;
  onExit: () => void;
  onFinished: (r: StoredMatchResult) => void;
}

/** Loads textures (progress + retry), then mounts the match. Leaving the screen destroys the match. */
export function GameScreen({ options, onExit, onFinished }: Props) {
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
      <main className="screen center">
        <div className="panel" role="alert">
          <h1>Could not load game assets</h1>
          <p>{loadError}</p>
          <div className="row">
            <button className="btn primary" autoFocus onClick={retry}>Try again</button>
            <button className="btn" onClick={onExit}>Main Menu</button>
          </div>
        </div>
      </main>
    );
  }
  if (!textures) {
    return (
      <main className="screen center">
        <div className="panel">
          <h1>Loading</h1>
          <progress max={1} value={progress} aria-label="Loading game assets" />
          <p role="status">{Math.round(progress * 100)}%</p>
        </div>
      </main>
    );
  }
  return <Match textures={textures} options={options} onExit={onExit} onFinished={onFinished} />;
}

function Match({ textures, options, onExit, onFinished }: Props & { textures: GameTextures }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Snapshot of the options at match start: later edits only affect new matches.
  const [config] = useState(() => createConfig(options));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    const mounted = mountGameSession(host, config, textures);
    mounted.ready
      .then(s => { if (alive && s) setSession(s); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => {
      alive = false;
      mounted.dispose();
      setSession(null);
    };
  }, [config, textures]);

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
      {session && <MatchOverlay session={session} onExit={onExit} onFinished={onFinished} />}
      {error && (
        <Dialog label="Game error">
          <h2>Could not start the match</h2>
          <p role="alert">{error}</p>
          <button className="btn primary" onClick={onExit}>Main Menu</button>
        </Dialog>
      )}
      <div className="rotate-hint" aria-hidden="true">Rotate your device to landscape</div>
    </main>
  );
}

function MatchOverlay({ session, onExit, onFinished }: { session: GameSession; onExit: () => void; onFinished: (r: StoredMatchResult) => void }) {
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
        <Dialog label="Game paused">
          <h2>Paused</h2>
          <p className="hint">The match is frozen. Controls pressed while paused are ignored.</p>
          <div className="row">
            <button className="btn primary" onClick={() => session.resume()}>Resume</button>
            <button className="btn" onClick={onExit}>Quit to menu</button>
          </div>
        </Dialog>
      )}
    </>
  );
}