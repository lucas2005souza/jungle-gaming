export function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const REASON_LABEL = {
  time_up: 'Time is up',
  player_destroyed: 'Ship destroyed',
} as const;