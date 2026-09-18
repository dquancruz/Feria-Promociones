import { z } from 'zod';

// The fair happens in Guatemala: UTC-6 all year, no daylight saving. Everything the
// admin configures ("day", "opens at") is wall-clock time in that zone, while
// registrations store an absolute instant, so all the conversions live here.
export const EVENT_TIMEZONE = 'America/Guatemala';
const GUATEMALA_UTC_OFFSET_MINUTES = -6 * 60;
const MS_PER_MINUTE = 60_000;

export const SLOT_MINUTES_OPTIONS = [15, 30, 60] as const;
export const EVENT_NAME_MAX_LENGTH = 100;
export const EVENT_LOCATION_MAX_LENGTH = 200;
export const EVENT_MAX_DAYS = 31;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export const eventDateSchema = z
  .string({ invalid_type_error: 'Fecha inválida' })
  .refine(isRealDate, 'Fecha inválida, usa el formato AAAA-MM-DD');

export const eventTimeSchema = z
  .string({ invalid_type_error: 'Hora inválida' })
  .regex(TIME_PATTERN, 'Hora inválida, usa el formato HH:mm');

export const eventDaySchema = z
  .object({
    date: eventDateSchema,
    opensAt: eventTimeSchema,
    closesAt: eventTimeSchema,
  })
  .refine((day) => day.closesAt > day.opensAt, {
    message: 'La hora de cierre debe ser posterior a la de apertura',
    path: ['closesAt'],
  });
export type EventDay = z.infer<typeof eventDaySchema>;

const slotMinutesSchema = z
  .number({ invalid_type_error: 'Duración de franja inválida' })
  .refine((value) => SLOT_MINUTES_OPTIONS.some((option) => option === value), {
    message: 'La franja debe ser de 15, 30 o 60 minutos',
  });

// PUT /api/admin/event request body.
export const eventSettingsInputSchema = z.object({
  name: z
    .string({ invalid_type_error: 'Nombre inválido' })
    .trim()
    .min(1, 'El nombre del evento es requerido')
    .max(EVENT_NAME_MAX_LENGTH, `El nombre no puede superar ${EVENT_NAME_MAX_LENGTH} caracteres`),
  location: z
    .string({ invalid_type_error: 'Lugar inválido' })
    .trim()
    .max(EVENT_LOCATION_MAX_LENGTH, `El lugar no puede superar ${EVENT_LOCATION_MAX_LENGTH} caracteres`),
  slotMinutes: slotMinutesSchema,
  registrationOpen: z.boolean({ invalid_type_error: 'Valor inválido' }),
  days: z
    .array(eventDaySchema, { invalid_type_error: 'Días inválidos' })
    .max(EVENT_MAX_DAYS, `No puede haber más de ${EVENT_MAX_DAYS} días`)
    .refine((days) => new Set(days.map((day) => day.date)).size === days.length, 'Hay días repetidos'),
});
export type EventSettingsInput = z.infer<typeof eventSettingsInputSchema>;

// GET /api/event (public: only today's date onwards) and GET /api/admin/event (every day).
export const eventSettingsSchema = z.object({
  name: z.string(),
  location: z.string(),
  timezone: z.literal(EVENT_TIMEZONE),
  registrationOpen: z.boolean(),
  slotMinutes: z.number().int().positive(),
  days: z.array(eventDaySchema),
});
export type EventSettings = z.infer<typeof eventSettingsSchema>;

// PUT /api/admin/event response: the saved settings, plus how many already-confirmed
// registrations fall outside the new dates (they are reported, never modified).
export const eventUpdateResultSchema = eventSettingsSchema.extend({
  outOfWindowCount: z.number().int().nonnegative(),
});
export type EventUpdateResult = z.infer<typeof eventUpdateResultSchema>;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number): string {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Guatemala wall-clock day + time -> the absolute instant, as an ISO string in UTC.
export function toAttendAtIso(day: string, time: string): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const utcMs =
    Date.UTC(year, month - 1, dayOfMonth) +
    (toMinutes(time) - GUATEMALA_UTC_OFFSET_MINUTES) * MS_PER_MINUTE;
  return new Date(utcMs).toISOString();
}

// The inverse of toAttendAtIso: what day and time is it in Guatemala at this instant?
// 23:30 there is already the next day in UTC, which is why this can't just slice the ISO string.
export function splitAttendAt(value: string | Date): { day: string; time: string } {
  const instant = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid date');

  const local = new Date(instant.getTime() + GUATEMALA_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    day: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  };
}

// Today's date in Guatemala, whatever the server's own timezone is.
export function todayInEventTimezone(now: Date = new Date()): string {
  return splitAttendAt(now).day;
}

export function addDays(day: string, amount: number): string {
  const shifted = new Date(`${day}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + amount);
  return shifted.toISOString().slice(0, 10);
}

// Every selectable time for one day, counted from opening time: the last slot starts
// before closing time, so a 09:00-18:00 day with 30-minute slots ends at 17:30.
export function buildSlots(day: Pick<EventDay, 'opensAt' | 'closesAt'>, slotMinutes: number): string[] {
  const slots: string[] = [];
  const closes = toMinutes(day.closesAt);
  for (let minutes = toMinutes(day.opensAt); minutes < closes; minutes += slotMinutes) {
    slots.push(formatTime(minutes));
  }
  return slots;
}

// Is this instant a bookable slot: a configured day, between opening (inclusive) and
// closing (exclusive), on a slot boundary?
export function isWithinEvent(
  value: string | Date,
  settings: Pick<EventSettings, 'slotMinutes' | 'days'>,
): boolean {
  const instant = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) return false;
  if (instant.getUTCSeconds() !== 0 || instant.getUTCMilliseconds() !== 0) return false;

  const { day, time } = splitAttendAt(instant);
  const configured = settings.days.find((candidate) => candidate.date === day);
  if (!configured) return false;

  return buildSlots(configured, settings.slotMinutes).includes(time);
}
