import type { GameSession } from '../game/GameSession';
import type { InputState } from '../game/types';

function HoldButton({ session, action, label, text, className }: {
  session: GameSession; action: keyof InputState; label: string; text: string; className: string;
}) {
  const press = (down: boolean) => session.setTouchInput({ [action]: down });
  return (
    <button
      type="button"
      className={`tbtn ${className}`}
      aria-label={label}
      onPointerDown={e => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onLostPointerCapture={() => press(false)}
      onContextMenu={e => e.preventDefault()}
    >
      {text}
    </button>
  );
}

export function TouchControls({ session }: { session: GameSession }) {
  return (
    <div className="touch" aria-label="Touch controls">
      <div className="touch-left">
        <HoldButton session={session} action="turnLeft" label="Turn left" text="◄" className="t-turn" />
        <HoldButton session={session} action="forward" label="Sail forward" text="▲" className="t-fwd" />
        <HoldButton session={session} action="turnRight" label="Turn right" text="►" className="t-turn" />
      </div>
      <div className="touch-right">
        <HoldButton session={session} action="fireLeft" label="Fire left side" text="◄●" className="t-side" />
        <HoldButton session={session} action="fireFront" label="Fire front" text="●" className="t-fire" />
        <HoldButton session={session} action="fireRight" label="Fire right side" text="●►" className="t-side" />
      </div>
    </div>
  );
}