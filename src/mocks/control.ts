import { queryClient } from '../api/queryClient';
import { flushAll, resetRecorder } from '../api/recorder';
import { resetDb } from './db';
import { setScenario, type ScenarioId } from './scenarios';

/** Switching scenario refetches everything and re-sends unsaved matches (the "recovery" case). */
export function changeScenario(id: ScenarioId): void {
  setScenario(id);
  void queryClient.invalidateQueries();
  flushAll();
}

/** Back to the initial state: no stored matches, no pending queue, scenario "success". */
export function resetMocks(): void {
  resetDb();
  resetRecorder();
  setScenario('success');
  queryClient.removeQueries();
  void queryClient.invalidateQueries();
}
