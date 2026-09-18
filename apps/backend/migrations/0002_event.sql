-- Single-row table: there is exactly one event, whose settings the admin edits.
CREATE TABLE event_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Feria de Promociones',
  location TEXT NOT NULL DEFAULT '',
  slot_minutes SMALLINT NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15, 30, 60)),
  registration_open BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wall-clock opening hours in America/Guatemala for each day of the fair.
CREATE TABLE event_days (
  day DATE PRIMARY KEY,
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  CHECK (closes_at > opens_at)
);
