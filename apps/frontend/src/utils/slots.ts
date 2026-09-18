import { buildSlots, toAttendAtIso, type EventDay } from '@feria/shared';

/** The times of a day a visitor can still pick: none that have already passed, so a
 * visitor on the fair's own opening day is not offered 09:00 at noon. */
export function availableSlots(day: EventDay, slotMinutes: number, now: Date = new Date()): string[] {
  return buildSlots(day, slotMinutes).filter((time) => new Date(toAttendAtIso(day.date, time)) > now);
}
