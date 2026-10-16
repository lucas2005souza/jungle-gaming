import { queryClient } from '../api/queryClient';
import { flushAll, resetRecorder } from '../api/recorder';
import { resetDb } from './db';
import { setScenario, type ScenarioId } from './scenarios';

export function changeScenario(id: ScenarioId): void {
  setScenario(id);
  void queryClient.invalidateQueries();
  flushAll();
}

export function resetMocks(): void {
  resetDb();
  resetRecorder();
  setScenario('success');
  queryClient.removeQueries();
  void queryClient.invalidateQueries();
}
