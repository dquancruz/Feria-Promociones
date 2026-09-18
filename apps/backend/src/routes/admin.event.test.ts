import { addDays, toAttendAtIso, todayInEventTimezone } from '@feria/shared';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb, setTestEvent, testAttendAt, TEST_EVENT_FIRST_DAY } from '../test/db.js';

const ADMIN_KEY = 'test-admin-key';

interface NewConfirmed {
  nombre: string;
  apellidos?: string;
  email: string;
  attendAt: string | null;
  itemIds?: string[];
}

describe('admin event settings, filters and stats', () => {
  let pool: Pool;
  let items: Record<string, string>;
  let sessionCounter = 0;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
    const { rows } = await pool.query<{ id: string; name: string }>(
      `INSERT INTO catalog_items (type, name, price_cents) VALUES
       ('service', 'Diagnóstico', 10000),
       ('service', 'Instalación', 75000),
       ('product', 'Semilla', 5000)
       RETURNING id, name`,
    );
    items = Object.fromEntries(rows.map((row) => [row.name, row.id]));
  });

  const get = (path: string) => request(createApp(pool)).get(path).set('x-admin-key', ADMIN_KEY);
  const put = (path: string, body: object) =>
    request(createApp(pool)).put(path).set('x-admin-key', ADMIN_KEY).send(body);

  async function insertConfirmed(registration: NewConfirmed): Promise<string> {
    sessionCounter += 1;
    const {
      rows: [row],
    } = await pool.query<{ id: string }>(
      `INSERT INTO registrations (session_id, status, nombre, apellidos, email, attend_at, confirmed_at)
       VALUES ($1, 'confirmed', $2, $3, $4, $5, now() - ($6 || ' minutes')::interval)
       RETURNING id`,
      [
        `session-${sessionCounter}`,
        registration.nombre,
        registration.apellidos ?? 'Lopez',
        registration.email,
        registration.attendAt,
        String(sessionCounter),
      ],
    );
    for (const itemId of registration.itemIds ?? []) {
      await pool.query(
        `INSERT INTO registration_items (registration_id, catalog_item_id, price_cents_snapshot)
         SELECT $1, id, price_cents FROM catalog_items WHERE id = $2`,
        [row.id, itemId],
      );
    }
    return row.id;
  }

  const validEvent = {
    name: 'Feria 2027',
    location: 'Centro de Convenciones',
    slotMinutes: 15,
    registrationOpen: true,
    days: [{ date: addDays(TEST_EVENT_FIRST_DAY, 10), opensAt: '08:00', closesAt: '12:00' }],
  };

  describe('GET /api/admin/event', () => {
    it('includes days that already passed, unlike the public endpoint', async () => {
      const pastDay = addDays(todayInEventTimezone(), -2);
      await setTestEvent(pool, { days: [{ date: pastDay, opensAt: '09:00', closesAt: '12:00' }] });

      const admin = await get('/api/admin/event');
      const publicEvent = await request(createApp(pool)).get('/api/event');

      expect(admin.body.days).toEqual([{ date: pastDay, opensAt: '09:00', closesAt: '12:00' }]);
      expect(publicEvent.body.days).toEqual([]);
    });

    it('requires admin access', async () => {
      expect((await request(createApp(pool)).get('/api/admin/event')).status).toBe(401);
    });
  });

  describe('PUT /api/admin/event', () => {
    it('saves the settings, replaces the days and shows them to the public', async () => {
      const response = await put('/api/admin/event', validEvent);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ...validEvent, timezone: 'America/Guatemala', outOfWindowCount: 0 });

      const publicEvent = await request(createApp(pool)).get('/api/event');
      expect(publicEvent.body).toMatchObject({ name: 'Feria 2027', slotMinutes: 15, registrationOpen: true });
      expect(publicEvent.body.days).toEqual(validEvent.days);
    });

    it('can close registration and clear every day', async () => {
      const response = await put('/api/admin/event', { ...validEvent, registrationOpen: false, days: [] });

      expect(response.status).toBe(200);
      expect(response.body.registrationOpen).toBe(false);
      expect(response.body.days).toEqual([]);
    });

    it('reports confirmed registrations left outside the new dates without touching them', async () => {
      const inside = await insertConfirmed({
        nombre: 'Dentro',
        email: 'dentro@example.com',
        attendAt: toAttendAtIso(validEvent.days[0].date, '09:00'),
      });
      const outsideDay = await insertConfirmed({
        nombre: 'Otro dia',
        email: 'otro@example.com',
        attendAt: testAttendAt('10:00'),
      });
      const afterClosing = await insertConfirmed({
        nombre: 'Tarde',
        email: 'tarde@example.com',
        attendAt: toAttendAtIso(validEvent.days[0].date, '13:00'),
      });

      const response = await put('/api/admin/event', validEvent);

      expect(response.body.outOfWindowCount).toBe(2);
      const { rows } = await pool.query<{ id: string; status: string }>(
        'SELECT id, status FROM registrations ORDER BY nombre',
      );
      expect(rows.every((row) => row.status === 'confirmed')).toBe(true);
      expect(new Set(rows.map((row) => row.id))).toEqual(new Set([inside, outsideDay, afterClosing]));
    });

    it('does not count unconfirmed drafts as out of window', async () => {
      await pool.query(`INSERT INTO registrations (session_id, attend_at) VALUES ('draft-session', $1)`, [
        testAttendAt(),
      ]);

      const response = await put('/api/admin/event', validEvent);

      expect(response.body.outOfWindowCount).toBe(0);
    });

    it.each([
      ['duplicate days', { days: [validEvent.days[0], validEvent.days[0]] }],
      ['a day closing before it opens', { days: [{ ...validEvent.days[0], closesAt: '07:00' }] }],
      ['a day closing when it opens', { days: [{ ...validEvent.days[0], closesAt: '08:00' }] }],
      ['an impossible date', { days: [{ ...validEvent.days[0], date: '2027-02-30' }] }],
      ['a malformed time', { days: [{ ...validEvent.days[0], opensAt: '8am' }] }],
      ['an unsupported slot length', { slotMinutes: 20 }],
      ['a blank name', { name: '   ' }],
      ['a missing days list', { days: undefined }],
    ])('rejects %s and saves nothing', async (_label, override) => {
      const response = await put('/api/admin/event', { ...validEvent, ...override });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('validation_failed');
      const saved = await get('/api/admin/event');
      expect(saved.body.name).toBe('Feria de Promociones');
    });

    it('requires admin access', async () => {
      const response = await request(createApp(pool)).put('/api/admin/event').send(validEvent);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/registrations', () => {
    it('returns items with their type and price, and flags visits outside the event dates', async () => {
      await insertConfirmed({
        nombre: 'Dentro',
        email: 'dentro@example.com',
        attendAt: testAttendAt('10:00'),
        itemIds: [items['Instalación'], items['Diagnóstico'], items['Semilla']],
      });
      await insertConfirmed({
        nombre: 'Fuera',
        email: 'fuera@example.com',
        attendAt: toAttendAtIso(addDays(TEST_EVENT_FIRST_DAY, 20), '10:00'),
      });

      const { body } = await get('/api/admin/registrations');
      const byName = Object.fromEntries(body.registrations.map((r: { nombre: string }) => [r.nombre, r]));

      expect(byName.Dentro.outOfWindow).toBe(false);
      expect(byName.Dentro.items).toEqual([
        { name: 'Diagnóstico', type: 'service', priceCents: 10000 },
        { name: 'Instalación', type: 'service', priceCents: 75000 },
        { name: 'Semilla', type: 'product', priceCents: 5000 },
      ]);
      expect(byName.Fuera.outOfWindow).toBe(true);
    });

    describe('filters', () => {
      beforeEach(async () => {
        await insertConfirmed({
          nombre: 'María',
          apellidos: 'Pérez',
          email: 'mperez@example.com',
          attendAt: testAttendAt('10:00'),
        });
        await insertConfirmed({
          nombre: 'José',
          apellidos: 'Gómez',
          email: 'jose@corp.test',
          attendAt: testAttendAt('10:00', 1),
        });
        await insertConfirmed({
          nombre: 'Luisa',
          apellidos: 'Ramírez',
          email: 'luisa@example.com',
          attendAt: testAttendAt('11:00', 1),
        });
      });

      const names = (body: { registrations: { nombre: string }[] }) =>
        body.registrations.map((r) => r.nombre).sort();

      it.each([
        ['maria', ['María']],
        ['MARÍA', ['María']],
        ['perez', ['María']],
        ['gomez', ['José']],
        ['@corp.test', ['José']],
        ['zzz', []],
        ['o', ['José', 'Luisa', 'María']],
      ])('searches name, surname and email ignoring case and accents: %s', async (q, expected) => {
        const { body } = await get(`/api/admin/registrations?q=${encodeURIComponent(q)}`);

        expect(names(body)).toEqual(expected);
        expect(body.total).toBe(expected.length);
      });

      it('filters by the visit day', async () => {
        const { body } = await get(`/api/admin/registrations?day=${addDays(TEST_EVENT_FIRST_DAY, 1)}`);

        expect(names(body)).toEqual(['José', 'Luisa']);
        expect(body.total).toBe(2);
      });

      it('combines the day and the search', async () => {
        const { body } = await get(`/api/admin/registrations?day=${addDays(TEST_EVENT_FIRST_DAY, 1)}&q=jose`);

        expect(names(body)).toEqual(['José']);
      });

      it('treats a blank filter as no filter', async () => {
        const { body } = await get('/api/admin/registrations?q=&day=');

        expect(body.total).toBe(3);
      });

      it('rejects a malformed day', async () => {
        const response = await get('/api/admin/registrations?day=manana');

        expect(response.status).toBe(400);
      });

      it('assigns a late-evening visit to the Guatemala day, not the UTC day', async () => {
        await insertConfirmed({
          nombre: 'Noche',
          email: 'noche@example.com',
          attendAt: toAttendAtIso(TEST_EVENT_FIRST_DAY, '23:30'),
        });

        const { body } = await get(`/api/admin/registrations?day=${TEST_EVENT_FIRST_DAY}`);

        expect(names(body)).toEqual(['María', 'Noche']);
      });

      it('paginates the filtered results and keeps the total', async () => {
        const { body } = await get('/api/admin/registrations?q=o&limit=2&offset=0');

        expect(body.registrations).toHaveLength(2);
        expect(body.total).toBe(3);
      });

      it('applies the same filters to the CSV export', async () => {
        const response = await get('/api/admin/registrations.csv?q=jose');

        expect(response.headers['content-disposition']).toContain('attachment');
        expect(response.text).toContain('jose@corp.test');
        expect(response.text).not.toContain('mperez@example.com');
      });
    });
  });

  describe('GET /api/admin/stats', () => {
    it('is empty when nothing has happened', async () => {
      const { body } = await get('/api/admin/stats');

      expect(body).toEqual({ confirmedTotal: 0, byDay: [], topItems: [], draftsStarted: 0 });
    });

    it('summarizes confirmations per day, the most requested items and open drafts', async () => {
      const service = items['Diagnóstico'];
      const otherService = items['Instalación'];
      const product = items['Semilla'];
      await insertConfirmed({
        nombre: 'A',
        email: 'a@example.com',
        attendAt: testAttendAt('10:00'),
        itemIds: [service, product],
      });
      await insertConfirmed({
        nombre: 'B',
        email: 'b@example.com',
        attendAt: testAttendAt('11:00'),
        itemIds: [service, otherService],
      });
      await insertConfirmed({
        nombre: 'C',
        email: 'c@example.com',
        attendAt: testAttendAt('10:00', 1),
        itemIds: [service],
      });
      // Drafts and their items must not leak into the confirmed numbers.
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO registrations (session_id) VALUES ('draft-1'), ('draft-2') RETURNING id`,
      );
      await pool.query(
        `INSERT INTO registration_items (registration_id, catalog_item_id, price_cents_snapshot) VALUES ($1, $2, 5000)`,
        [rows[0].id, product],
      );

      const { body } = await get('/api/admin/stats');

      expect(body.confirmedTotal).toBe(3);
      expect(body.byDay).toEqual([
        { date: TEST_EVENT_FIRST_DAY, count: 2 },
        { date: addDays(TEST_EVENT_FIRST_DAY, 1), count: 1 },
      ]);
      expect(body.topItems).toEqual([
        { name: 'Diagnóstico', type: 'service', count: 3 },
        { name: 'Instalación', type: 'service', count: 1 },
        { name: 'Semilla', type: 'product', count: 1 },
      ]);
      expect(body.draftsStarted).toBe(2);
    });

    it('lists at most five items', async () => {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO catalog_items (type, name, price_cents)
         SELECT 'product', 'Extra ' || n, 1000 FROM generate_series(1, 4) AS n RETURNING id`,
      );
      await insertConfirmed({
        nombre: 'A',
        email: 'a@example.com',
        attendAt: testAttendAt(),
        itemIds: [...Object.values(items), ...rows.map((row) => row.id)],
      });

      const { body } = await get('/api/admin/stats');

      expect(body.topItems).toHaveLength(5);
    });

    it('requires admin access', async () => {
      expect((await request(createApp(pool)).get('/api/admin/stats')).status).toBe(401);
    });
  });
});
