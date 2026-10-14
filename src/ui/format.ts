export function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const REASON_LABEL = {
  time_up: 'Time is up',
  player_destroyed: 'Ship destroyed',
} as const;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const two = (n: number) => String(n).padStart(2, '0');

/** mm:ss with leading zeros, as shown in the Captain's Log ("02:00"). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

/** "08 SEP" + "19:36" in local time; locale independent so the label never changes between machines. */
export function formatLogDate(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '--', time: '--:--' };
  return { day: `${two(d.getDate())} ${MONTHS[d.getMonth()] ?? '---'}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
}

export const RESULT_LABEL = { time_up: 'Time up', player_destroyed: 'Defeated' } as const;
