import { addDays, toAttendAtIso } from '@feria/shared';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, resetDb, testAttendAt, TEST_EVENT_FIRST_DAY } from '../test/db.js';

const ADMIN_KEY = 'test-admin-key';

describe('deleting registrations from the admin', () => {
  let pool: Pool;
  let serviceId: string;
  let counter = 0;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
    const {
      rows: [service],
    } = await pool.query<{ id: string }>(
      "INSERT INTO catalog_items (type, name, price_cents) VALUES ('service', 'Diagnóstico', 10000) RETURNING id",
    );
    serviceId = service.id;
  });

  const app = () => createApp(pool);
  const del = (path: string) => request(app()).delete(path).set('x-admin-key', ADMIN_KEY);
  const post = (path: string, body: object) => request(app()).post(path).set('x-admin-key', ADMIN_KEY).send(body);

  const inside = () => testAttendAt('10:00');
  const outside = () => toAttendAtIso(addDays(TEST_EVENT_FIRST_DAY, 60), '10:00');

  async function insertRegistration(status: 'confirmed' | 'draft', attendAt: string, email?: string): Promise<string> {
    counter += 1;
    const {
      rows: [row],
    } = await pool.query<{ id: string }>(
      `INSERT INTO registrations (session_id, status, nombre, apellidos, email, attend_at, confirmed_at)
       VALUES ($1, $2, 'Ana', 'Lopez', $3, $4, $5)
       RETURNING id`,
      [
        `session-${counter}`,
        status,
        email ?? `person${counter}@example.com`,
        attendAt,
        status === 'confirmed' ? new Date() : null,
      ],
    );
    await pool.query(
      'INSERT INTO registration_items (registration_id, catalog_item_id, price_cents_snapshot) VALUES ($1, $2, 10000)',
      [row.id, serviceId],
    );
    return row.id;
  }

  const count = async (table = 'registrations') =>
    Number((await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)).rows[0].count);

  describe('DELETE /api/admin/registrations/:id', () => {
    it('deletes a confirmed registration together with its items', async () => {
      const id = await insertRegistration('confirmed', inside());
      const keep = await insertRegistration('confirmed', inside());

      const response = await del(`/api/admin/registrations/${id}`);

      expect(response.status).toBe(204);
      const { rows } = await pool.query<{ id: string }>('SELECT id FROM registrations');
      expect(rows.map((row) => row.id)).toEqual([keep]);
      expect(await count('registration_items')).toBe(1);
    });

    it('frees the email so the person can register again', async () => {
      const id = await insertRegistration('confirmed', inside(), 'ana@example.com');
      await del(`/api/admin/registrations/${id}`);

      const agent = request.agent(app());
      await agent.patch('/api/registrations/draft').send({
        nombre: 'Ana',
        apellidos: 'Lopez',
        email: 'ana@example.com',
        attendAt: inside(),
      });
      const confirm = await agent.post('/api/registrations/confirm');

      expect(confirm.status).toBe(200);
    });

    it('answers 404 for an id that does not exist', async () => {
      const response = await del('/api/admin/registrations/00000000-0000-4000-8000-000000000000');

      expect(response.status).toBe(404);
    });

    it('never deletes a draft, which is somebody else’s form in progress', async () => {
      const id = await insertRegistration('draft', inside());

      const response = await del(`/api/admin/registrations/${id}`);

      expect(response.status).toBe(404);
      expect(await count()).toBe(1);
    });

    it('rejects an id that is not a UUID', async () => {
      const response = await del('/api/admin/registrations/not-an-id');

      expect(response.status).toBe(400);
    });

    it('requires admin access', async () => {
      const id = await insertRegistration('confirmed', inside());

      const response = await request(app()).delete(`/api/admin/registrations/${id}`);

      expect(response.status).toBe(401);
      expect(await count()).toBe(1);
    });
  });

  describe('POST /api/admin/registrations/delete-out-of-window', () => {
    it('deletes only the confirmed registrations outside the event dates', async () => {
      await insertRegistration('confirmed', outside());
      await insertRegistration('confirmed', outside());
      const kept = await insertRegistration('confirmed', inside());
      const draft = await insertRegistration('draft', outside());

      const response = await post('/api/admin/registrations/delete-out-of-window', { expectedCount: 2 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: 2 });
      const { rows } = await pool.query<{ id: string }>('SELECT id FROM registrations');
      expect(rows.map((row) => row.id).sort()).toEqual([kept, draft].sort());
      expect(await count('registration_items')).toBe(2);
    });

    it('deletes nothing and answers 409 when the number is not the one the admin was shown', async () => {
      await insertRegistration('confirmed', outside());
      await insertRegistration('confirmed', outside());

      const response = await post('/api/admin/registrations/delete-out-of-window', { expectedCount: 1 });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: 'count_changed', count: 2 });
      expect(await count()).toBe(2);
    });

    it('is a harmless no-op when there is nothing to delete and the admin expected nothing', async () => {
      await insertRegistration('confirmed', inside());

      const response = await post('/api/admin/registrations/delete-out-of-window', { expectedCount: 0 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: 0 });
      expect(await count()).toBe(1);
    });

    it('requires the expected count', async () => {
      await insertRegistration('confirmed', outside());

      const response = await post('/api/admin/registrations/delete-out-of-window', {});

      expect(response.status).toBe(400);
      expect(await count()).toBe(1);
    });

    it('requires admin access', async () => {
      await insertRegistration('confirmed', outside());

      const response = await request(app())
        .post('/api/admin/registrations/delete-out-of-window')
        .send({ expectedCount: 1 });

      expect(response.status).toBe(401);
      expect(await count()).toBe(1);
    });
  });
});
