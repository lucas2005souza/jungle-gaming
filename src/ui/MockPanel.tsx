import { useSyncExternalStore } from 'react';
import { changeScenario, resetMocks } from '../mocks/control';
import { SCENARIOS, getScenario, isScenarioId, subscribeScenario } from '../mocks/scenarios';

export function MockPanel() {
  const scenario = useSyncExternalStore(subscribeScenario, getScenario);
  const current = SCENARIOS.find((s) => s.id === scenario);

  return (
    <details className="mock-panel">
      <summary>Network scenario: {current?.label}</summary>
      <label htmlFor="mock-scenario">Scenario</label>
      <select id="mock-scenario" value={scenario} onChange={(e) => isScenarioId(e.target.value) && changeScenario(e.target.value)}>
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      <p className="hint">{current?.description}</p>
      <button className="btn small" onClick={resetMocks}>Reset mock data</button>
    </details>
  );
}
