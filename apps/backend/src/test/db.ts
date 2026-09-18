import { addDays, toAttendAtIso, todayInEventTimezone, type EventDay } from '@feria/shared';
import { Pool } from 'pg';
import { runMigrations } from '../db/migrate.js';

// Computed from today so these tests keep passing as time goes by: the event is always
// in the future, which is what confirming a registration requires.
export const TEST_EVENT_FIRST_DAY = addDays(todayInEventTimezone(), 7);

export const DEFAULT_TEST_EVENT_DAYS: EventDay[] = [0, 1, 2].map((offset) => ({
  date: addDays(TEST_EVENT_FIRST_DAY, offset),
  opensAt: '09:00',
  closesAt: '18:00',
}));

// A valid slot inside the default test event (first day, 10:00 Guatemala time by default).
export function testAttendAt(time = '10:00', dayOffset = 0): string {
  return toAttendAtIso(addDays(TEST_EVENT_FIRST_DAY, dayOffset), time);
}

export interface TestEventOptions {
  registrationOpen?: boolean;
  slotMinutes?: 15 | 30 | 60;
  days?: EventDay[];
}

export async function setTestEvent(
  pool: Pool,
  { registrationOpen = true, slotMinutes = 30, days = DEFAULT_TEST_EVENT_DAYS }: TestEventOptions = {},
): Promise<void> {
  await pool.query('TRUNCATE event_days, event_settings');
  await pool.query('INSERT INTO event_settings (id, slot_minutes, registration_open) VALUES (1, $1, $2)', [
    slotMinutes,
    registrationOpen,
  ]);
  for (const day of days) {
    await pool.query('INSERT INTO event_days (day, opens_at, closes_at) VALUES ($1, $2, $3)', [
      day.date,
      day.opensAt,
      day.closesAt,
    ]);
  }
}

export async function createTestPool(): Promise<Pool> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await runMigrations(pool);
  return pool;
}

export async function resetDb(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE registration_items, registrations, catalog_items RESTART IDENTITY CASCADE');
  await setTestEvent(pool);
}
