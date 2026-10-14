import { useCallback, useState } from 'react';
import type { GameOptions } from './game/config';
import { loadLastResult, loadOptions, type StoredMatchResult } from './storage/localStore';
import { MainMenu } from './ui/screens/MainMenu';
import { OptionsScreen } from './ui/screens/OptionsScreen';
import { GameScreen } from './ui/screens/GameScreen';
import { ResultScreen } from './ui/screens/ResultScreen';

type Screen =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'game'; runId: number }
  | { name: 'result'; result: StoredMatchResult };   
export default function App() {
  const [options, setOptions] = useState<GameOptions>(loadOptions);
  const [lastResult, setLastResult] = useState<StoredMatchResult | null>(loadLastResult);
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });

  const toMenu = useCallback(() => setScreen({ name: 'menu' }), []);
  const play = useCallback(() => setScreen({ name: 'game', runId: Date.now() }), []);
  const finished = useCallback((r: StoredMatchResult) => {
    setLastResult(r);
    setScreen({ name: 'result', result: r });
  }, []);

  switch (screen.name) {
    case 'options':
      return <OptionsScreen initial={options} onSaved={setOptions} onBack={toMenu} />;
    case 'game':
      return <GameScreen key={screen.runId} options={options} onExit={toMenu} onFinished={finished} />;
    case 'result':
      return <ResultScreen result={screen.result} onPlayAgain={play} onMenu={toMenu} />;
    default:
      return (
        <MainMenu
          lastResult={lastResult}
          onPlay={play}
          onOptions={() => setScreen({ name: 'options' })}
          onViewResult={() => lastResult && setScreen({ name: 'result', result: lastResult })}
        />
      );
  }
}