import type { EventDay } from '@feria/shared';

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('es-GT', { weekday: 'short', timeZone: 'UTC' });
const WEEKDAY_LONG_FORMAT = new Intl.DateTimeFormat('es-GT', { weekday: 'long', timeZone: 'UTC' });
const MONTH_FORMAT = new Intl.DateTimeFormat('es-GT', { month: 'short', timeZone: 'UTC' });
const MONTH_LONG_FORMAT = new Intl.DateTimeFormat('es-GT', { month: 'long', timeZone: 'UTC' });

// Event dates are plain calendar days ("2026-03-12"), so they are formatted in UTC to keep
// the visitor's own timezone from shifting them by one.
function parts(date: string) {
  const instant = new Date(`${date}T00:00:00.000Z`);
  // Some locales abbreviate with a trailing period ("mar."); the design reads "mar".
  const clean = (value: string) => value.replace(/\.$/, '');
  return {
    weekday: clean(WEEKDAY_FORMAT.format(instant)),
    weekdayLong: WEEKDAY_LONG_FORMAT.format(instant),
    day: instant.getUTCDate(),
    month: clean(MONTH_FORMAT.format(instant)),
    monthLong: MONTH_LONG_FORMAT.format(instant),
    monthIndex: instant.getUTCMonth(),
  };
}

/** "vie 12 mar" */
export function formatDayChip(date: string): string {
  const { weekday, day, month } = parts(date);
  return `${weekday} ${day} ${month}`;
}

/** "viernes 12 de marzo" */
export function formatDayLong(date: string): string {
  const { weekdayLong, day, monthLong } = parts(date);
  return `${weekdayLong} ${day} de ${monthLong}`;
}

/** "vie 12 – dom 14 mar" for a fair inside one month, otherwise "vie 27 mar – dom 5 abr". */
export function formatEventRange(days: Pick<EventDay, 'date'>[]): string {
  if (days.length === 0) return '';
  const first = parts(days[0].date);
  const last = parts(days[days.length - 1].date);
  if (days.length === 1) return `${first.weekday} ${first.day} ${first.month}`;
  if (first.monthIndex === last.monthIndex) {
    return `${first.weekday} ${first.day} – ${last.weekday} ${last.day} ${last.month}`;
  }
  return `${first.weekday} ${first.day} ${first.month} – ${last.weekday} ${last.day} ${last.month}`;
}
