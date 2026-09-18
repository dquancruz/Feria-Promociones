import {
  EVENT_TIMEZONE,
  todayInEventTimezone,
  type EventSettings,
  type EventSettingsInput,
  type EventUpdateResult,
} from '@feria/shared';
import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

interface SettingsRow {
  name: string;
  location: string;
  slot_minutes: number;
  registration_open: boolean;
}

interface DayRow {
  date: string;
  opens_at: string;
  closes_at: string;
}

// True when a registration's visit is not inside any configured day's opening hours.
// Only day and hours matter here (not slot alignment), so changing the slot length
// alone never flags people who were booked correctly under the old one.
export function outOfWindowSql(registrationAlias: string): string {
  const local = `(${registrationAlias}.attend_at AT TIME ZONE '${EVENT_TIMEZONE}')`;
  return `NOT EXISTS (
    SELECT 1 FROM event_days d
    WHERE d.day = ${local}::date AND ${local}::time >= d.opens_at AND ${local}::time < d.closes_at
  )`;
}

// Returns null only before the first-run seed has created the event.
export async function getEvent(
  db: Queryable,
  { fromDay }: { fromDay?: string } = {},
): Promise<EventSettings | null> {
  const {
    rows: [settings],
  } = await db.query<SettingsRow>(
    'SELECT name, location, slot_minutes, registration_open FROM event_settings WHERE id = 1',
  );
  if (!settings) return null;

  const { rows: days } = await db.query<DayRow>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS date,
            to_char(opens_at, 'HH24:MI') AS opens_at,
            to_char(closes_at, 'HH24:MI') AS closes_at
     FROM event_days
     WHERE ($1::date IS NULL OR day >= $1::date)
     ORDER BY day`,
    [fromDay ?? null],
  );

  return {
    name: settings.name,
    location: settings.location,
    timezone: EVENT_TIMEZONE,
    registrationOpen: settings.registration_open,
    slotMinutes: settings.slot_minutes,
    days: days.map((day) => ({ date: day.date, opensAt: day.opens_at, closesAt: day.closes_at })),
  };
}

// What visitors see: days that are already over are not offered.
export function getPublicEvent(db: Queryable): Promise<EventSettings | null> {
  return getEvent(db, { fromDay: todayInEventTimezone() });
}

export async function countOutOfWindowRegistrations(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM registrations r
     WHERE r.status = 'confirmed' AND ${outOfWindowSql('r')}`,
  );
  return Number(rows[0].count);
}

export async function replaceEvent(pool: Pool, input: EventSettingsInput): Promise<EventUpdateResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO event_settings (id, name, location, slot_minutes, registration_open, updated_at)
       VALUES (1, $1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, location = EXCLUDED.location, slot_minutes = EXCLUDED.slot_minutes,
           registration_open = EXCLUDED.registration_open, updated_at = now()`,
      [input.name, input.location, input.slotMinutes, input.registrationOpen],
    );

    // Registrations reference the instant they booked, not an event_days row, so replacing
    // the whole list is safe: nothing already confirmed is touched by this.
    await client.query('DELETE FROM event_days');
    if (input.days.length > 0) {
      await client.query(
        `INSERT INTO event_days (day, opens_at, closes_at)
         SELECT * FROM unnest($1::date[], $2::time[], $3::time[])`,
        [
          input.days.map((day) => day.date),
          input.days.map((day) => day.opensAt),
          input.days.map((day) => day.closesAt),
        ],
      );
    }

    const event = await getEvent(client);
    const outOfWindowCount = await countOutOfWindowRegistrations(client);
    await client.query('COMMIT');
    return { ...event!, outOfWindowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
