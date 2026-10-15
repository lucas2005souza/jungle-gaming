import { useCallback, useState } from 'react';
import type { GameOptions } from './game/config';
import { loadLastResult, loadOptions, type StoredMatchResult } from './storage/localStore';
import { MockPanel } from './ui/MockPanel';
import { GameScreen } from './ui/screens/GameScreen';
import { LogScreen, type LogTab } from './ui/screens/LogScreen';
import { MainMenu } from './ui/screens/MainMenu';
import { OptionsScreen } from './ui/screens/OptionsScreen';
import { ResultScreen } from './ui/screens/ResultScreen';

type Screen =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'log'; tab: LogTab }
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

  let content;
  switch (screen.name) {
    case 'options':
      content = <OptionsScreen initial={options} onSaved={setOptions} onBack={toMenu} />;
      break;
    case 'log':
      content = <LogScreen initialTab={screen.tab} options={options} onBack={toMenu} />;
      break;
    case 'game':
      content = <GameScreen key={screen.runId} options={options} onExit={toMenu} onFinished={finished} onOptionsSaved={setOptions} />;
      break;
    case 'result':
      content = <ResultScreen result={screen.result} onPlayAgain={play} onMenu={toMenu} />;
      break;
    default:
      content = (
        <MainMenu
          lastResult={lastResult}
          onPlay={play}
          onOptions={() => setScreen({ name: 'options' })}
          onOpenLog={(tab) => setScreen({ name: 'log', tab })}
          onViewResult={() => lastResult && setScreen({ name: 'result', result: lastResult })}
        />
      );
  }

  return (
    <>
      {content}
      {screen.name !== 'game' && <MockPanel />}
    </>
  );
}