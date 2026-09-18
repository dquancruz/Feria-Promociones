import { addDays, todayInEventTimezone } from '@feria/shared';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { seedEvent } from '../db/seed.js';
import { createTestPool, resetDb, setTestEvent, testAttendAt, TEST_EVENT_FIRST_DAY } from '../test/db.js';

describe('event configuration', () => {
  let pool: Pool;
  let serviceId: string;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO catalog_items (type, name, price_cents) VALUES ('service', 'Servicio A', 80000) RETURNING id`,
    );
    serviceId = rows[0].id;
  });

  async function confirmAt(attendAt: string, email = 'ana@example.com') {
    const app = createApp(pool);
    const agent = request.agent(app);
    await agent.patch('/api/registrations/draft').send({
      nombre: 'Ana',
      apellidos: 'Lopez',
      email,
      attendAt,
      selectedItemIds: [serviceId],
    });
    return agent.post('/api/registrations/confirm');
  }

  describe('GET /api/event', () => {
    it('is public and describes the event in the fair\'s timezone', async () => {
      const response = await request(createApp(pool)).get('/api/event');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Feria de Promociones',
        location: '',
        timezone: 'America/Guatemala',
        registrationOpen: true,
        slotMinutes: 30,
      });
      expect(response.body.days).toEqual([
        { date: TEST_EVENT_FIRST_DAY, opensAt: '09:00', closesAt: '18:00' },
        { date: addDays(TEST_EVENT_FIRST_DAY, 1), opensAt: '09:00', closesAt: '18:00' },
        { date: addDays(TEST_EVENT_FIRST_DAY, 2), opensAt: '09:00', closesAt: '18:00' },
      ]);
    });

    it('lists days in order and leaves out the ones that already passed', async () => {
      const today = todayInEventTimezone();
      await setTestEvent(pool, {
        days: [
          { date: addDays(today, 5), opensAt: '09:00', closesAt: '12:00' },
          { date: addDays(today, -3), opensAt: '09:00', closesAt: '12:00' },
          { date: today, opensAt: '13:00', closesAt: '17:00' },
          { date: addDays(today, 2), opensAt: '10:00', closesAt: '14:00' },
        ],
      });

      const response = await request(createApp(pool)).get('/api/event');

      expect(response.body.days.map((day: { date: string }) => day.date)).toEqual([
        today,
        addDays(today, 2),
        addDays(today, 5),
      ]);
    });

    it('answers 404 when no event has been created yet', async () => {
      await pool.query('TRUNCATE event_days, event_settings');

      const response = await request(createApp(pool)).get('/api/event');

      expect(response.status).toBe(404);
    });
  });

  describe('seedEvent', () => {
    beforeEach(async () => {
      await pool.query('TRUNCATE event_days, event_settings');
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('creates an open sample event of three consecutive days starting a month from now', async () => {
      await seedEvent(pool);

      const response = await request(createApp(pool)).get('/api/event');
      const firstDay = addDays(todayInEventTimezone(), 30);
      expect(response.body.registrationOpen).toBe(true);
      expect(response.body.days).toEqual([
        { date: firstDay, opensAt: '09:00', closesAt: '18:00' },
        { date: addDays(firstDay, 1), opensAt: '09:00', closesAt: '18:00' },
        { date: addDays(firstDay, 2), opensAt: '09:00', closesAt: '18:00' },
      ]);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('sample'));
    });

    it('never overwrites an event that already exists', async () => {
      await seedEvent(pool);
      await pool.query("UPDATE event_settings SET name = 'Mi feria'");
      await pool.query('DELETE FROM event_days');

      await seedEvent(pool);

      const { rows } = await pool.query('SELECT name, (SELECT count(*) FROM event_days)::int AS days FROM event_settings');
      expect(rows).toEqual([{ name: 'Mi feria', days: 0 }]);
    });
  });

  describe('confirming against the event schedule', () => {
    it('accepts the opening slot and the last slot before closing', async () => {
      expect((await confirmAt(testAttendAt('09:00'))).status).toBe(200);
      expect((await confirmAt(testAttendAt('17:30'), 'luis@example.com')).status).toBe(200);
    });

    it.each([
      ['exactly at closing time', testAttendAt('18:00')],
      ['before opening', testAttendAt('08:30')],
      ['in the middle of the night', testAttendAt('03:00')],
      ['on a day that is not configured', testAttendAt('10:00', 5)],
      ['off the slot grid', testAttendAt('10:10')],
      ['years from now', '2099-01-01T16:00:00.000Z'],
    ])('rejects a visit %s', async (_label, attendAt) => {
      const response = await confirmAt(attendAt);

      expect(response.status).toBe(400);
      expect(response.body.fieldErrors.attendAt).toBe('Elige un día y una hora dentro del horario de la feria.');
    });

    it('aligns slots to the configured slot length', async () => {
      await setTestEvent(pool, { slotMinutes: 60 });

      expect((await confirmAt(testAttendAt('10:30'))).status).toBe(400);
      expect((await confirmAt(testAttendAt('10:00'))).status).toBe(200);
    });

    it('answers 403 registration_closed while registration is closed', async () => {
      await setTestEvent(pool, { registrationOpen: false });

      const response = await confirmAt(testAttendAt());

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('registration_closed');
    });

    it('answers 403 when the event has not been configured at all', async () => {
      await pool.query('TRUNCATE event_days, event_settings');

      const response = await confirmAt(testAttendAt());

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('registration_closed');
    });

    it('still returns the existing confirmation on a repeat confirm after registration closed', async () => {
      const app = createApp(pool);
      const agent = request.agent(app);
      await agent.patch('/api/registrations/draft').send({
        nombre: 'Ana',
        apellidos: 'Lopez',
        email: 'ana@example.com',
        attendAt: testAttendAt(),
        selectedItemIds: [serviceId],
      });
      const first = await agent.post('/api/registrations/confirm');
      await setTestEvent(pool, { registrationOpen: false });

      const second = await agent.post('/api/registrations/confirm');

      expect(second.status).toBe(409);
      expect(second.body).toEqual(first.body);
    });
  });
});
