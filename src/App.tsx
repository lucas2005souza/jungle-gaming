import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createConfig, DEFAULT_OPTIONS } from './game/config';
import { loadGameTextures, type GameTextures } from './game/render/assets';
import { mountGameSession, type GameSession } from './game/GameSession';

/**
 * TEMPORARY dev harness: proves the Pixi renderer + simulation + lifecycle end to end.
 * Replaced by the real menu / options / result screens in the next step.
 */

function Hud({ session, onRestart }: { session: GameSession; onRestart: () => void }) {
  const s = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return (
    <>
      <div className="hud" aria-live="off">
        <span>Score {s.score}</span>
        <span>Time {s.timeLeftSec}s</span>
        <span>HP {s.hp}/{s.maxHp}</span>
        <button onClick={() => session.pause()}>Pause</button>
      </div>
      {s.status === 'paused' && (
        <div className="overlay" role="dialog" aria-label="Paused">
          <h2>Paused</h2>
          <button autoFocus onClick={() => session.resume()}>Resume</button>
        </div>
      )}
      {s.status === 'ended' && (
        <div className="overlay" role="dialog" aria-label="Match over">
          <h2>{s.reason === 'time_up' ? 'Time is up' : 'Ship destroyed'}</h2>
          <p>Score: {s.score}</p>
          <button autoFocus onClick={onRestart}>Play again</button>
        </div>
      )}
      <p className="help">W/↑ sail · A/D or ←/→ turn · Space fire · Q/E broadside · P pause</p>
    </>
  );
}

function Game({ textures, onRestart }: { textures: GameTextures; onRestart: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    const mounted = mountGameSession(host, createConfig(DEFAULT_OPTIONS), textures);
    mounted.ready
      .then(s => { if (alive && s) setSession(s); })
      .catch(e => { if (alive) setError(String(e)); });
    return () => {
      alive = false;
      mounted.dispose();
    };
  }, [textures]);

  return (
    <div className="stage">
      <div className="host" ref={hostRef} />
      {session && <Hud session={session} onRestart={onRestart} />}
      {error && <p role="alert" className="overlay">Could not start the game: {error}</p>}
    </div>
  );
}

export default function App() {
  const [textures, setTextures] = useState<GameTextures | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);

  const load = useCallback(() => {
    setLoadError(null);
    setProgress(0);
    loadGameTextures(setProgress).then(setTextures).catch(e => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loadError) {
    return (
      <div className="center" role="alert">
        <p>{loadError}</p>
        <button onClick={load}>Retry</button>
      </div>
    );
  }
  if (!textures) {
    return (
      <div className="center">
        <progress max={1} value={progress} aria-label="Loading assets" />
        <p>Loading… {Math.round(progress * 100)}%</p>
      </div>
    );
  }
  return <Game key={runId} textures={textures} onRestart={() => setRunId(n => n + 1)} />;
}