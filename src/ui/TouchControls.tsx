import { useRef } from 'react';
import type { GameSession } from '../game/GameSession';
import type { InputState } from '../game/types';

type Action = keyof InputState;
const ALL_ACTIONS: Action[] = ['forward', 'turnLeft', 'turnRight', 'fireFront', 'fireLeft', 'fireRight'];

/** A button that holds one or more actions while it is pressed (the diagonals hold forward + a turn). */
function HoldButton({ id, actions, label, text, className, onHold }: {
  id: string; actions: Action[]; label: string; text: string; className: string;
  onHold: (id: string, actions: Action[], down: boolean) => void;
}) {
  const press = (down: boolean) => onHold(id, actions, down);
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
  // What each pressed button is holding. The input sent to the game is the union of all of them, so
  // releasing the diagonal while still holding "forward" (or the other way round) keeps the ship sailing.
  const held = useRef(new Map<string, Action[]>());

  const onHold = (id: string, actions: Action[], down: boolean) => {
    if (down) held.current.set(id, actions);
    else if (!held.current.delete(id)) return;
    const patch = Object.fromEntries(ALL_ACTIONS.map(a => [a, false])) as Record<Action, boolean>;
    for (const list of held.current.values()) for (const a of list) patch[a] = true;
    session.setTouchInput(patch);
  };

  const common = { onHold };
  return (
    <div className="touch" aria-label="Touch controls">
      <div className="touch-left">
        <HoldButton {...common} id="turnLeft" actions={['turnLeft']} label="Turn left" text="◄" className="t-turn" />
        <HoldButton {...common} id="diagLeft" actions={['forward', 'turnLeft']} label="Sail diagonally left" text="↖" className="t-diag" />
        <HoldButton {...common} id="forward" actions={['forward']} label="Sail forward" text="▲" className="t-fwd" />
        <HoldButton {...common} id="diagRight" actions={['forward', 'turnRight']} label="Sail diagonally right" text="↗" className="t-diag" />
        <HoldButton {...common} id="turnRight" actions={['turnRight']} label="Turn right" text="►" className="t-turn" />
      </div>
      <div className="touch-right">
        <HoldButton {...common} id="fireLeft" actions={['fireLeft']} label="Fire left side" text="◄●" className="t-side" />
        <HoldButton {...common} id="fireFront" actions={['fireFront']} label="Fire front" text="●" className="t-fire" />
        <HoldButton {...common} id="fireRight" actions={['fireRight']} label="Fire right side" text="●►" className="t-side" />
      </div>
    </div>
  );
}