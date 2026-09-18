import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { deleteStaleDrafts } from '../services/registrations.js';
import { createTestPool, resetDb, testAttendAt } from '../test/db.js';

const EMPTY_DRAFT = {
  status: 'draft',
  nombre: '',
  apellidos: '',
  email: '',
  attendAt: null,
  selectedItemIds: [],
};

describe('anonymous visitor session', () => {
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

  const registrationCount = async () =>
    Number((await pool.query<{ count: string }>('SELECT count(*) FROM registrations')).rows[0].count);

  const fullDraft = () => ({
    nombre: 'Ana',
    apellidos: 'Lopez',
    email: 'ana@example.com',
    attendAt: testAttendAt(),
    selectedItemIds: [serviceId],
  });

  describe('draft rows are created lazily', () => {
    it('does not write to the database when a visitor only opens the form', async () => {
      const agent = request.agent(createApp(pool));

      const first = await agent.get('/api/registrations/draft');
      await agent.get('/api/registrations/draft');

      expect(first.body).toEqual(EMPTY_DRAFT);
      expect(await registrationCount()).toBe(0);
    });

    it('does not write for an autosave that carries nothing (a pristine form)', async () => {
      const agent = request.agent(createApp(pool));

      const empty = await agent.patch('/api/registrations/draft').send({});
      const pristine = await agent.patch('/api/registrations/draft').send({
        nombre: '',
        apellidos: '  ',
        email: '',
        attendAt: null,
        selectedItemIds: [],
      });

      expect(empty.status).toBe(200);
      expect(pristine.body).toMatchObject({ ...EMPTY_DRAFT, discountPreview: expect.any(Object) });
      expect(await registrationCount()).toBe(0);
    });

    it('creates the row on the first autosave that has data, and reuses it afterwards', async () => {
      const agent = request.agent(createApp(pool));

      await agent.patch('/api/registrations/draft').send({ nombre: 'Ana' });
      await agent.patch('/api/registrations/draft').send({ apellidos: 'Lopez' });

      expect(await registrationCount()).toBe(1);
      expect((await agent.get('/api/registrations/draft')).body).toMatchObject({ nombre: 'Ana', apellidos: 'Lopez' });
    });

    it('still lets someone clear fields of a saved draft back to empty', async () => {
      const agent = request.agent(createApp(pool));
      await agent.patch('/api/registrations/draft').send({ nombre: 'Ana' });

      await agent.patch('/api/registrations/draft').send({ nombre: '' });

      expect((await agent.get('/api/registrations/draft')).body.nombre).toBe('');
    });

    it('answers a confirm without any saved draft with the required-field errors', async () => {
      const response = await request.agent(createApp(pool)).post('/api/registrations/confirm');

      expect(response.status).toBe(400);
      expect(Object.keys(response.body.fieldErrors)).toEqual(
        expect.arrayContaining(['nombre', 'apellidos', 'email', 'attendAt', 'selectedItemIds']),
      );
    });
  });

  describe('session reset', () => {
    it('gives the next person an empty form instead of the previous person\'s data', async () => {
      const agent = request.agent(createApp(pool));
      await agent.patch('/api/registrations/draft').send(fullDraft());
      expect((await agent.get('/api/registrations/draft')).body.nombre).toBe('Ana');

      const reset = await agent.post('/api/registrations/session/reset');

      expect(reset.status).toBe(204);
      expect((await agent.get('/api/registrations/draft')).body).toEqual(EMPTY_DRAFT);
    });

    it('lets the person after the reset save and confirm their own registration', async () => {
      const agent = request.agent(createApp(pool));
      await agent.patch('/api/registrations/draft').send(fullDraft());
      await agent.post('/api/registrations/session/reset');

      await agent.patch('/api/registrations/draft').send({ ...fullDraft(), nombre: 'Beto', email: 'beto@example.com' });
      const confirm = await agent.post('/api/registrations/confirm');

      expect(confirm.status).toBe(200);
      const { rows } = await pool.query('SELECT nombre, status FROM registrations ORDER BY nombre');
      expect(rows).toEqual([
        { nombre: 'Ana', status: 'draft' },
        { nombre: 'Beto', status: 'confirmed' },
      ]);
    });
  });

  describe('expiry in the middle of the form', () => {
    it('recovers when the session disappears, because every autosave carries the whole form', async () => {
      const agent = request.agent(createApp(pool));
      await agent.patch('/api/registrations/draft').send({ nombre: 'Ana' });

      // The 24 h session ran out (or was purged) while the form was still open.
      await pool.query('DELETE FROM session');

      const recovered = await agent.patch('/api/registrations/draft').send(fullDraft());
      const confirm = await agent.post('/api/registrations/confirm');

      expect(recovered.status).toBe(200);
      expect(recovered.body).toMatchObject({ nombre: 'Ana', selectedItemIds: [serviceId] });
      expect(confirm.status).toBe(200);
      expect(confirm.body.status).toBe('confirmed');
    });
  });

  describe('stale draft cleanup', () => {
    async function insertRegistration(sessionId: string, status: 'draft' | 'confirmed', ageDays: number) {
      await pool.query(
        `INSERT INTO registrations (session_id, status, nombre, created_at)
         VALUES ($1, $2, $1, now() - ($3 || ' days')::interval)`,
        [sessionId, status, String(ageDays)],
      );
    }

    it('removes unconfirmed drafts older than 7 days and nothing else', async () => {
      await insertRegistration('old-draft', 'draft', 8);
      await insertRegistration('recent-draft', 'draft', 6);
      await insertRegistration('old-confirmed', 'confirmed', 30);

      const removed = await deleteStaleDrafts(pool);

      expect(removed).toBe(1);
      const { rows } = await pool.query('SELECT nombre FROM registrations ORDER BY nombre');
      expect(rows.map((row) => row.nombre)).toEqual(['old-confirmed', 'recent-draft']);
    });

    it('removes the selected items of a deleted draft with it', async () => {
      await insertRegistration('old-draft', 'draft', 9);
      await pool.query(
        `INSERT INTO registration_items (registration_id, catalog_item_id, price_cents_snapshot)
         SELECT r.id, $1, 80000 FROM registrations r`,
        [serviceId],
      );

      await deleteStaleDrafts(pool);

      const { rows } = await pool.query('SELECT 1 FROM registration_items');
      expect(rows).toHaveLength(0);
    });

    it('does nothing when there is nothing stale', async () => {
      expect(await deleteStaleDrafts(pool)).toBe(0);
    });
  });
});
