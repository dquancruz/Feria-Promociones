import { splitAttendAt } from '@feria/shared';
import { formatDayChip } from '../../utils/eventFormat';

/** "vie 25 sept, 10:30" in Guatemala time, or a dash when the visit was never set. */
export function formatVisit(attendAt: string | null): string {
  if (!attendAt) return '—';
  const { day, time } = splitAttendAt(attendAt);
  return `${formatDayChip(day)}, ${time}`;
}
