import { useEffect, useRef } from 'react';
import type { GameOptions } from '../../game/config';
import { OptionsForm } from '../OptionsForm';

interface Props {
  initial: GameOptions;
  onSaved: (o: GameOptions) => void;
  onBack: () => void;
}

export function OptionsScreen({ initial, onSaved, onBack }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  return (
    <main className="scene">
      <section className="wood-panel options-panel" aria-labelledby="options-title">
        <h1 id="options-title" ref={titleRef} tabIndex={-1} className="wood-title">Options</h1>
        <OptionsForm initial={initial} onSaved={onSaved} onBack={onBack} />
      </section>
      <img className="brand" src="/assets/logo_jungle_gaming.svg" alt="Jungle Gaming" />
    </main>
  );
}